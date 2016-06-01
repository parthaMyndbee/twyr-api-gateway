/*
 * Name			: app/modules/services/auth-service/service.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Authentication Service - based on Passport and its infinite strategies
 *
 */

"use strict";

/**
 * Module dependencies, required for ALL Twy'r modules
 */
var base = require('./../service-base').baseService,
	prime = require('prime'),
	promises = require('bluebird');

/**
 * Module dependencies, required for this module
 */
var filesystem = require('fs'),
	passport = require('passport'),
	path = require('path');

var authService = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);

		this._setupPassportAsync = promises.promisify(this._setupPassport.bind(this));
		this._teardownPassportAsync = promises.promisify(this._teardownPassport.bind(this));
	},

	'start': function(dependencies, callback) {
		var self = this;
		console.log(self.name + ': ' + JSON.stringify(Object.keys(self)));
		authService.parent.start.call(self, dependencies, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			self._setupPassportAsync()
			.then(function() {
				if(callback) callback(null, status);
				return null;
			})
			.catch(function(setupErr) {
				if(callback) callback(setupErr);
			});
		});
	},

	'getInterface': function() {
		return this.$passport;
	},

	'stop': function(callback) {
		var self = this;

		authService.parent.stop.call(self, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			self._teardownPassportAsync()
			.then(function() {
				if(callback) callback(null, status);
			})
			.catch(function(teardownErr) {
				if(callback) callback(teardownErr);
			});
		});
	},

	'_reconfigure': function(config) {
		var self = this;
		if(!self['$enabled']) {
			self['$config'] = config;
			return;
		}

		self._teardownPassportAsync()
		.then(function() {
			self['$config'] = config;
			return self._setupPassportAsync();
		})
		.then(function() {
			return authService.parent._reconfigure.call(self, config);
		})
		.catch(function(err) {
			self.dependencies['logger-service'].error(self.name + '::_reconfigure:\n', err);
		});
	},

	'_setupPassport': function(callback) {
		var authStrategyPath = path.resolve(path.join(this.basePath, this.$config.strategies.path)),
			self = this;

		self['$passport'] = promises.promisifyAll(passport);
		filesystem.readdirAsync(authStrategyPath)
		.then(function(availableStrategies) {
			availableStrategies.forEach(function(thisStrategyFile) {
				var thisStrategy = require(path.join(self.basePath, self.$config.strategies.path, thisStrategyFile)).strategy;
				if(thisStrategy) (thisStrategy.bind(self))();
			});

			if(callback) callback(null);
			return null;
		})
		.catch(function(err) {
			if(callback) callback(err);
		});
	},

	'_teardownPassport': function(callback) {
		delete this['$passport'];
		if(callback) callback(null);
	},

	'name': 'auth-service',
	'basePath': __dirname,
	'dependencies': ['configuration-service', 'cache-service', 'database-service', 'logger-service']
});

exports.service = authService;
