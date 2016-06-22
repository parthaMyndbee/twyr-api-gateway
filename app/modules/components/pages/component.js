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
var moment = require('moment');

var pagesComponent = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);
	},

	'start': function(dependencies, callback) {
		var self = this,
			configSrvc = dependencies['configuration-service'],
			dbSrvc = (dependencies['database-service']).knex,
			loggerSrvc = dependencies['logger-service'];

		pagesComponent.parent.start.call(self, dependencies, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			configSrvc.getModuleIdAsync(self)
			.then(function(id) {
				return dbSrvc.raw('SELECT id FROM module_permissions WHERE module = ? AND name = ?', [id, 'page-author']);
			})
			.then(function(pageAuthorPermissionId) {
				self['$pageAuthorPermissionId'] = pageAuthorPermissionId.rows[0].id;

				// Define the models....
				var dbSrvc = self.dependencies['database-service'];

				Object.defineProperty(self, '$UserModel', {
					'__proto__': null,
					'value': dbSrvc.Model.extend({
						'tableName': 'users',
						'idAttribute': 'id',
						'hasTimestamps': true
					})
				});

				Object.defineProperty(self, '$PageModel', {
					'__proto__': null,
					'value': dbSrvc.Model.extend({
						'tableName': 'pages',
						'idAttribute': 'id',
						'hasTimestamps': true,

						'profile': function() {
							return this.belongsTo(self.$UserModel, 'author');
						}
					})
				});

				return null;
			})
			.catch(function(startErr) {
				loggerSrvc.error(self.name + '::start Error: ', startErr);
				if(callback) callback(startErr);
			});

			if(callback) callback(null, status);
		});
	},

	'_addRoutes': function() {
		this.$router.get('/', this._getPages.bind(this));
		this.$router.post('/', this._addPage.bind(this));

		this.$router.delete('/:id', this._deletePage.bind(this));

		this.$router.get('/list', this._getPageList.bind(this));
	},

	'_getPages': function(request, response, next) {
		var self = this,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$pageAuthorPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
				return null;
			}

			return new self.$PageModel().fetchAll({ 'withRelated': ['profile'] });
		})
		.then(function(pagesData) {
			pagesData = self['$jsonApiMapper'].map(pagesData, 'pages');
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
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$pageAuthorPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
				return null;
			}

			return self['$jsonApiDeserializer'].deserializeAsync(request.body);
		})
		.then(function(jsonDeserializedData) {
			jsonDeserializedData.author = request.user.id;
			delete jsonDeserializedData.content;

			return self.$PageModel
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
					'title': 'Add page error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_deletePage': function(request, response, next) {
		var self = this,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$pageAuthorPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
				return null;
			}

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

	'_getPageList': function(request, response, next) {
		var self = this,
			dbSrvc = (self.dependencies['database-service']).knex,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$pageAuthorPermissionId'])
		.then(function(hasPermission) {
			if(hasPermission) {
				return dbSrvc.raw('SELECT A.id, A.title, A.created_at, B.first_name || \' \' || B.last_name AS author, A.status, A.created_at AS created FROM pages A INNER JOIN users B ON (A.author = B.id)');
			}

			throw new Error('Unauthorized Access');
			return null;
		})
		.then(function(pageList) {
			var responseData = { 'data': [] };
			pageList.rows.forEach(function(page) {
				responseData.data.push({
					'id': page.id,
					'title': page.title,
					'author': page.author,
					'status': page.status,
					'created': moment(page.created).format('DD/MMM/YYYY hh:mm A')
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

	'name': 'pages',
	'basePath': __dirname,
	'dependencies': ['configuration-service', 'database-service', 'logger-service']
});

exports.component = pagesComponent;
