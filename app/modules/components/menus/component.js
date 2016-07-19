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
var moment = require('moment'),
	filesystem = require('fs'),
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
						'hasTimestamps': true
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

		this.$router.get('/menus-defaults/:id', this._getMenu.bind(this));
		this.$router.post('/menus-defaults', this._addMenu.bind(this));
		this.$router.patch('/menus-defaults/:id', this._updateMenu.bind(this));
		this.$router.delete('/menus-defaults/:id', this._deleteMenu.bind(this));
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
			if(hasPermission) {
				return dbSrvc.raw('SELECT * FROM menus');
			}

			throw new Error('Unauthorized Access');
		})
		.then(function(menuList) {
			var responseData = { 'data': [] };
			menuList.rows.forEach(function(menu) {
				responseData.data.push({
					'id': menu.id,
					'name': menu.name,
					'component': '',
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

	'_getMenu': function(request, response, next) {
		var self = this,
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

			return new self.$MenuModel({ 'id': request.params.id }).fetch();
		})
		.then(function(menusData) {
			menusData = self['$jsonApiMapper'].map(menusData, 'menus-default');

			var promiseResolutions = [];
			promiseResolutions.push(menusData);
			promiseResolutions.push(dbSrvc.raw('SELECT permission FROM module_widgets WHERE id = ?', [ menusData.data.attributes['module_widget'] ]));
			return promises.all(promiseResolutions);
		})
		.then(function(results) {
			var menusData = results[0];
			delete menusData.included;
			delete menusData.data.attributes['module_widget'];

			if(results[1].rows.length) {
				menusData.data.attributes.permission = results[1].rows[0].permission;
			}

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
			moduleId = null,
			permission = null,
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
			promiseResolutions.push(dbSrvc.raw('UPDATE module_widgets SET permission = ? WHERE id = (SELECT module_widget FROM menus WHERE id = ?)', [permission, jsonDeserializedData.id]));
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

	'name': 'menus',
	'basePath': __dirname,
	'dependencies': ['configuration-service', 'database-service', 'logger-service']
});

exports.component = menusComponent;
