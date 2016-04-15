/*
 * Name			: app/modules/services/configuration-service/configuration-loader.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Configuration Service dependency manager and service loader
 *
 */

"use strict";

/**
 * Module dependencies, required for ALL Twy'r modules
 */
var prime = require('prime'),
	promises = require('bluebird');

/**
 * Module dependencies, required for this module
 */
var baseLoader = require('./../service-loader').loader,
	path = require('path');

var configurationServiceLoader = prime({
	'inherits': baseLoader,

	'constructor': function(module) {
		baseLoader.call(this, module);
	},

	'load': function(configSrvc, basePath, callback) {
		var self = this;

		configurationServiceLoader.parent.load.call(self, configSrvc, basePath, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			// Fast-track starting, etc. so that we are ready for the rest of the Server
			self.$module.initializeAsync()
			.then(function(initStatus) {
				self['initStatus'] = initStatus;
				self['initErr'] = null;

				return null;
			})
			.catch(function(initErr) {
				self['initStatus'] = false;
				self['initErr'] = initErr;
			})
			.then(function() {
				if(self['initErr']) return null;
				return self.$module.startAsync(null);
			})
			.then(function(startStatus) {
				self['startStatus'] = startStatus;
				self['startErr'] = null;

				return null;
			})
			.catch(function(startErr) {
				self['startStatus'] = false;
				self['startErr'] = startErr;
			})
			.finally(function() {
				if(callback) callback(null, status);
				return null;
			});
		});
	},

	'initialize': function(callback) {
		var self = this;
		if(self['initStatus'] !== undefined) {
			if(callback) callback(self['initErr'], self['initStatus']);
			return;
		}

		configurationServiceLoader.parent.initialize.call(self, callback);
	},

	'start': function(callback) {
		var self = this;
		if(self['startStatus'] !== undefined) {
			if(callback) callback(self['startErr'], self['startStatus']);
			return;
		}

		configurationServiceLoader.parent.start.call(self, callback);
	}
});

exports.loader = configurationServiceLoader;
