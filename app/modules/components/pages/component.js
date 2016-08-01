/*
 * Name			: app/modules/components/pages/component.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Pages Component - provides functionality to allow users to created /edit / delete pages
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

var pagesComponent = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);
	},

	'start': function(dependencies, callback) {
		var self = this,
			configSrvc = dependencies['configuration-service'],
			dbSrvc = dependencies['database-service'],
			loggerSrvc = dependencies['logger-service'];

		pagesComponent.parent.start.call(self, dependencies, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			configSrvc.getModuleIdAsync(self)
			.then(function(id) {
				return dbSrvc.knex.raw('SELECT id FROM module_permissions WHERE module = ? AND name = ?', [id, 'page-author']);
			})
			.then(function(pageAuthorPermissionId) {
				self['$pageAuthorPermissionId'] = pageAuthorPermissionId.rows[0].id;

				// Define the models....
				Object.defineProperty(self, '$UserModel', {
					'__proto__': null,
					'writable': true,

					'value': dbSrvc.Model.extend({
						'tableName': 'users',
						'idAttribute': 'id',
						'hasTimestamps': true
					})
				});

				Object.defineProperty(self, '$PageModel', {
					'__proto__': null,
					'writable': true,

					'value': dbSrvc.Model.extend({
						'tableName': 'pages',
						'idAttribute': 'id',
						'hasTimestamps': true,

						'author': function() {
							return this.belongsTo(self.$UserModel, 'author');
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
		this.$router.get('/list', this._getPageList.bind(this));

		this.$router.get('/pages-defaults/:id', this._getPage.bind(this));
		this.$router.post('/pages-defaults', this._addPage.bind(this));
		this.$router.patch('/pages-defaults/:id', this._updatePage.bind(this));
		this.$router.delete('/pages-defaults/:id', this._deletePage.bind(this));

		this.$router.get('/page-views/:id', this._getReadonlyPage.bind(this));
	},

	'_getPageList': function(request, response, next) {
		var self = this,
			dbSrvc = (self.dependencies['database-service']).knex,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$pageAuthorPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return dbSrvc.raw('SELECT A.id, A.title, B.first_name || \' \' || B.last_name AS author, A.status, D.display_name AS permission, A.created_at AS created, A.updated_at AS updated FROM pages A INNER JOIN users B ON (A.author = B.id) INNER JOIN module_menus C ON (C.ember_route = \'"page-view", "\' || A.id || \'"\') INNER JOIN module_permissions D ON (D.id = C.permission)');
		})
		.then(function(pageList) {
			var responseData = { 'data': [] };
			pageList.rows.forEach(function(page) {
				responseData.data.push({
					'id': page.id,
					'title': page.title,
					'author': page.author,
					'status': inflection.capitalize(page.status),
					'permission': inflection.capitalize(page.permission),
					'created': moment(page.created).format('DD/MMM/YYYY hh:mm A'),
					'updated': moment(page.updated).format('DD/MMM/YYYY hh:mm A')
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

	'_getPage': function(request, response, next) {
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
			return self._checkPermissionAsync(request.user, self['$pageAuthorPermissionId']);
		})
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return new self.$PageModel({ 'id': request.params.id }).fetch({ 'withRelated': ['author'] });
		})
		.then(function(pagesData) {
			pagesData = self['$jsonApiMapper'].map(pagesData, 'pages-default', {
				'relations': true,
				'disableLinks': true
			});
			pagesData.data.relationships.author.data.type = 'profiles';

			var promiseResolutions = [];
			promiseResolutions.push(pagesData);
			promiseResolutions.push(dbSrvc.raw('SELECT permission FROM module_menus WHERE module = ? AND ember_route = ?', [moduleId, '"page-view", "' + request.params.id + '"']));

			return promises.all(promiseResolutions);
		})
		.then(function(results) {
			var pagesData = results[0],
				permRow = results[1].rows[0];

			pagesData.data.attributes.permission = permRow ? permRow.permission : null;

			delete pagesData.included;
			response.status(200).json(pagesData);

			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Get pages error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_addPage': function(request, response, next) {
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
			return self._checkPermissionAsync(request.user, self['$pageAuthorPermissionId']);
		})
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return self['$jsonApiDeserializer'].deserializeAsync(request.body);
		})
		.then(function(jsonDeserializedData) {
			jsonDeserializedData.author = request.user.id;
			permission = jsonDeserializedData.permission;
			delete jsonDeserializedData.permission;

			return self.$PageModel
			.forge()
			.save(jsonDeserializedData, {
				'method': 'insert',
				'patch': false
			});
		})
		.then(function(savedRecord) {
			var promiseResolutions = [];

			promiseResolutions.push(savedRecord);
			promiseResolutions.push(dbSrvc.raw('INSERT INTO module_menus(module, permission, category, ember_route, icon_class, display_name) VALUES(?, ?, ?, ?, ?, ?)', [moduleId, permission, 'Pages', '"page-view", "' + savedRecord.get('id') + '"', 'fa fa-edit', savedRecord.get('title')]));

			return promises.all(promiseResolutions);
		})
		.then(function(results) {
			response.status(200).json({
				'data': {
					'type': request.body.data.type,
					'id': results[0].get('id')
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
					'title': 'Add page error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_updatePage': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'],
			permission = null;

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$pageAuthorPermissionId'])
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

			return self.$PageModel
			.forge()
			.save(jsonDeserializedData, {
				'method': 'update',
				'patch': true
			});
		})
		.then(function(savedRecord) {
			return promises.all([savedRecord, dbSrvc.raw('UPDATE module_menus SET permission = ? WHERE ember_route = ?', [permission, '"page-view", "' + request.params.id + '"'])]);
		})
		.then(function(result) {
			response.status(200).json({
				'data': {
					'type': request.body.data.type,
					'id': result[0].get('id')
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
					'title': 'Update page error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_deletePage': function(request, response, next) {
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
			return self._checkPermissionAsync(request.user, self['$pageAuthorPermissionId']);
		})
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return dbSrvc.raw('DELETE FROM module_menus WHERE module = ? AND ember_route = ?', [moduleId, '"page-view", "' + request.params.id + '"']);
		})
		.then(function() {
			return new self.$PageModel({ 'id': request.params.id }).destroy();
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
					'title': 'Delete page error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_getReadonlyPage': function(request, response, next) {
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
			return new self.$PageModel({ 'id': request.params.id }).fetch({ 'withRelated': ['author'] });
		})
		.then(function(pagesData) {
			pagesData = self['$jsonApiMapper'].map(pagesData, 'page-views', {
				'relations': true,
				'disableLinks': true
			});
			pagesData.data.attributes.author = pagesData.included[0].attributes.first_name + ' ' + pagesData.included[0].attributes.last_name;

			var promiseResolutions = [];
			promiseResolutions.push(pagesData);
			promiseResolutions.push(dbSrvc.raw('SELECT id, name FROM module_permissions WHERE id = (SELECT permission FROM module_menus WHERE module = ? AND ember_route = ?)', [moduleId, '"page-view", "' + request.params.id + '"']));

			if(request.user)
				promiseResolutions.push(self._checkPermissionAsync(request.user, self['$pageAuthorPermissionId']));
			else
				promiseResolutions.push(false);

			return promises.all(promiseResolutions);
		})
		.then(function(results) {
			var pagesData = results[0],
				pagePermission = results[1].rows[0],
				hasPermission = results[2];

			if(hasPermission) {
				return [pagesData, true];
			}

			if(pagesData.data.attributes.status !== 'published') {
				throw new Error('Unauthorized access!');
			}

			if(pagePermission.name == 'public') {
				return [pagesData, true];
			}

			if(request.user && (pagePermission.name == 'registered')) {
				return [pagesData, true];
			}

			return promises.all([pagesData, self._checkPermissionAsync(request.user, pagePermission.id)]);
		})
		.then(function(results) {
			var pagesData = results[0],
				hasPermission = results[1];

			if(!hasPermission) {
				throw new Error(pagesData.data.attributes.title + ' is not accessible to ' + (request.user ? (request.user.first_name + ' ' + request.suer.last_name) : 'the Public'));
			}

			delete pagesData.data.relationships;
			delete pagesData.included;
			response.status(200).json(pagesData);

			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Get pages error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'name': 'pages',
	'basePath': __dirname,
	'dependencies': ['configuration-service', 'database-service', 'logger-service']
});

exports.component = pagesComponent;
