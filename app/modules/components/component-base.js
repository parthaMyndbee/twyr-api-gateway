/*
 * Name			: app/modules/components/component-base.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Base Class for Components - providing common functionality required for all components
 *
 */

"use strict";

var base = require('./../../module-base').baseModule,
	prime = require('prime'),
	promises = require('bluebird');

/**
 * Module dependencies, required for this module
 */
var path = require('path');

var twyrComponentBase = prime({
	'inherits': base,

	'constructor': function(module, loader) {
		// console.log('Constructor of the ' + this.name + ' Component');

		if(this.dependencies.indexOf('logger-service') < 0)
			this.dependencies.push('logger-service');

		if(this.dependencies.indexOf('database-service') < 0)
			this.dependencies.push('database-service');

		if(this.dependencies.indexOf('express-service') < 0)
			this.dependencies.push('express-service');

		this['$router'] = require('express').Router();
		this._checkPermissionAsync = promises.promisify(this._checkPermission);

		base.call(this, module, loader);
	},

	'start': function(dependencies, callback) {
		// console.log(this.name + ' Start');

		var self = this;
		twyrComponentBase.parent.start.call(self, dependencies, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			self._setupRouter();
			if(callback) callback(null, status);
		});
	},

	'getRouter': function () {
		return this.$router;
	},

	'stop': function(callback) {
		// console.log(this.name + ' Stop');

		var self = this;
		twyrComponentBase.parent.stop.call(self, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			self._deleteRoutes();
			if(callback) callback(null, status);
		});
	},

	'_setupRouter': function() {
		var router = this['$router'],
			logger = require('morgan'),
			loggerSrvc = this.dependencies['logger-service'],
			self = this;

		var loggerStream = {
			'write': function(message, encoding) {
				loggerSrvc.silly(message);
			}
		};

		router
		.use(logger('combined', {
			'stream': loggerStream
		}))
		.use(function(request, response, next) {
			if(self['$enabled']) {
				next();
				return;
			}

			response.status(403).json({ 'error': self.name + ' is disabled' });
		});

		self._addRoutes();
		Object.keys(self.$components).forEach(function(subComponentName) {
			var subRouter = (self.$components[subComponentName]).getRouter(),
				mountPath = self.$config ? (self.$config.componentMountPath || '/') : '/';

			self.$router.use(path.join(mountPath, subComponentName), subRouter);
		});
	},

	'_addRoutes': function() {
		return;
	},

	'_deleteRoutes': function() {
		// NOTICE: Undocumented ExpressJS API. Be careful upgrading :-)
		if(!this.$router) return;
		this.$router.stack.length = 0;
	},

	'_checkPermission': function(user, permission, tenant, callback) {
		if(tenant && !callback) {
			callback = tenant;
			tenant = null;
		}

		if(!user) {
			if(callback) callback(null, false);
			return;
		}

		if(!permission) {
			if(callback) callback(null, false);
			return;
		}

		if(!user.tenants) {
			if(callback) callback(null, false);
			return;
		}

		var allowed = false;
		if(!tenant) {
			Object.keys(user.tenants).forEach(function(userTenant) {
				allowed = allowed || ((user.tenants[userTenant]['permissions']).indexOf(permission) >= 0);
			});

			if(callback) callback(null, allowed);
			return;
		}

		if(!user.tenants[tenant]) {
			if(callback) callback(null, false);
			return;
		}

		if((user.tenants[tenant]['permissions']).indexOf(permission)) {
			if(callback) callback(null, true);
			return;
		}

		if(user.tenants[tenant]['tenantParents']) {
			allowed = false;
			user.tenants[tenant]['tenantParents'].forEach(function(tenantParent) {
				if(!user.tenants[tenantParent]) return;
				allowed = allowed || ((user.tenants[tenantParent]['permissions']).indexOf(permission) >= 0);
			});

			if(callback) callback(null, allowed);
			return;
		}

		// Should NEVER execute - tenantParents should be set when the User logs in
		var database = this.dependencies['database-service'];
		database.knex.raw('SELECT id FROM fn_get_tenant_ancestors(?);', [tenant])
		.then(function(tenantParents) {
			allowed = false;
			tenantParents.rows.forEach(function(tenantParent) {
				if(!user.tenants[tenantParent.id]) return;
				allowed = allowed || ((user.tenants[tenantParent.id]['permissions']).indexOf(permission) >= 0);
			});

			if(callback) callback(null, allowed);
			return;
		})
		.catch(function(err) {
			self.$dependencies['logger-service'].error(self.name + '::_checkPermission Error: ' + JSON.stringify(err, null, '\t'));
			if(callback) callback(err);
		});
	},

	'_dependencyStateChange': function(dependency, state) {
		if((process.env.NODE_ENV || 'development') == 'development') console.log(this.name + '::_dependencyStateChange: ' + dependency + ' is now ' + (state ? 'enabled' : 'disabled'));
		if(dependency != 'express-service') return;
		this._changeState(state);
	},

	'name': 'twyr-component-base',
	'basePath': __dirname,
	'dependencies': ['database-service', 'express-service', 'logger-service']
});

exports.baseComponent = twyrComponentBase;