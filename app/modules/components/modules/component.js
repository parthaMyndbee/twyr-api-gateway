/*
 * Name			: app/modules/components/modules/component.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Modules Component
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
var inflection = require('inflection');

var modulesComponent = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);
	},

	'start': function(dependencies, callback) {
		var self = this,
			configSrvc = dependencies['configuration-service'],
			dbSrvc = dependencies['database-service'],
			loggerSrvc = dependencies['logger-service'];

		modulesComponent.parent.start.call(self, dependencies, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			// Define the models....
			Object.defineProperty(self, '$ModuleModel', {
				'__proto__': null,
				'writable': true,

				'value': dbSrvc.Model.extend({
					'tableName': 'modules',
					'idAttribute': 'id',
					'hasTimestamps': true,

					'permissions': function() {
						return this.hasMany(self.$ModulePermissionModel, 'module');
					},

					'widgets': function() {
						return this.hasMany(self.$ModuleWidgetModel, 'module');
					},

					'menus': function() {
						return this.hasMany(self.$ModuleMenuModel, 'module');
					},

					'templates': function() {
						return this.hasMany(self.$ModuleTemplateModel, 'module');
					},

					'parent': function() {
						return this.belongsTo(self.$ModuleModel, 'parent');
					},

					'children': function() {
						return this.hasMany(self.$ModuleModel, 'parent');
					}
				})
			});

			Object.defineProperty(self, '$ModulePermissionModel', {
				'__proto__': null,
				'writable': true,

				'value': dbSrvc.Model.extend({
					'tableName': 'module_permissions',
					'idAttribute': 'id',
					'hasTimestamps': true,

					'module': function() {
						return this.belongsTo(self.$ModuleModel, 'module');
					},

					'widgets': function() {
						return this.hasMany(self.$ModuleWidgetModel, 'permission');
					},

					'menus': function() {
						return this.hasMany(self.$ModuleMenuModel, 'permission');
					}
				})
			});

			Object.defineProperty(self, '$ModuleWidgetModel', {
				'__proto__': null,
				'writable': true,

				'value': dbSrvc.Model.extend({
					'tableName': 'module_widgets',
					'idAttribute': 'id',
					'hasTimestamps': true,

					'module': function() {
						return this.belongsTo(self.$ModuleModel, 'module');
					},

					'permission': function() {
						return this.belongsTo(self.$ModulePermissionModel, 'permission');
					}
				})
			});

			Object.defineProperty(self, '$ModuleMenuModel', {
				'__proto__': null,
				'writable': true,

				'value': dbSrvc.Model.extend({
					'tableName': 'module_menus',
					'idAttribute': 'id',
					'hasTimestamps': true,

					'module': function() {
						return this.belongsTo(self.$ModuleModel, 'module');
					},

					'permission': function() {
						return this.belongsTo(self.$ModulePermissionModel, 'permission');
					},

					'parent': function() {
						return this.belongsTo(self.$ModuleMenuModel, 'parent');
					},

					'children': function() {
						return this.hasMany(self.$ModuleMenuModel, 'parent');
					}
				})
			});

			Object.defineProperty(self, '$ModuleTemplateModel', {
				'__proto__': null,
				'writable': true,

				'value': dbSrvc.Model.extend({
					'tableName': 'module_templates',
					'idAttribute': 'id',
					'hasTimestamps': true,

					'module': function() {
						return this.belongsTo(self.$ModuleModel, 'module');
					}
				})
			});

			configSrvc.getModuleIdAsync(self)
			.then(function(id) {
				return dbSrvc.knex.raw('SELECT id FROM module_permissions WHERE module = ? AND name = ?', [id, 'module-manager']);
			})
			.then(function(moduleManagerPermissionId) {
				self['$moduleManagerPermissionId'] = moduleManagerPermissionId.rows[0].id;
				return dbSrvc.knex.raw('SELECT unnest(enum_range(NULL::module_type)) AS type');
			})
			.then(function(moduleTypes) {
				self['$moduleTypes'] = [];
				moduleTypes.rows.forEach(function(moduleType) {
					moduleType = inflection.pluralize(moduleType.type);
					self['$moduleTypes'].push(moduleType);
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
		this.$router.get('/tree', this._getModuleTree.bind(this));
		this.$router.get('/availableWidgets/:templateId', this._getAvailableWidgets.bind(this));

		this.$router.get('/module-permissions/:id', this._getModulePermission.bind(this));
		this.$router.get('/module-widgets/:id', this._getModuleWidget.bind(this));
		this.$router.get('/module-menus/:id', this._getModuleMenu.bind(this));

		this.$router.get('/module-templates/:id', this._getModuleTemplate.bind(this));
		this.$router.patch('/module-templates/:id', this._updateModuleTemplate.bind(this));

		this.$router.get('/:id', this._getModule.bind(this));
		this.$router.patch('/:id', this._updateModule.bind(this));
	},

	'_getModuleTree': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'],
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');


		self._checkPermissionAsync(request.user, self['$moduleManagerPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			var responseData = [],
				queryFor = request.query.id.split('::');

			if(queryFor[0] == '#') {
				return dbSrvc.knex.raw('SELECT id, display_name AS text FROM modules WHERE parent IS NULL;')
			}

			if(queryFor.length < 2) {
				return { 'rows': [] };
			}

			return dbSrvc.knex.raw('SELECT id, display_name AS text FROM modules WHERE id IN (SELECT id FROM fn_get_module_descendants(?) WHERE level = 2 AND type = ?)', [queryFor[0], inflection.singularize(queryFor[1])]);
		})
		.then(function(modules) {
			var promiseResolutions = [];
			promiseResolutions.push(modules.rows);

			modules.rows.forEach(function(module) {
				promiseResolutions.push(dbSrvc.knex.raw('SELECT type, count(type) FROM fn_get_module_descendants(?) WHERE level = 2 GROUP BY type', [module.id]));
			});

			return promises.all(promiseResolutions);
		})
		.then(function(results) {
			var modules = results.shift();

			results.forEach(function(moduleData, moduleIndex) {
				var module = modules[moduleIndex];
				if(!module.children) module.children = [];

				moduleData.rows.forEach(function(subModuleCounts) {
					if(subModuleCounts.count <= 0)
						return;

					module.children.push({
						'id': module.id + '::' + subModuleCounts.type,
						'text': inflection.capitalize(inflection.pluralize(subModuleCounts.type)),
						'children': true
					});
				});

				if(!module.children.length)
					module.children = false;
			});

			response.status(200).json(modules);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', err);
			response.sendStatus(500);
		});
	},

	'_getAvailableWidgets': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'],
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$moduleManagerPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return dbSrvc.knex.raw('SELECT module FROM module_templates WHERE id = ?', [request.params.templateId]);
		})
		.then(function(templateModuleId) {
			return dbSrvc.knex.raw('SELECT id, display_name AS name, description FROM module_widgets WHERE module IN (SELECT id FROM fn_get_module_descendants(?) WHERE level <= 2)', [templateModuleId.rows[0].module]);
		})
		.then(function(availableWidgets) {
			response.status(200).json(availableWidgets.rows);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', err);
			response.sendStatus(500);
		});
	},

	'_getModulePermission': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'],
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$moduleManagerPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return new self.$ModulePermissionModel({ 'id': request.params.id })
			.fetch({ 'withRelated': ['module'] });
		})
		.then(function(modulePermission) {
			modulePermission = self['$jsonApiMapper'].map(modulePermission, 'module-permissions');
			delete modulePermission.included;

			response.status(200).json(modulePermission);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Get module error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_getModuleWidget': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'],
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$moduleManagerPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return new self.$ModuleWidgetModel({ 'id': request.params.id })
			.fetch({ 'withRelated': ['module', 'permission'] });
		})
		.then(function(moduleWidget) {
			moduleWidget = self['$jsonApiMapper'].map(moduleWidget, 'module-widgets');

			moduleWidget.data.relationships.permission.data.type = 'module-permissions';
			delete moduleWidget.included;

			response.status(200).json(moduleWidget);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Get module error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_getModuleMenu': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'],
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$moduleManagerPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return new self.$ModuleMenuModel({ 'id': request.params.id })
			.fetch({ 'withRelated': ['module', 'permission'] });
		})
		.then(function(moduleMenu) {
			moduleMenu = self['$jsonApiMapper'].map(moduleMenu, 'module-menus');

			moduleMenu.data.relationships.permission.data.type = 'module-permissions';
			delete moduleMenu.included;

			response.status(200).json(moduleMenu);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Get module error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_getModuleTemplate': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'],
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$moduleManagerPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return new self.$ModuleTemplateModel({ 'id': request.params.id })
			.fetch({ 'withRelated': ['module'] });
		})
		.then(function(moduleTemplate) {
			var configuration = JSON.stringify(moduleTemplate.get('configuration')),
				configurationSchema = JSON.stringify(moduleTemplate.get('configuration_schema')),
				metadata = JSON.stringify(moduleTemplate.get('metadata'));

			moduleTemplate = self['$jsonApiMapper'].map(moduleTemplate, 'module-templates');
			delete moduleTemplate.included;

			moduleTemplate.data.attributes.metadata = metadata;
			moduleTemplate.data.attributes.configuration = configuration;
			moduleTemplate.data.attributes.configuration_schema = configurationSchema;

			response.status(200).json(moduleTemplate);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Get module error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_updateModuleTemplate': function(request, response, next) {
		var self = this,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');


		self._checkPermissionAsync(request.user, self['$moduleManagerPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return self['$jsonApiDeserializer'].deserializeAsync(request.body);
		})
		.then(function(jsonDeserializedData) {
			return self.$ModuleTemplateModel
			.forge()
			.save(jsonDeserializedData, {
				'method': 'update',
				'patch': true
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
					'title': 'Update profile error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_getModule': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'],
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$moduleManagerPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return new self.$ModuleModel({ 'id': request.params.id })
			.fetch({ 'withRelated': ['permissions', 'widgets', 'menus', 'templates'] });
		})
		.then(function(moduleData) {
			var configuration = JSON.stringify(moduleData.get('configuration')),
				configurationSchema = JSON.stringify(moduleData.get('configuration_schema')),
				metadata = JSON.stringify(moduleData.get('metadata'));

			moduleData = self['$jsonApiMapper'].map(moduleData, 'modules');
			delete moduleData.included;

			moduleData.data.attributes.metadata = metadata;
			moduleData.data.attributes.configuration = configuration;
			moduleData.data.attributes.configuration_schema = configurationSchema;

			moduleData.data.relationships.permissions.data.forEach(function(modulePermission) {
				modulePermission.type = 'module-permissions';
			});

			moduleData.data.relationships.widgets.data.forEach(function(moduleWidget) {
				moduleWidget.type = 'module-widgets';
			});

			moduleData.data.relationships.menus.data.forEach(function(moduleMenu) {
				moduleMenu.type = 'module-menus';
			});

			moduleData.data.relationships.templates.data.forEach(function(moduleTmpl) {
				moduleTmpl.type = 'module-templates';
			});

			response.status(200).json(moduleData);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Get module error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_updateModule': function(request, response, next) {
		var self = this,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$moduleManagerPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return self['$jsonApiDeserializer'].deserializeAsync(request.body);
		})
		.then(function(jsonDeserializedData) {
			delete jsonDeserializedData.created_at;
			delete jsonDeserializedData.updated_at;

			jsonDeserializedData.metadata = JSON.parse(jsonDeserializedData.metadata);
			jsonDeserializedData.configuration = JSON.parse(jsonDeserializedData.configuration);

			return self.$ModuleModel
			.forge()
			.save(jsonDeserializedData, {
				'method': 'update',
				'patch': true
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
					'title': 'Update profile error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'name': 'modules',
	'basePath': __dirname,
	'dependencies': ['auth-service', 'cache-service']
});

exports.component = modulesComponent;
