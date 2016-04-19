/*
 * Name			: app/modules/utilities/user-session-cache/utility.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.6.1
 * Copyright	: Copyright (c) 2014 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MIT License (http://opensource.org/licenses/MIT).
 * Description	: The Twy'r API Gateway Utility Method to retrieve and cache user details
 *
 */


"use strict";

/**
 * Module dependencies.
 */
var promises = require('bluebird');

var retrieveUserFromDatabase = function(userId, callback) {
	var databaseSrvc = this.$services['database-service'].getInterface(),
		loggerSrvc = this.$services['logger-service'].getInterface();

	if(userId == 'public') {
		callback(null, { 'id': 'public', 'default_home': 'home', 'social': {} });
		return;
	}

	// Setup the models...
	var UserSocialLogins = databaseSrvc.Model.extend({
		'tableName': 'user_social_logins',
		'idAttribute': 'id',

		'user': function() {
			return this.hasMany(User, 'user_id');
		}
	});

	var User = databaseSrvc.Model.extend({
		'tableName': 'users',
		'idAttribute': 'id',

		'social': function() {
			return this.hasMany(UserSocialLogins, 'user_id');
		}
	});

	User.where({ 'id': userId })
	.fetch()
	.then(function(user) {
		if(!user) {
			throw (new Error('User Not Found: ' + userId));
			return;
		}

		var databaseUser = user.toJSON();
		delete databaseUser.password;

		return promises.all([user.save({ 'last_login': (new Date()).toISOString() }, { 'method': 'update', 'patch': true }), databaseSrvc.knex.raw('SELECT ember_route FROM component_menus WHERE id = \'' + databaseUser.default_home + '\''), databaseUser]);
	})
	.then(function(results) {
		var user = results.pop(),
			emberRoute = results.pop();

		user.default_home = emberRoute.rows[0].ember_route;
		return promises.all([UserSocialLogins.where({ 'user_id': userId }).fetchAll(), user]);
	})
	.then(function(results) {
		var user = results.pop(),
			socialLogins = (results.pop()).toJSON();

		for(var idx in socialLogins) {
			var thisSocial = socialLogins[idx];
			user.social[thisSocial.provider] = {
				'id': thisSocial.profile_id,
				'displayName': thisSocial.profile_displayname
			};
		}

		callback(null, user);
		return null;
	})
	.catch(function(err) {
		loggerSrvc.error('userSessionCache::retrieveUserFromDatabase Error:\nUser Id: ', userId, 'Error: ', err);
		callback(err);
	});
};

var getUserPermissionsByTenant = function(deserializedUser, callback) {
	var databaseSrvc = this.$services['database-service'].getInterface(),
		loggerSrvc = this.$services['logger-service'].getInterface();

	if(deserializedUser['tenants'] == undefined)
		deserializedUser['tenants'] = {};

	if(deserializedUser.id == 'public') {
		deserializedUser.tenants['public'] = {};
		(deserializedUser.tenants['public']).id = 'public';
		(deserializedUser.tenants['public']).permissions = ['ffffffff-ffff-ffff-ffff-ffffffffffff'];
		(deserializedUser.tenants['public']).menus = [];
		(deserializedUser.tenants['public']).widgets = [];

		callback(null, deserializedUser);
		return;
	}

	databaseSrvc.knex.raw('SELECT A.tenant_id AS tenant, B.component_permission_id AS permission FROM groups A INNER JOIN group_component_permissions B ON (A.id = B.group_id) WHERE A.id IN (SELECT group_id FROM users_groups WHERE user_id = ?) AND B.component_permission_id != \'ffffffff-ffff-ffff-ffff-ffffffffffff\'', [deserializedUser.id])
	.then(function(tenantPermissions) {
		tenantPermissions = tenantPermissions.rows;
		for(var idx in tenantPermissions) {
			var thisTenantId = (tenantPermissions[idx]).tenant,
				thisPermissionId = (tenantPermissions[idx]).permission;

			if(!deserializedUser.tenants[thisTenantId]) {
				deserializedUser.tenants[thisTenantId] = {};
				(deserializedUser.tenants[thisTenantId]).id = thisTenantId;
				(deserializedUser.tenants[thisTenantId]).permissions = [];
			}

			var thisUserTenant = deserializedUser.tenants[thisTenantId];
			if(thisUserTenant.permissions.indexOf(thisPermissionId) < 0) {
				thisUserTenant.permissions.push(thisPermissionId);
			}
		}

		callback(null, deserializedUser);
		return null;
	})
	.catch(function(err) {
		loggerSrvc.error('userSessionCache::getUserPermissionsByTenant Error:\nUser Id: ', deserializedUser.id, 'Error: ', err);
		callback(err);
	});
};

