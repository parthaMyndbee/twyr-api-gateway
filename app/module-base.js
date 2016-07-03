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
		//console.log(this.name + ' Initialize');
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

		if(!self['$enabled']) {
			self['dependencies'] = null;
			self['disabled-dependencies'] = dependencies;

			var startErr = new Error('Disabled in the configuration');
			if(callback) callback(startErr, false);
			return;
		}

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
		if(!self['$enabled']) {
			if(callback) callback(null, []);
			return;
		}

		this.$loader.stopAsync()
		.then(function(status) {
			if(!status) throw status;
			if(callback) callback(null, status);
			return null;
		})
		.catch(function(err) {
			console.error(self.name + ' Stop Error: ', err);
			if(callback) callback(err);
		});
	},

	'uninitialize': function(callback) {
		//console.log(this.name + ' Uninitialize');
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
		//console.log(this.name + ' Unload');
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
			delete self['$config'];
			delete self['$loader'];
			delete self['$module'];

			return null;
		});
	},

	'_reconfigure': function(newConfig) {
		var self = this;

		if(self.$services)
		Object.keys(self.$services).forEach(function(serviceName) {
			self.$services[serviceName]._parentReconfigure();
		});

		if(self.$middlewares)
		Object.keys(self.$middlewares).forEach(function(middlewareName) {
			self.$middlewares[middlewareName]._parentReconfigure();
		});

		if(self.$components)
		Object.keys(self.$components).forEach(function(componentName) {
			self.$components[componentName]._parentReconfigure();
		});

		if(self.$templates)
		Object.keys(self.$templates).forEach(function(templateName) {
			self.$templates[templateName]._parentReconfigure();
		});

		if(self.$dependants)
		Object.keys(self.$dependants).forEach(function(dependantName) {
			self.$dependants[dependantName]._dependencyReconfigure(self.name);
		});

		if(self.$module) {
			self.$module._subModuleReconfigure(self.name);
		}
	},

	'_changeState': function(newState) {
		if(this['$enabled'] == newState)
			return;

		var self = this;
		self['$enabled'] = newState;

		if(self['$enabled']) {
			self.startAsync(self['disabled-dependencies'])
			.then(function() {
				if(self.$services)
				Object.keys(self.$services).forEach(function(serviceName) {
					self.$services[serviceName]._parentStateChange(newState);
				});

				if(self.$middlewares)
				Object.keys(self.$middlewares).forEach(function(middlewareName) {
					self.$middlewares[middlewareName]._parentStateChange(newState);
				});

				if(self.$components)
				Object.keys(self.$components).forEach(function(componentName) {
					self.$components[componentName]._parentStateChange(newState);
				});

				if(self.$templates)
				Object.keys(self.$templates).forEach(function(templateName) {
					self.$templates[templateName]._parentStateChange(newState);
				});

				if(self.$dependants)
				Object.keys(self.$dependants).forEach(function(dependantName) {
					self.$dependants[dependantName]._dependencyStateChange(self.name, newState);
				});

				if(self.$module) {
					self.$module._subModuleStateChange(self.name, newState);
				}

				return null;
			})
			.catch(function(err) {
				console.error(self.name + '::_changeState: ' + newState + '\nError: ' + JSON.stringify(err, null, '\t'));
			})
			.finally(function() {
				delete self['disabled-dependencies'];
			});
		}
		else {
			self['disabled-dependencies'] = self['dependencies'];
			self.stopAsync()
			.then(function() {
				if(self.$services)
				Object.keys(self.$services).forEach(function(serviceName) {
					self.$services[serviceName]._parentStateChange(newState);
				});

				if(self.$middlewares)
				Object.keys(self.$middlewares).forEach(function(middlewareName) {
					self.$middlewares[middlewareName]._parentStateChange(newState);
				});

				if(self.$components)
				Object.keys(self.$components).forEach(function(componentName) {
					self.$components[componentName]._parentStateChange(newState);
				});

				if(self.$templates)
				Object.keys(self.$templates).forEach(function(templateName) {
					self.$templates[templateName]._parentStateChange(newState);
				});

				if(self.$dependants)
				Object.keys(self.$dependants).forEach(function(dependantName) {
					self.$dependants[dependantName]._dependencyStateChange(self.name, newState);
				});

				if(self.$module) {
					self.$module._subModuleStateChange(self.name, newState);
				}

				return null;
			})
			.catch(function(err) {
				console.error(self.name + '::_changeState: ' + newState + '\nError: ' + JSON.stringify(err, null, '\t'));
			});
		}
	},

	'_parentReconfigure': function() {
		if((process.env.NODE_ENV || 'development') == 'development') console.log(this.name + '::_parentReconfigure');
	},

	'_dependencyReconfigure': function(dependency) {
		if((process.env.NODE_ENV || 'development') == 'development') console.log(this.name + '::_dependencyReconfigure: ' + dependency);
	},

	'_subModuleReconfigure': function(subModule) {
		if((process.env.NODE_ENV || 'development') == 'development') console.log(this.name + '::_subModuleReconfigure: ' + subModule);
	},

	'_parentStateChange': function(state) {
		if((process.env.NODE_ENV || 'development') == 'development') console.log(this.name + '::_parentStateChange: ' + self.$module.name + ' is now ' + (state ? 'enabled' : 'disabled'));
	},

	'_dependencyStateChange': function(dependency, state) {
		if((process.env.NODE_ENV || 'development') == 'development') console.log(this.name + '::_dependencyStateChange: ' + dependency + ' is now ' + (state ? 'enabled' : 'disabled'));
	},

	'_subModuleStateChange': function(subModule, state) {
		if((process.env.NODE_ENV || 'development') == 'development') console.log(this.name + '::_subModuleStateChange: ' + subModule + ' is now ' + (state ? 'enabled' : 'disabled'));
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

