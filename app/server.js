/*
 * Name			: app/server.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Module - the "Application Class" for the Server
 *
 */

"use strict";

/**
 * Module dependencies, required for ALL Twy'r modules
 */
var base = require('./module-base').baseModule,
	prime = require('prime'),
	promises = require('bluebird');

/**
 * Module dependencies, required for this module
 */
var path = require('path');

var app = prime({
	'inherits': base,

	'constructor': function (module, clusterId, workedId) {
		base.call(this, module);
		this['$uuid'] = clusterId + '-' + workedId;
		this._loadConfig();
	},

	'start': function(dependencies, callback) {
		var self = this;
		app.parent.start.call(self, dependencies, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			self._setupRoutes();
			if(callback) callback(null, status);
		});
	},

	'_loadConfig': function() {
		var rootPath = path.dirname(require.main.filename),
			env = (process.env.NODE_ENV || 'development').toLowerCase();

		this['$config'] = require(path.join(rootPath, 'config', env, this.name)).config;
	},

	'_subModuleReconfigure': function(subModule) {
		if(subModule != 'express-service') return;
		this._setupRoutes();
	},

	'_subModuleStateChange': function(subModule, state) {
		if(subModule != 'express-service') return;
		if(!state) return;

		this._setupRoutes();
	},

	'_setupRoutes': function() {
		var self = this;

		var expressApp = (self.$services['express-service']).getInterface();
		Object.keys(self.$components).forEach(function(componentName) {
			var subRouter = (self.$components[componentName]).getRouter(),
				mountPath = self.$config ? (self.$config.componentMountPath || '/') : '/';

			expressApp.use(path.join(mountPath, componentName), subRouter);
		});

		expressApp.use('*', function(request, response, next) {
			response.sendStatus(404);
		});

		expressApp.use(function(error, request, response, next) {
			response.status(500).json({ 'error': error.message });
		});
	},

	'name': 'twyr-api-gateway',
	'basePath': __dirname,
	'dependencies': []
});

exports.twyrAPIGateway = app;
