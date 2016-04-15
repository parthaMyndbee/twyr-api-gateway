/*
 * Name			: app/modules/services/service-loader.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Services dependency manager and service loader
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
var baseLoader = require('./../../module-loader').loader,
	path = require('path');

var serviceLoader = prime({
	'inherits': baseLoader,

	'constructor': function(module) {
		baseLoader.call(this, module);
	},

	'load': function(configSrvc, basePath, callback) {
		var promiseResolutions = [],
			self = this;

		Object.defineProperty(this, '$basePath', {
			'__proto__': null,
			'value': path.resolve(basePath)
		});

		promiseResolutions.push(self._loadUtilitiesAsync(configSrvc));
		promiseResolutions.push(self._loadServicesAsync(configSrvc));

		promises.all(promiseResolutions)
		.then(function(status) {
			if(!status) throw status;
			if(callback) callback(null, self._filterStatus(status));

			return null;
		})
		.catch(function(err) {
			if(callback) callback(err);
		});
	},

	'initialize': function(callback) {
		var self = this;

		self._initializeServicesAsync()
		.then(function(status) {
			if(!status) throw status;
			if(callback) callback(null, self._filterStatus([status]));

			return null;
		})
		.catch(function(err) {
			if(callback) callback(err);
		});
	},

	'start': function(callback) {
		var self = this,
			finalStatus = [];

		self._startServicesAsync()
		.then(function(status) {
			if(!status) throw status;
			finalStatus.push(status);

			if(callback) callback(null, self._filterStatus(finalStatus));
			return null;
		})
		.catch(function(err) {
			if(callback) callback(err);
		});
	},

	'stop': function(callback) {
		var self = this,
			finalStatus = [];

		self._stopServicesAsync()
		.then(function(status) {
			if(!status) throw status;
			finalStatus.push(status);

			if(callback) callback(null, self._filterStatus(finalStatus));
			return null;
		})
		.catch(function(err) {
			if(callback) callback(err, false);
		});
	},

	'uninitialize': function(callback) {
		var self = this;

		self._uninitializeServicesAsync()
		.then(function(status) {
			if(!status) throw status;

			if(callback) callback(null, self._filterStatus([status]));
			return null;
		})
		.catch(function(err) {
			if(callback) callback(err, false);
		});
	},

	'unload': function(callback) {
		var promiseResolutions = [],
			self = this;

		promiseResolutions.push(self._unloadServicesAsync());
		promiseResolutions.push(self._unloadUtilitiesAsync());

		promises.all(promiseResolutions)
		.then(function(status) {
			if(!status) throw status;

			if(callback) callback(null, self._filterStatus(status));
			return null;
		})
		.catch(function(err) {
			if(callback) callback(err, false);
		});
	}
});

exports.loader = serviceLoader;