var getUserMenus = function(deserializedUser, callback) {
	var databaseSrvc = this.$services['database-service'].getInterface(),
		loggerSrvc = this.$services['logger-service'].getInterface();

	var promiseResolutions = [],
		usedPermissions = [];

	for(var idx in deserializedUser.tenants) {
		var thisTenant = deserializedUser.tenants[idx];
		thisTenant.permissions.forEach(function(permissionId) {
			if(usedPermissions.indexOf(permissionId) >= 0) return;

			usedPermissions.push(permissionId);
			promiseResolutions.push(databaseSrvc.knex.raw('SELECT * FROM fn_get_component_menus(\'' + permissionId + '\', 10);'));
		});
	}

	promises.all(promiseResolutions)
	.then(function(menusByPermission) {
		usedPermissions.forEach(function(permissionId ,idx) {
			var thisPermissionMenus = menusByPermission[idx].rows;

			Object.keys(deserializedUser.tenants).forEach(function(thisTenantId) {
				var thisUserTenant = deserializedUser.tenants[thisTenantId];
				if(!thisUserTenant.menus) thisUserTenant.menus = [];

				if(thisUserTenant.permissions.indexOf(permissionId) >= 0) {
					thisUserTenant.menus = thisUserTenant.menus.concat(thisPermissionMenus);
				}
			});
		});

		callback(null, deserializedUser);
		return null;
	})
	.catch(function(err) {
		loggerSrvc.error('userSessionCache::getUserMenus Error:\nUser Id: ', deserializedUser.id, 'Error: ', err);
		callback(err);
	});
};

var reorgUserMenus = function(deserializedUser, callback) {
	// Re-organize menus according to Tenant, and parent/child menu hierarchy
	Object.keys(deserializedUser.tenants).forEach(function(thisTenantId) {
		var thisUserTenantMenus = (deserializedUser.tenants[thisTenantId]).menus,
			reorgedMenus = [];

		var reorgFn = function(menuArray, parentId) {
			thisUserTenantMenus.forEach(function(thisMenu) {
				if(thisMenu.parent_id != parentId) return;

				menuArray.push({
					'id': thisMenu.id,
					'icon_class': thisMenu.icon_class,
					'display_name': thisMenu.display_name,
					'tooltip': thisMenu.tooltip,
					'ember_route': thisMenu.ember_route,
					'subRoutes': []
				});
			});

			menuArray.forEach(function(menuItem) {
				reorgFn(menuItem.subRoutes, menuItem.id);
			});
		};

		reorgFn(reorgedMenus, null);
		(deserializedUser.tenants[thisTenantId]).menus = reorgedMenus;
	});

	callback(null, deserializedUser);
};

var getUserWidgets = function(deserializedUser, callback) {
	var databaseSrvc = this.$services['database-service'].getInterface(),
		loggerSrvc = this.$services['logger-service'].getInterface();

	var promiseResolutions = [],
		usedPermissions = [];

	for(var idx in deserializedUser.tenants) {
		var thisTenant = deserializedUser.tenants[idx];
		thisTenant.permissions.forEach(function(permissionId) {
			if(usedPermissions.indexOf(permissionId) >= 0) return;

			usedPermissions.push(permissionId);
			promiseResolutions.push(databaseSrvc.knex.raw('SELECT * FROM fn_get_component_widgets(\'' + permissionId + '\');'));
		});
	}

	promises.all(promiseResolutions)
	.then(function(widgetsByPermission) {
		usedPermissions.forEach(function(permissionId, idx) {
			var thisPermissionWidgets = widgetsByPermission[idx].rows;

			Object.keys(deserializedUser.tenants).forEach(function(thisTenantId) {
				var thisUserTenant = deserializedUser.tenants[thisTenantId];
				if(!thisUserTenant.widgets) thisUserTenant.widgets = [];

				if(thisUserTenant.permissions.indexOf(permissionId) >= 0) {
					thisUserTenant.widgets = thisUserTenant.widgets.concat(thisPermissionWidgets);
				}
			});
		});

		callback(null, deserializedUser);
		return null;
	})
	.catch(function(err) {
		loggerSrvc.error('userSessionCache::getUserWidgets Error:\nUser Id: ', deserializedUser.id, 'Error: ', err);
		callback(err);
	});
};

