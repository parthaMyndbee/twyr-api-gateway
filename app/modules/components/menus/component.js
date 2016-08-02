/*
 * Name			: app/modules/components/menus/component.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Menus Component - provides functionality to allow users to created /edit / delete menus
 *
 */

"use strict";

/**
 * Module dependencies, required for ALL Twy'r modules
 */
var base = require('./../component-base').baseComponent,
	prime = require('prime'),
	promises = require('bluebird');

/**
 * Module dependencies, required for this module
 */
var inflection = require('inflection'),
	moment = require('moment'),
	path = require('path'),
	uuid = require('node-uuid');

var menusComponent = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);
	},

	'start': function(dependencies, callback) {
		var self = this,
			configSrvc = dependencies['configuration-service'],
			dbSrvc = dependencies['database-service'],
			loggerSrvc = dependencies['logger-service'];

		menusComponent.parent.start.call(self, dependencies, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			configSrvc.getModuleIdAsync(self)
			.then(function(id) {
				return dbSrvc.knex.raw('SELECT id FROM module_permissions WHERE module = ? AND name = ?', [id, 'menu-author']);
			})
			.then(function(menuAuthorPermissionId) {
				self['$menuAuthorPermissionId'] = menuAuthorPermissionId.rows[0].id;

				// Define the models....
				Object.defineProperty(self, '$MenuModel', {
					'__proto__': null,
					'writable': true,

					'value': dbSrvc.Model.extend({
						'tableName': 'menus',
						'idAttribute': 'id',
						'hasTimestamps': true,

						'menuItems': function() {
							return this.hasMany(self.$MenuItemModel, 'menu');
						}
					})
				});

				Object.defineProperty(self, '$MenuItemModel', {
					'__proto__': null,
					'writable': true,

					'value': dbSrvc.Model.extend({
						'tableName': 'menu_items',
						'idAttribute': 'id',
						'hasTimestamps': true,

						'menu': function() {
							return this.belongsTo(self.$MenuModel, 'menu');
						},

						'parent': function() {
							return this.belongsTo(self.$MenuItemModel, 'parent');
						},

						'children': function() {
							return this.hasMany(self.$MenuItemModel, 'parent');
						},

						'componentMenu': function() {
							return this.belongsTo(self.$ComponentMenuModel, 'module_menu');
						}
					})
				});

				Object.defineProperty(self, '$ComponentMenuModel', {
					'__proto__': null,
					'writable': true,

					'value': dbSrvc.Model.extend({
						'tableName': 'module_menus',
						'idAttribute': 'id',
						'hasTimestamps': true,

						'parent': function() {
							return this.belongsTo(self.$ComponentMenuModel, 'parent');
						},

						'children': function() {
							return this.hasMany(self.$ComponentMenuModel, 'parent');
						}
					})
				});

				if(callback) callback(null, status);
				return null;
			})
			.catch(function(startErr) {
				loggerSrvc.error(self.name + '::start Error: ', startErr);
				if(callback) callback(startErr);
			});
		});
	},

	'_addRoutes': function() {
		this.$router.get('/type-list', this._getMenuTypeList.bind(this));
		this.$router.get('/list', this._getMenuList.bind(this));
		this.$router.get('/component-menus', this._getComponentMenuList.bind(this));

		this.$router.get('/menus-defaults/:id', this._getMenu.bind(this));
		this.$router.post('/menus-defaults', this._addMenu.bind(this));
		this.$router.patch('/menus-defaults/:id', this._updateMenu.bind(this));
		this.$router.delete('/menus-defaults/:id', this._deleteMenu.bind(this));

		this.$router.get('/menu-items/:id', this._getMenuItem.bind(this));
		this.$router.post('/menu-items', this._addMenuItem.bind(this));
		this.$router.patch('/menu-items/:id', this._updateMenuItem.bind(this));
		this.$router.delete('/menu-items/:id', this._deleteMenuItem.bind(this));

		this.$router.get('/component-menus/:id', this._getComponentMenu.bind(this));
	},

	'_getMenuTypeList': function(request, response, next) {
		var self = this,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.silly('Servicing request "' + request.path + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params);
		response.type('application/javascript');

		self.dependencies['database-service'].knex.raw('SELECT unnest(enum_range(NULL::menu_type)) AS type;')
		.then(function(statuses) {
			var responseData = [];
			for(var idx in statuses.rows) {
				responseData.push(statuses.rows[idx]['type']);
			}

			response.status(200).json(responseData);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request "' + request.path + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(422).json({ 'code': 422, 'message': err.message || err.detail || 'Error fetching publish statuses from the database' });
		});
	},

	'_getMenuList': function(request, response, next) {
		var self = this,
			dbSrvc = (self.dependencies['database-service']).knex,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$menuAuthorPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return dbSrvc.raw('SELECT A.id, A.name, A.type, A.status, C.display_name AS permission, A.created_at, A.updated_at FROM menus A INNER JOIN module_widgets B ON (A.module_widget = B.id) INNER JOIN module_permissions C ON (B.permission = C.id)');
		})
		.then(function(menuList) {
			var responseData = { 'data': [] };
			menuList.rows.forEach(function(menu) {
				responseData.data.push({
					'id': menu.id,
					'name': menu.name,
					'type': inflection.capitalize(menu.type),
					'status': inflection.capitalize(menu.status),
					'permission': menu.permission,
					'created': moment(menu.created_at).format('DD/MMM/YYYY hh:mm A'),
					'updated': moment(menu.updated_at).format('DD/MMM/YYYY hh:mm A')
				})
			});

			response.status(200).json(responseData);
			return null;
		})
		.catch(function(err) {
			self.dependencies['logger-service'].error(self.name + '::_selectTemplates Error: ', err);
			response.sendStatus(500);
		});
	},

	'_getComponentMenuList': function(request, response, next) {
		var self = this,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$menuAuthorPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return self.$ComponentMenuModel
			.forge({ 'parent': null })
			.fetchAll();
		})
		.then(function(componentMenus) {
			componentMenus = self['$jsonApiMapper'].map(componentMenus, 'component-menu', {
				'relations': true,
				'disableLinks': true
			});

			delete componentMenus.included;
			response.status(200).json(componentMenus);

			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Get menus error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_getMenu': function(request, response, next) {
		var self = this,
			menuWidgetPermission = null,
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		dbSrvc.raw('SELECT permission FROM module_widgets WHERE id = (SELECT module_widget FROM menus WHERE id = ?)', [request.params.id])
		.then(function(permission) {
			menuWidgetPermission = permission.rows[0].permission;
			return self._checkPermissionAsync(request.user, menuWidgetPermission);
		})
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return self.$MenuModel
			.forge({ 'id': request.params.id })
			.fetch();
		})
		.then(function(menusData) {
			menusData = self['$jsonApiMapper'].map(menusData, 'menus-default', {
				'relations': true,
				'disableLinks': true
			});

			menusData.data.attributes.permission = menuWidgetPermission;

			delete menusData.included;
			delete menusData.data.attributes['module_widget'];

			var promiseResolutions = [];
			promiseResolutions.push(menusData);
			promiseResolutions.push(dbSrvc.raw('SELECT id FROM menu_items WHERE menu = ? AND module_menu IS NULL', [request.params.id]));
			promiseResolutions.push(dbSrvc.raw('SELECT id FROM menu_items WHERE menu = ? AND module_menu IS NOT NULL AND module_menu IN (SELECT id FROM module_menus WHERE permission IN (SELECT permission FROM fn_get_user_permissions(?)))', [request.params.id, request.user.id]));
			return promises.all(promiseResolutions);
		})
		.then(function(menuItemsData) {
			var menusData = menuItemsData.shift(),
				menuItems = (menuItemsData.shift()).rows,
				componentMenuItems = (menuItemsData.shift()).rows;

			menusData.data.relationships = { 'menu_items': { 'data': null } };
			if((menuItems.length + componentMenuItems.length) == 0) {
				response.status(200).json(menusData);
				return null;
			}

			if((menuItems.length + componentMenuItems.length) == 1) {
				menusData.data.relationships['menu_items'].data = {
					'type': 'menu-items',
					'id': (menuItems.length > 0) ? menuItems[0].id : componentMenuItems[0].id
				};

				response.status(200).json(menusData);
				return null;
			}

			menusData.data.relationships['menu_items'].data = [];
			menuItems.forEach(function(menuItem) {
				menusData.data.relationships['menu_items'].data.push({
					'type': 'menu-items',
					'id': menuItem.id
				});
			});

			componentMenuItems.forEach(function(componentMenuItem) {
				menusData.data.relationships['menu_items'].data.push({
					'type': 'menu-items',
					'id': componentMenuItem.id
				});
			});

			response.status(200).json(menusData);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Get menus error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_addMenu': function(request, response, next) {
		var self = this,
			permission = null,
			moduleId = null,
			configSrvc = self.dependencies['configuration-service'],
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		configSrvc.getModuleIdAsync(self)
		.then(function(id) {
			moduleId = id;
			return self._checkPermissionAsync(request.user, self['$menuAuthorPermissionId']);
		})
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return self['$jsonApiDeserializer'].deserializeAsync(request.body);
		})
		.then(function(jsonDeserializedData) {
			permission = jsonDeserializedData.permission;

			delete jsonDeserializedData.permission;
			delete jsonDeserializedData.created_at;
			delete jsonDeserializedData.updated_at;

			var promiseResolutions = [];
			promiseResolutions.push(jsonDeserializedData);
			promiseResolutions.push(dbSrvc.raw('INSERT INTO module_widgets(module, permission, ember_component, display_name, metadata) VALUES(?, ?, ?, ?, ?) RETURNING id', [moduleId, permission, 'menu-' + jsonDeserializedData.id, jsonDeserializedData.name + ' Widget', {}]));
			return promises.all(promiseResolutions);
		})
		.then(function(results) {
			var jsonDeserializedData = results[0];
			jsonDeserializedData['module_widget'] = results[1].rows[0].id;

			return self.$MenuModel
			.forge()
			.save(jsonDeserializedData, {
				'method': 'insert',
				'patch': false
			});
		})
		.then(function(savedRecord) {
			response.status(200).json({
				'data': {
					'type': request.body.data.type,
					'id': savedRecord.get('id')
				}
			});

			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Add menu error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_updateMenu': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'],
			permission = null;

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$menuAuthorPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return self['$jsonApiDeserializer'].deserializeAsync(request.body);
		})
		.then(function(jsonDeserializedData) {
			permission = jsonDeserializedData.permission;

			delete jsonDeserializedData.permission;
			delete jsonDeserializedData.created_at;
			delete jsonDeserializedData.updated_at;

			var promiseResolutions = [];
			promiseResolutions.push(jsonDeserializedData);
			promiseResolutions.push(dbSrvc.raw('UPDATE module_widgets SET display_name = ?, permission = ? WHERE id = (SELECT module_widget FROM menus WHERE id = ?)', [jsonDeserializedData.name + ' Widget', permission, jsonDeserializedData.id]));
			return promises.all(promiseResolutions);
		})
		.then(function(results) {
			var jsonDeserializedData = results[0];

			return self.$MenuModel
			.forge()
			.save(jsonDeserializedData, {
				'method': 'update',
				'patch': true
			});
		})
		.then(function(result) {
			response.status(200).json({
				'data': {
					'type': request.body.data.type,
					'id': request.params.id
				}
			});

			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Update menu error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_deleteMenu': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$menuAuthorPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return dbSrvc.raw('DELETE FROM module_widgets WHERE id = (SELECT module_widget FROM menus WHERE id = ?)', [request.params.id]);
		})
		.then(function() {
			return new self.$MenuModel({ 'id': request.params.id }).destroy();
		})
		.then(function() {
			response.status(204).json({});
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Delete menu error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_getMenuItem': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		dbSrvc.raw('SELECT permission FROM module_widgets WHERE id = (SELECT module_widget FROM menus WHERE id = (SELECT menu FROM menu_items WHERE id = ?))', [request.params.id])
		.then(function(permission) {
			return self._checkPermissionAsync(request.user, permission.rows[0].permission);
		})
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return new self.$MenuItemModel({ 'id': request.params.id })
			.fetch({ 'withRelated': ['menu', 'parent', 'componentMenu'] });
		})
		.then(function(menuItemsData) {
			var promiseResolutions = [];
			promiseResolutions.push(menuItemsData);
			if(menuItemsData.get('module_menu')) {
				promiseResolutions.push(dbSrvc.raw('SELECT COUNT(permission) AS permission FROM module_menus WHERE id = ? AND permission IN (SELECT permission FROM fn_get_user_permissions(?))', [menuItemsData.get('module_menu'), request.user.id]));
			}
			else {
				promiseResolutions.push({
					'rows': [{
						'permission': 1
					}]
				})
			}
			return promises.all(promiseResolutions);
		})
		.then(function(results) {
			var menuItemsData = results[0],
				hasPermission = results[1].rows[0].permission;

			if(hasPermission == 0) {
				throw new Error('Unauthorized Access');
			}

			menuItemsData = self['$jsonApiMapper'].map(menuItemsData, 'menu-items', {
				'relations': true,
				'disableLinks': true
			});

			if(menuItemsData.data.relationships.menu) {
				menuItemsData.data.relationships.menu.data.type = 'menus-defaults';
			}

			if(menuItemsData.data.relationships.component_menu) {
				menuItemsData.data.relationships.component_menu.data.type = 'component-menus';
			}

			if(menuItemsData.data.relationships.parent) {
				menuItemsData.data.relationships.parent.data.type = 'menu-items';
			}

			delete menuItemsData.included;

			var promiseResolutions = [];
			promiseResolutions.push(menuItemsData);
			promiseResolutions.push(dbSrvc.raw('SELECT id FROM menu_items WHERE menu = ? AND parent = ? AND module_menu IS NULL', [menuItemsData.data.relationships.menu.data.id, request.params.id]));
			promiseResolutions.push(dbSrvc.raw('SELECT id FROM menu_items WHERE menu = ? AND parent = ? AND module_menu IS NOT NULL AND module_menu IN (SELECT id FROM module_menus WHERE permission IN (SELECT permission FROM fn_get_user_permissions(?)))', [menuItemsData.data.relationships.menu.data.id, request.params.id, request.user.id]));
			return promises.all(promiseResolutions);
		})
		.then(function(submenuItemsData) {
			var menusItemsData = submenuItemsData.shift(),
				menuItems = (submenuItemsData.shift()).rows,
				componentMenuItems = (submenuItemsData.shift()).rows;

			menusItemsData.data.relationships['children'] = { 'data': null };
			if((menuItems.length + componentMenuItems.length) == 0) {
				response.status(200).json(menusItemsData);
				return null;
			}

			if((menuItems.length + componentMenuItems.length) == 1) {
				menusItemsData.data.relationships['children'].data = {
					'type': 'menu-items',
					'id': (menuItems.length > 0) ? menuItems[0].id : componentMenuItems[0].id
				};

				response.status(200).json(menusData);
				return null;
			}

			menusItemsData.data.relationships['children'].data = [];
			menuItems.forEach(function(menuItem) {
				menusItemsData.data.relationships['children'].data.push({
					'type': 'menu-items',
					'id': menuItem.id
				});
			});

			componentMenuItems.forEach(function(componentMenuItem) {
				menusItemsData.data.relationships['children'].data.push({
					'type': 'menu-items',
					'id': componentMenuItem.id
				});
			});

			response.status(200).json(menusItemsData);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Get menu items error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_addMenuItem': function(request, response, next) {
		var self = this,
			permission = null,
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$menuAuthorPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return self['$jsonApiDeserializer'].deserializeAsync(request.body);
		})
		.then(function(jsonDeserializedData) {
			console.log('jsonDeserializedData: ' + JSON.stringify(jsonDeserializedData, null, '\t'));

			jsonDeserializedData.menu = request.body.data.relationships.menu.data.id;
			if(request.body.data.relationships.component_menu.data) {
				jsonDeserializedData.module_menu = request.body.data.relationships.component_menu.data.id;
			}

			if(request.body.data.relationships.parent.data) {
				jsonDeserializedData.parent = request.body.data.relationships.parent.data.id;
			}

			delete jsonDeserializedData.component_menu;
			delete jsonDeserializedData.created_at;
			delete jsonDeserializedData.updated_at;

			return self.$MenuItemModel
			.forge()
			.save(jsonDeserializedData, {
				'method': 'insert',
				'patch': false
			});
		})
		.then(function(savedRecord) {
			response.status(200).json({
				'data': {
					'type': request.body.data.type,
					'id': savedRecord.get('id')
				}
			});

			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Add menu error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_updateMenuItem': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'],
			permission = null;

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$menuAuthorPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return self['$jsonApiDeserializer'].deserializeAsync(request.body);
		})
		.then(function(jsonDeserializedData) {
			jsonDeserializedData.menu = request.body.data.relationships.menu.data.id;
			if(request.body.data.relationships.component_menu && request.body.data.relationships.component_menu.data) {
				jsonDeserializedData.module_menu = request.body.data.relationships.component_menu.data.id;
			}

			if(request.body.data.relationships.parent && request.body.data.relationships.parent.data) {
				jsonDeserializedData.parent = request.body.data.relationships.parent.data.id;
			}

			delete jsonDeserializedData.component_menu;
			delete jsonDeserializedData.created_at;
			delete jsonDeserializedData.updated_at;

			return self.$MenuItemModel
			.forge()
			.save(jsonDeserializedData, {
				'method': 'update',
				'patch': true
			});
		})
		.then(function(result) {
			response.status(200).json({
				'data': {
					'type': request.body.data.type,
					'id': request.params.id
				}
			});

			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Update menu error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_deleteMenuItem': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$menuAuthorPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return new self.$MenuItemModel({ 'id': request.params.id }).destroy();
		})
		.then(function() {
			response.status(204).json({});
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Delete menu error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_getComponentMenu': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self.$ComponentMenuModel
		.forge({ 'id': request.params.id })
		.fetch({ 'withRelated': ['parent', 'children'] })
		.then(function(componentMenu) {
			return promises.all([componentMenu, self._checkPermissionAsync(request.user, componentMenu.get('permission'))]);
		})
		.then(function(results) {
			var componentMenu = results[0],
				hasPermission = results[1];

			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			componentMenu = self['$jsonApiMapper'].map(componentMenu, 'component-menu', {
				'relations': true,
				'disableLinks': true
			});

			if(componentMenu.data.relationships.parent) {
				componentMenu.data.relationships.parent.data.type = 'component-menu';
			}

			if(componentMenu.data.relationships.children) {
				if(Array.isArray(componentMenu.data.relationships.children.data)) {
					componentMenu.data.relationships.children.data.forEach(function(menuItem) {
						menuItem.type = 'component-menu';
					});
				}
				else {
					componentMenu.data.relationships.children.data.type = 'component-menu';
				}
			}

			delete componentMenu.included;
			response.status(200).json(componentMenu);

			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Get menus error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},


	'name': 'menus',
	'basePath': __dirname,
	'dependencies': ['configuration-service', 'database-service', 'logger-service']
});

exports.component = menusComponent;
