/*
 * Name			: app/module-base.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Base Module - serving as a template for all other modules, including the main server
 *
 */

"use strict";

/**
 * Module dependencies, required for ALL Twy'r modules
 */
var filesystem = require('fs'),
	path = require('path'),
	prime = require('prime'),
	promises = require('bluebird');

/**
 * Module dependencies, required for this module
 */
var uuid = require('node-uuid'),
	EventEmitter = require('events');

var twyrModuleBase = prime({
	'mixin': EventEmitter,

	'constructor': function(module, loader) {
		this['$module'] = module;
		this['$loader'] = loader;
		this['$uuid'] = uuid.v4().toString().replace(/-/g, '');

		if(!loader) {
			var ModuleLoader = require('./module-loader').loader;
			this['$loader'] = promises.promisifyAll(new ModuleLoader(this), {
				'filter': function(name, func) {
					return true;
				}
			});
		}

		this._existsAsync = promises.promisify(this._exists);
	},

	'load': function(configSrvc, callback) {
		// console.log(this.name + ' Load');

		var self = this,
			promiseResolutions = [];

		if(configSrvc)
			promiseResolutions.push(configSrvc.loadConfigAsync(self));
		else
			promiseResolutions.push(null);

		promises.all(promiseResolutions)
		.then(function(moduleConfig) {
			self['$config'] = configSrvc ? moduleConfig[0].configuration : self['$config'];
			self['$enabled'] = configSrvc ? moduleConfig[0].state : true;

			return self.$loader.loadAsync(configSrvc, self.basePath);
		})
		.then(function(status) {
			if(!status) throw status;
			if(callback) callback(null, status);

			return null;
		})
		.catch(function(err) {
			console.error(self.name + ' Load Error: ', err);
			if(callback) callback(err);
		});
	},

	'initialize': function(callback) {
		// console.log(this.name + ' Initialize');
		var self = this;

		this.$loader.initializeAsync()
		.then(function(status) {
			if(!status) throw status;
			if(callback) callback(null, status);

			return null;
		})
		.catch(function(err) {
			console.error(self.name + ' Initialize Error: ', err);
			if(callback) callback(err);
		});
	},

	'start': function(dependencies, callback) {
		// console.log(this.name + ' Start');
		var self = this;
		self['dependencies'] = dependencies;

		this.$loader.startAsync()
		.then(function(status) {
			if(!status) throw status;

			if(callback) callback(null, status);
			return null;
		})
		.catch(function(err) {
			console.error(self.name + ' Start Error: ', err);
			if(callback) callback(err);
		});
	},

	'stop': function(callback) {
		// console.log(this.name + ' Stop');
		var self = this;

		this.$loader.stopAsync()
		.then(function(status) {
			if(!status) throw status;
			if(callback) callback(null, status);

			self['dependencies'] = null;
			return null;
		})
		.catch(function(err) {
			console.error(self.name + ' Stop Error: ', err);
			if(callback) callback(err);
		});
	},

	'uninitialize': function(callback) {
		// console.log(this.name + ' Uninitialize');
		var self = this;

		this.$loader.uninitializeAsync()
		.then(function(status) {
			if(!status) throw status;
			if(callback) callback(null, status);

			return null;
		})
		.catch(function(err) {
			console.error(self.name + ' Uninitialize Error: ', err);
			if(callback) callback(err);
		});
	},

	'unload': function(callback) {
		// console.log(this.name + ' Unload');
		var self = this;

		this.$loader.unloadAsync()
		.then(function(status) {
			if(!status) throw status;
			if(callback) callback(null, status);

			return null;
		})
		.catch(function(err) {
			console.error(self.name + ' Unload Error: ', err);
			if(callback) callback(err);
		})
		.finally(function() {
			delete self['$loader'];
			delete self['$module'];

			return null;
		});
	},

	'_reconfigure': function(newConfig) {
		console.log(this.name + '::_reconfigure:\n' + JSON.stringify(newConfig, null, '\t'));
	},

	'_changeState': function(newState) {
		console.log(this.name + '::_changeState: ' + newState);
		this['$enabled'] = newState;
	},

	'_exists': function (path, mode, callback) {
		filesystem.access(path, mode || filesystem.F_OK, function (err) {
			if(callback) callback(null, !err);
		});
	},

	'name': 'twyr-module-base',
	'basePath': __dirname,
	'dependencies': []
});

exports.baseModule = twyrModuleBase;

