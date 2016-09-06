/*
 * Name			: app/modules/components/tenants/component.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Tenant Component - Tenant and Sub-Tenant Administration
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
var _ = require('lodash'),
	inflection = require('inflection');

var tenantsComponent = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);

		this._getTenantTreeRootNodesAsync = promises.promisify(this._getTenantTreeRootNodes.bind(this));
		this._getTenantTreeNodesAsync = promises.promisify(this._getTenantTreeNodes.bind(this));
	},

	'start': function(dependencies, callback) {
		var self = this,
			configSrvc = dependencies['configuration-service'],
			dbSrvc = dependencies['database-service'],
			loggerSrvc = dependencies['logger-service'];

		tenantsComponent.parent.start.call(self, dependencies, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			// Define the models....
			Object.defineProperty(self, '$TenantModel', {
				'__proto__': null,
				'writable': true,

				'value': dbSrvc.Model.extend({
					'tableName': 'tenants',
					'idAttribute': 'id',
					'hasTimestamps': true,

					'parent': function() {
						return this.belongsTo(self.$TenantModel, 'parent');
					},

					'children': function() {
						return this.hasMany(self.$TenantModel, 'parent');
					}
				})
			});

			configSrvc.getModuleIdAsync(self)
			.then(function(id) {
				return dbSrvc.knex.raw('SELECT id FROM module_permissions WHERE module = ? AND name = ?', [id, 'tenant-administrator']);
			})
			.then(function(tenantAdministratorPermissionId) {
				self['$tenantAdministratorPermissionId'] = tenantAdministratorPermissionId.rows[0].id;
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
		this.$router.get('/tree', this._getTenantTree.bind(this));

		this.$router.post('/', this._addTenant.bind(this));
		this.$router.get('/:id', this._getTenant.bind(this));
		this.$router.patch('/:id', this._updateTenant.bind(this));
		this.$router.delete('/:id', this._deleteTenant.bind(this));
	},

	'_getTenantTreeRootNodes': function(user, callback) {
		var self = this,
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'];

		dbSrvc.raw('SELECT tenant FROM tenants_users WHERE login = ? AND tenant IN (SELECT tenant FROM fn_get_user_permissions(?) WHERE permission = ?)', [ user.id, user.id, self['$tenantAdministratorPermissionId'] ])
		.then(function(userTenants) {
			userTenants = _.map(userTenants.rows, 'tenant');

			var promiseResolutions = [];
			promiseResolutions.push(userTenants);

			userTenants.forEach(function(userTenant) {
				promiseResolutions.push(dbSrvc.raw('SELECT count(id) AS parent_count FROM fn_get_tenant_ancestors(?) WHERE level > 1 AND id IN (\'' + userTenants.join('\', \'') + '\')', [userTenant]));
			});

			return promises.all(promiseResolutions);
		})
		.then(function(results) {
			var userTenants = results.shift(),
				toBeRemoved = [];

			results.forEach(function(hasParentPermissionResult, index) {
				if(hasParentPermissionResult.rows.length && Number(hasParentPermissionResult.rows[0]['parent_count']))
					toBeRemoved.push(index);
			});

			toBeRemoved.reverse();
			toBeRemoved.forEach(function(idxToSplice) {
				userTenants.splice(idxToSplice, 1);
			});

			var promiseResolutions = [];
			promiseResolutions.push(dbSrvc.raw('SELECT id, name AS text FROM tenants WHERE id  IN (\'' + userTenants.join('\', \'') + '\')'));

			return promises.all(promiseResolutions);
		})
		.then(function(results) {
			var tenants = [];

			results[0].rows.forEach(function(tenantDataResult, tenantIndex) {
				var tenantData = {
					'id': tenantDataResult.id,
					'text': tenantDataResult.text,
					'type': 'organization',
					'children': true
				};

				tenants.push(tenantData);
			});

			if(callback) callback(null, tenants);
		})
		.catch(function(err) {
			loggerSrvc.error('_getTenantTreeRootNodes Error: ', err);
			if(callback) callback(err);
		});
	},

	'_getTenantTreeNodes': function(user, tenant, callback) {
		var self = this,
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'],
			promiseResolutions = [];

		promiseResolutions.push(self._checkPermissionAsync(user, self['$tenantAdministratorPermissionId'], tenant));
		promiseResolutions.push(dbSrvc.raw('SELECT id, name AS text, type FROM tenants WHERE id IN (SELECT id FROM fn_get_tenant_descendants(?) WHERE level = 2)', [tenant]));

		promises.all(promiseResolutions)
		.then(function(results) {
			var hasPermission = results.shift(),
				tenants = [];

			results[0].rows.forEach(function(tenantDataResult, tenantIndex) {
				var tenantData = {
					'id': tenantDataResult.id,
					'text': tenantDataResult.text,
					'type': tenantDataResult.type,
					'children': true
				};

				tenants.push(tenantData);
			});

			if(callback) callback(null, tenants);
		})
		.catch(function(err) {
			loggerSrvc.error('_getTenantTreeNodes Error: ', err);
			if(callback) callback(err);
		});
	},

	'_getTenantTree': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		var queryFor = request.query.id.split('::');

		if(queryFor[0] == '#') {
			self._getTenantTreeRootNodesAsync(request.user)
			.then(function(tenants) {
				response.status(200).json(tenants);
				return null;
			})
			.catch(function(err) {
				loggerSrvc.error('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', err);
				response.status(500).send(err.message);
			});

			return;
		}

		self._getTenantTreeNodesAsync(request.user, queryFor[0], ((queryFor.length > 1) ? queryFor[1] : undefined))
		.then(function(tenants) {
			response.status(200).json(tenants);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', err);
			response.status(500).send(err.message);
		});
	},

	'_addTenant': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self['$jsonApiDeserializer'].deserializeAsync(request.body)
		.then(function(jsonDeserializedData) {
			if(request.body.data.relationships.parent.data) {
				jsonDeserializedData.parent = request.body.data.relationships.parent.data.id;
			}

			delete jsonDeserializedData.created_at;
			delete jsonDeserializedData.updated_at;

			return promises.all([jsonDeserializedData, self._checkPermissionAsync(request.user, self['$tenantAdministratorPermissionId'], jsonDeserializedData.parent)]);
		})
		.then(function(results) {
			var jsonDeserializedData = results.shift(),
				hasPermission = results.shift();

			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return promises.all([
				jsonDeserializedData,
				self.$TenantModel.forge({ 'id': jsonDeserializedData.parent }).fetch()
			]);
		})
		.then(function(results) {
			var jsonDeserializedData = results.shift(),
				parent = results.shift();

			if((parent.get('type') == 'department') && (jsonDeserializedData.type != 'department')) {
				throw new Error('Departments can own only other Departments');
			}

			return self.$TenantModel
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

	'_getTenant': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$tenantAdministratorPermissionId'], request.params.id)
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return self.$TenantModel
			.forge({ 'id': request.params.id })
			.fetch({ 'withRelated': ['parent', 'children'] });
		})
		.then(function(tenantData) {
			tenantData = self['$jsonApiMapper'].map(tenantData, 'tenants', {
				'relations': true,
				'disableLinks': true
			});

			if(tenantData.data.relationships.children && tenantData.data.relationships.children.data) {
				if(Array.isArray(tenantData.data.relationships.children.data)) {
					tenantData.data.relationships.children.data.forEach(function(tenant) {
						tenant.type = 'tenants';
					});
				}
				else {
					tenantData.data.relationships.children.data.type = 'tenants';
				}
			}

			var promiseResolutions = [];
			promiseResolutions.push(tenantData);

			if(tenantData.data.relationships.parent && tenantData.data.relationships.parent.data) {
				tenantData.data.relationships.parent.data.type = 'tenants';
				promiseResolutions.push(self._checkPermissionAsync(request.user, self['$tenantAdministratorPermissionId'], tenantData.data.relationships.parent.data.id));
			}
			else {
				promiseResolutions.push(false);
			}

			delete tenantData.included;
			return promises.all(promiseResolutions);
		})
		.then(function(results) {
			var tenantData = results.shift(),
				hasParentPermission = results.shift();

			if(!hasParentPermission) {
				if(tenantData.data.attributes.parent)
					tenantData.data.attributes.parent = null;

				if(tenantData.data.relationships.parent)
					delete tenantData.data.relationships.parent;
			}

			response.status(200).json(tenantData);
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

	'_updateTenant': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$tenantAdministratorPermissionId'], request.params.id)
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return self['$jsonApiDeserializer'].deserializeAsync(request.body);
		})
		.then(function(jsonDeserializedData) {
			delete jsonDeserializedData.created_at;
			delete jsonDeserializedData.updated_at;

			return self.$TenantModel
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
					'title': 'Add menu error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_deleteTenant': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$tenantAdministratorPermissionId'], request.params.id)
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			return new self.$TenantModel({ 'id': request.params.id }).destroy();
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
					'title': 'Add menu error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'name': 'tenants',
	'basePath': __dirname,
	'dependencies': ['configuration-service', 'database-service', 'logger-service']
});

exports.component = tenantsComponent;
