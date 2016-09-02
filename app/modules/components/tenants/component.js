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
var inflection = require('inflection');

var tenantsComponent = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);
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

		this.$router.get('/:id', this._getTenant.bind(this));
	},

	'_getTenantTree': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self._checkPermissionAsync(request.user, self['$tenantAdministratorPermissionId'])
		.then(function(hasPermission) {
			if(!hasPermission) {
				throw new Error('Unauthorized Access');
			}

			var responseData = [],
				queryFor = request.query.id.split('::');

			if(queryFor[0] == '#') {
				return promises.all([
					dbSrvc.raw('SELECT id, name AS text FROM tenants WHERE parent IS NULL;'),
					dbSrvc.raw('SELECT unnest(enum_range(NULL::tenant_type)) AS tenant_type;')
				]);
			}

			if(queryFor.length < 2) {
				return [{ 'rows': [] }, { 'rows': [] }];
			}

			return promises.all([
				dbSrvc.raw('SELECT id, name AS text FROM tenants WHERE id IN (SELECT id FROM fn_get_tenant_descendants(?) WHERE level = 2 AND type = ?)', [(queryFor[0]), inflection.singularize(queryFor[1])]),
				dbSrvc.raw('SELECT unnest(enum_range(NULL::tenant_type)) AS tenant_type;')
			]);
		})
		.then(function(results) {
			var tenants = results[0].rows,
				tenantTypes = results[1].rows;

			tenants.forEach(function(tenantData, tenantIndex) {
				tenantData.children = [];

				tenantTypes.forEach(function(tenantType) {
					tenantData.children.push({
						'id': tenantData.id + '::' + tenantType['tenant_type'],
						'text': inflection.capitalize(inflection.pluralize(tenantType['tenant_type'])),
						'children': true
					});
				});
			});

			response.status(200).json(tenants);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', err);
			response.sendStatus(500);
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

			if(tenantData.data.relationships.parent && tenantData.data.relationships.parent.data) {
				tenantData.data.relationships.parent.data.type = 'tenants';
			}

			delete tenantData.included;
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

	'name': 'tenants',
	'basePath': __dirname,
	'dependencies': ['configuration-service', 'database-service', 'logger-service']
});

exports.component = tenantsComponent;
