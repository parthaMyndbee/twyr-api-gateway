/*
 * Name			: app/modules/components/masterdata/component.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Master Data Component - provides functionality to get immutable data from the database
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

var masterdataComponent = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);
	},

	'_addRoutes': function() {
		this.$router.get('/contactTypes', this._getContactTypes.bind(this));
		this.$router.get('/emergencyContactTypes', this._getEmergencyContactTypes.bind(this));
		this.$router.get('/genders', this._getGenders.bind(this));
		this.$router.get('/server-permissions', this._getServerPermissions.bind(this));
	},

	'_getContactTypes': function(request, response, next) {
		var self = this,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.silly('Servicing request "' + request.path + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params);
		response.type('application/javascript');

		self.dependencies['database-service'].knex.raw('SELECT unnest(enum_range(NULL::contact_type)) AS contact_types;')
		.then(function(contactTypes) {
			var responseData = [];
			for(var idx in contactTypes.rows) {
				responseData.push(contactTypes.rows[idx]['contact_types']);
			}

			response.status(200).json(responseData);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request "' + request.path + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(422).json({ 'code': 422, 'message': err.message || err.detail || 'Error fetching contact types from the database' });
		});
	},

	'_getEmergencyContactTypes': function(request, response, next) {
		var self = this,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.silly('Servicing request "' + request.path + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params);
		response.type('application/javascript');

		self.dependencies['database-service'].knex.raw('SELECT unnest(enum_range(NULL::emergency_contact_type)) AS emergency_contact_types;')
		.then(function(emergencyContactTypes) {
			var responseData = [];
			for(var idx in emergencyContactTypes.rows) {
				responseData.push(emergencyContactTypes.rows[idx]['emergency_contact_types']);
			}

			response.status(200).json(responseData);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request "' + request.path + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(422).json({ 'code': 422, 'message': err.message || err.detail || 'Error fetching emergency contact types from the database' });
		});
	},

	'_getGenders': function(request, response, next) {
		var self = this,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.silly('Servicing request "' + request.path + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params);
		response.type('application/javascript');

		self.dependencies['database-service'].knex.raw('SELECT unnest(enum_range(NULL::gender)) AS genders;')
		.then(function(genders) {
			var responseData = [];
			for(var idx in genders.rows) {
				responseData.push(genders.rows[idx]['genders']);
			}

			response.status(200).json(responseData);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request "' + request.path + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(422).json({ 'code': 422, 'message': err.message || err.detail || 'Error fetching genders from the database' });
		});
	},

	'_getServerPermissions': function(request, response, next) {
		var self = this,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.silly('Servicing request "' + request.path + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params);
		response.type('application/javascript');

		var rootModule = self;
		while(rootModule.$module)
			rootModule = rootModule.$module;

		self.dependencies['database-service'].knex.raw('SELECT id, display_name FROM module_permissions WHERE module = (SELECT id FROM modules WHERE name = ?);', [rootModule.name])
		.then(function(permissions) {
			var responseData = [];
			for(var idx in permissions.rows) {
				responseData.push({
					'id': permissions.rows[idx].id,
					'name': permissions.rows[idx].display_name
				});
			}

			response.status(200).json(responseData);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request "' + request.path + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(422).json({ 'code': 422, 'message': err.message || err.detail || 'Error fetching genders from the database' });
		});
	},

	'name': 'masterdata',
	'basePath': __dirname,
	'dependencies': ['database-service', 'logger-service']
});

exports.component = masterdataComponent;
