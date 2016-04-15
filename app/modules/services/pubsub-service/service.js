/*
 * Name			: app/modules/services/pubsub-service/service.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Publish/Subscribe Service - based on Ascoltatori
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
var ascoltatori = promises.promisifyAll(require('ascoltatori'));

var pubsubService = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);

		this._setupAscoltatoriAsync = promises.promisify(this._setupAscoltatori);
		this._teardownAscoltatoriAsync = promises.promisify(this._teardownAscoltatori);
	},

	'start': function(dependencies, callback) {
		var self = this;

		pubsubService.parent.start.call(self, dependencies, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			self['$listeners'] = {};
			self._setupAscoltatoriAsync(self['$config'], self['$listeners'])
			.then(function() {
				if(callback) callback(null, status);
			})
			.catch(function(setupErr) {
				if(callback) callback(setupErr);
			});
		});
	},

	'getInterface': function () {
		return {
			'publish': this.publish.bind(this),
			'publishAsync': this.publishAsync.bind(this),

			'subscribe': this.subscribe.bind(this),
			'subscribeAsync': this.subscribeAsync.bind(this),

			'unsubscribe': this.unsubscribe.bind(this),
			'unsubscribeAsync': this.unsubscribeAsync.bind(this)
		};
	},

	'publish': function(strategy, topic, data, options, callback) {
		var self = this,
			promiseResolutions = [];

		if(!Array.isArray(strategy))
			strategy = [strategy];

		if((typeof(options) == 'function') && (!callback)) {
			callback = options;
			options = null;
		}

		Object.keys(self.$listeners).forEach(function(pubsubStrategy) {
			if((strategy.indexOf('*') < 0) && (strategy.indexOf(pubsubStrategy) < 0)) return;
			promiseResolutions.push((self['$listeners'][pubsubStrategy]).publishAsync(topic, data, options));
		});

		if(!promiseResolutions.length) {
			if(callback) callback(new TypeError('Unknown Strategy'));
			return;
		}

		promises.all(promiseResolutions)
		.then(function() {
			if(callback) callback(null, true);
		})
		.catch(function(err) {
			if(callback) callback(err);
		});
	},

	'subscribe': function(strategy, topic, listener, callback) {
		var self = this,
			promiseResolutions = [];

		if(!Array.isArray(strategy))
			strategy = [strategy];

		Object.keys(self.$listeners).forEach(function(pubsubStrategy) {
			if((strategy.indexOf('*') < 0) && (strategy.indexOf(pubsubStrategy) < 0)) return;
			promiseResolutions.push((self['$listeners'][pubsubStrategy]).subscribeAsync(topic, listener));
		});

		if(!promiseResolutions.length) {
			if(callback) callback(new TypeError('Unknown Strategy'));
			return;
		}

		promises.all(promiseResolutions)
		.then(function() {
			if(callback) callback(null, true);
		})
		.catch(function(err) {
			if(callback) callback(err);
		});
	},

	'unsubscribe': function(topic, listener, callback) {
		var self = this,
			promiseResolutions = [];

		Object.keys(self.$listeners).forEach(function(pubsubStrategy) {
			promiseResolutions.push((self['$listeners'][pubsubStrategy]).unsubscribeAsync(topic, listener));
		});

		promises.all(promiseResolutions)
		.then(function() {
			if(callback) callback(null, true);
		})
		.catch(function(err) {
			if(callback) callback(err);
		});
	},

	'stop': function(callback) {
		var self = this;

		pubsubService.parent.stop.call(self, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			self._teardownAscoltatoriAsync(self['$config'], self['$listeners'])
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

		self._teardownAscoltatoriAsync(self['$config'], self['$listeners'])
		.then(function() {
			self['$config'] = config;
			return self._setupAscoltatoriAsync(self['$config'], self['$listeners']);
		})
		.catch(function(err) {
			self.dependencies['logger-service'].error(self.name + '::_reconfigure:\n', err);
		});
	},

	'_setupAscoltatori': function(config, listeners, callback) {
		var self = this,
			promiseResolutions = [];

		Object.keys(config).forEach(function(pubsubStrategy) {
			var buildSettings = JSON.parse(JSON.stringify(config[pubsubStrategy]));
			buildSettings[pubsubStrategy] = require(buildSettings[pubsubStrategy]);

			promiseResolutions.push(ascoltatori.buildAsync(buildSettings));
		});

		promises.all(promiseResolutions)
		.then(function(ascoltatories) {
			Object.keys(config).forEach(function(pubsubStrategy, index) {
				listeners[pubsubStrategy] = promises.promisifyAll(ascoltatories[index]);
			});

			if(callback) callback(null);
			return null;
		})
		.catch(function(err) {
			self.dependencies['logger-service'].error(self.name + '::_setupAscoltatori:\n', err);
			if(callback) callback(err);
		});
	},

	'_teardownAscoltatori': function(config, listeners, callback) {
		var self = this,
			promiseResolutions = [];

		Object.keys(listeners).forEach(function(pubsubStrategy) {
			promiseResolutions.push((listeners[pubsubStrategy]).closeAsync());
		});

		promises.all(promiseResolutions)
		.then(function() {
			listeners = {};
			if(callback) callback(null);

			return null;
		})
		.catch(function(err) {
			self.dependencies['logger-service'].error(self.name + '::_teardownAscoltatori:\n', err);
			if(callback) callback(err);
		});
	},

	'name': 'pubsub-service',
	'basePath': __dirname,
	'dependencies': ['configuration-service', 'logger-service']
});

exports.service = pubsubService;
