/*
 * Name			: app/modules/services/api-service/service.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway API Service - allows modules to expose interfaces for use by other modules without direct references to each other
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

var apiService = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);
	},

	'start': function(dependencies, callback) {
		var self = this;
		apiService.parent.start.call(self, dependencies, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			var customMatch = (function(pattern, data) {
				var items = this.find(pattern, true) || [];
				items.push(data);

				return {
					'find': function(search, api) {
						return items.length ? items : [];
					},

					'remove': function(search, api) {
						items.pop();
						return !items.length;
					}
				}
			});

			self['$patrun'] = require('patrun')(customMatch);
			if(callback) callback(null, status);
		});
	},

	'getInterface': function() {
		return {
			'add': this.add.bind(this),
			'addAsync': this.addAsync.bind(this),

			'execute': this.execute.bind(this),
			'executAsync': this.executeAsync.bind(this),

			'remove': this.remove.bind(this),
			'removeAsync': this.removeAsync.bind(this)
		};
	},

	'stop': function(callback) {
		var self = this;

		apiService.parent.stop.call(self, function(err, status) {
			if(err) {
				callback(err);
				return;
			}

			delete self['$patrun'];
			if(callback) callback(null, status);
		});
	},

	'add': function(pattern, api, callback) {
		if(typeof(api) == 'function')
			api = promises.promisify(api);

		this['$patrun'].add(pattern, api);
		if(callback) callback(null, true);
	},

	'execute': function(pattern, data, callback) {
		var promiseResolutions = [];

		this['$patrun'].find(pattern).forEach(function(api) {
			if(typeof(api) == 'function')
				promiseResolutions.push(api(data));
			else
				promiseResolutions.push(api);
		});

		promises.all(promiseResolutions)
		.then(function(results) {
			if(callback) callback(null, results);
		})
		.catch(function(err) {
			if(callback) callback(err);
		});
	},

	'remove': function(pattern, api, callback) {
		if(typeof(api) == 'function')
			api = promises.promisify(api);

		var apis = this['$patrun'].find(pattern),
			idx = apis.indexOf(api);

		if(idx >= 0) apis.splice(idx, 1);
		if(callback) callback(null, true);
	},

	'name': 'api-service',
	'basePath': __dirname,
	'dependencies': ['configuration-service', 'logger-service']
});

exports.service = apiService;
