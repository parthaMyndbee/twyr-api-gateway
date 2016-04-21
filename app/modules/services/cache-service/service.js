/*
 * Name			: app/modules/services/cache-service/service.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Cache Service - based on Redis
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
var path = require('path'),
	redis = require('redis');

var cacheService = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);

		redis.RedisClient.prototype = promises.promisifyAll(redis.RedisClient.prototype);
		redis.Multi.prototype = promises.promisifyAll(redis.Multi.prototype);

		this._setupCacheAsync = promises.promisify(this._setupCache.bind(this));
		this._teardownCacheAsync = promises.promisify(this._teardownCache.bind(this));
	},

	'start': function(dependencies, callback) {
		var self = this;
		cacheService.parent.start.call(self, dependencies, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			self._setupCacheAsync()
			.then(function() {
				if(callback) callback(null, status);
				return null;
			})
			.catch(function(err) {
				if(callback) callback(err);
			});
		});
	},

	'getInterface': function() {
		return this.$cache;
	},

	'stop': function(callback) {
		var self = this;
		cacheService.parent.stop.call(self, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			self._teardownCacheAsync()
			.then(function() {
				if(callback) callback(null, status);
				return null;
			})
			.catch(function(teardownErr) {
				if(callback) callback(teardownErr);
			});
		});
	},

	'_reconfigure': function(config) {
		var self = this;

		self._teardownCacheAsync()
		.then(function() {
			self['$config'] = config;
			return self._setupCacheAsync();
		})
		.then(function() {
			return cacheService.parent._reconfigure.call(self, config);
		})
		.catch(function(err) {
			self.dependencies['logger-service'].error(self.name + '::_reconfigure:\n', err);
		});
	},

	'_setupCache': function(callback) {
		var self = this;

		var thisConfig = JSON.parse(JSON.stringify(self['$config']));
		thisConfig.options['retry_strategy'] = (function (options) {
			if (options.error.code === 'ECONNREFUSED') {
				// End reconnecting on a specific error and flush all commands with a individual error
				return new Error('The server refused the connection');
			}

			if (options.total_retry_time > 1000 * 60 * 60) {
				// End reconnecting after a specific timeout and flush all commands with a individual error
				return new Error('Retry time exhausted');
			}

			if (options.times_connected > 10) {
				// End reconnecting with built in error
				return undefined;
			}

			// reconnect after
			return Math.max(options.attempt * 100, 3000);
		});

		self['$cache'] = redis.createClient(self.$config.port, self.$config.host, self.$config.options);
		self.$cache.on('connect', function(status) {
			if(callback) callback(null, status);
		});

		self.$cache.on('error', function(err) {
			if(callback) callback(err);
		});
	},

	'_teardownCache': function(callback) {
		var self = this;

		self.$cache.quitAsync()
		.then(function() {
			self.$cache.end(true);
			delete self['$cache'];

			if(callback) callback(null);
			return null;
		})
		.catch(function(err) {
			if(callback) callback(err);
		});
	},

	'name': 'cache-service',
	'basePath': __dirname,
	'dependencies': ['configuration-service', 'logger-service']
});

exports.service = cacheService;
