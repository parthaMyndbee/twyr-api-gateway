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
	var databaseSrvc = this.dependencies['database-service'],
		loggerSrvc = this.dependencies['logger-service'];

	// Setup the models...
	var UserSocialLogins = databaseSrvc.Model.extend({
		'tableName': 'social_logins',
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

		return promises.all([UserSocialLogins.where({ 'user_id': userId }).fetchAll(), databaseUser]);
	})
	.then(function(results) {
		var user = results.pop(),
			socialLogins = (results.pop()).toJSON();

		for(var idx in socialLogins) {
			var thisSocial = socialLogins[idx];
			user.social[thisSocial.provider] = {
				'id': thisSocial.profileId,
				'display_name': thisSocial.display_name
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
	var databaseSrvc = this.dependencies['database-service'],
		loggerSrvc = this.dependencies['logger-service'];

	if(deserializedUser['tenants'] == undefined)
		deserializedUser['tenants'] = {};

	databaseSrvc.knex.raw('SELECT A.tenant_id AS tenant, B.permission_id AS permission FROM groups A INNER JOIN group_permissions B ON (A.id = B.group_id) WHERE A.id IN (SELECT group_id FROM tenant_user_groups WHERE user_id = ?)', [deserializedUser.id])
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

exports.utility = {
	'name' : 'userSessionCache',
	'method' : function(userId, callback) {
		var cacheSrvc = this.dependencies['cache-service'],
			loggerSrvc = this.dependencies['logger-service'];

		// Sanity change...
		if(!userId) userId = 'public';

		// Promisify the other methods we need
		retrieveUserFromDatabase = promises.promisify(retrieveUserFromDatabase.bind(this));
		getUserPermissionsByTenant = promises.promisify(getUserPermissionsByTenant.bind(this));

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
			// Step 4: Store this data in the cache for future use
			.then(function(databaseUser) {
				var cacheMulti = promises.promisifyAll(cacheSrvc.multi());

				cacheMulti.setAsync('twyr!portal!user!' + databaseUser.id, JSON.stringify(databaseUser));
				cacheMulti.expireAsync('twyr!portal!user!' + databaseUser.id, 86400);

				return promises.all([cacheMulti.execAsync(), databaseUser]);
			})
			// Finally, return
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