var reorgUserWidgets = function(deserializedUser, callback) {
	// Re-organize widgets according to Tenant, display position, and order of display within that position
	Object.keys(deserializedUser.tenants).forEach(function(thisTenantId) {
		var thisUserTenantWidgets = (deserializedUser.tenants[thisTenantId]).widgets,
			reorgedWidgets = {};

		thisUserTenantWidgets.forEach(function(thisWidget) {
			if(!thisWidget.position_name) return;

			if(!reorgedWidgets[thisWidget.position_name])
				reorgedWidgets[thisWidget.position_name] = [];

			if((reorgedWidgets[thisWidget.position_name]).length) {
				var existingWidgets = (reorgedWidgets[thisWidget.position_name]).filter(function(item) {
					return item.id == thisWidget.id;
				});

				if(existingWidgets.length)
					return;
			}

			(reorgedWidgets[thisWidget.position_name]).push(thisWidget);
		});

		Object.keys(reorgedWidgets).forEach(function(position) {
			var widgetsInThisPosition = reorgedWidgets[position];

			widgetsInThisPosition.sort(function(left, right) {
				return (left.display_order - right.display_order);
			});
		});

		(deserializedUser.tenants[thisTenantId]).widgets = reorgedWidgets;
	});

	callback(null, deserializedUser);
};

exports.utility = {
	'name' : 'userSessionCache',
	'method' : function(userId, callback) {
		var cacheSrvc = this.$services['cache-service'].getInterface(),
			loggerSrvc = this.$services['logger-service'].getInterface(),
			self = this;

		// Sanity change...
		if(!userId) userId = 'public';

		// Promisify the other methods we need
		retrieveUserFromDatabase = promises.promisify(retrieveUserFromDatabase.bind(this));
		getUserPermissionsByTenant = promises.promisify(getUserPermissionsByTenant.bind(this));
		getUserMenus = promises.promisify(getUserMenus.bind(this));
		reorgUserMenus = promises.promisify(reorgUserMenus.bind(this));
		getUserWidgets = promises.promisify(getUserWidgets.bind(this));
		reorgUserWidgets = promises.promisify(reorgUserWidgets.bind(this));

		// Check if the cache already has the data...
		cacheSrvc.getAsync('twyr!portal!user!' + userId)
		.then(function(cachedData) {
			// Step 1: If User's data is already cached, simply return it....
			if(cachedData) {
				cachedData = JSON.parse(cachedData);
				if(cachedData.tenants) {
					callback(null, cachedData);
					return null;
				}
			}

			// Step 2: Get User from database
			retrieveUserFromDatabase(userId)
			// Step 3: Get User's permissions
			.then(function(databaseUser) {
				return getUserPermissionsByTenant(databaseUser);
			})
			// Step 4: Get User's menus
			.then(function(databaseUser) {
				return getUserMenus(databaseUser);
			})
			// Step 5: Re-org menus according to parent-child rel, display order, etc.
			.then(function(databaseUser) {
				return reorgUserMenus(databaseUser);
			})
			// Step 6: Get User's widgets
			.then(function(databaseUser) {
				return getUserWidgets(databaseUser);
			})
			// Step 7: Re-org widgets according to position, display order, etc.
			.then(function(databaseUser) {
				return reorgUserWidgets(databaseUser);
			})
			// Step 8: Store this data in the database for future use
			.then(function(databaseUser) {
				var cacheMulti = promises.promisifyAll(cacheSrvc.multi());

				cacheMulti.setAsync('twyr!portal!user!' + databaseUser.id, JSON.stringify(databaseUser));
				cacheMulti.expireAsync('twyr!portal!user!' + databaseUser.id, self.$config.session.ttl);

				return promises.all([cacheMulti.execAsync(), databaseUser]);
			})
			// Step 9: Finally, return
			.then(function(results) {
				var databaseUser = results.pop();
				callback(null, databaseUser);
			})
			.catch(function(err) {
				loggerSrvc.error('userSessionCache Error:\nUser Id: ', userId, 'Error: ', err);
				callback(err);
			});

			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('userSessionCache Error:\nUser Id: ', userId, 'Error: ', err);
			callback(err);
		});
	}
};
