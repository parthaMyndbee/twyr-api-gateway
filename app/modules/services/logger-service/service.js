/*
 * Name			: app/modules/services/logger-service/service.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Logger Service
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
	winston = require('winston');

var loggerService = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);
	},

	'start': function(dependencies, callback) {
		var self = this;
		loggerService.parent.start.call(self, dependencies, function(err, status) {
			if(err) {
				callback(err);
				return;
			}

			self['$winston'] = new winston.Logger({
				'transports': [ new (winston.transports.Console)() ]
			});

			self._setupWinston(self['$config'], self['$winston']);

			// The first log of the day...
			self.$winston.info('Winston Logger successfully setup, and running...');

			// Ensure the logger isn't crashing the Server :-)
			self.$winston.exitOnError = false;
			self.$winston.emitErrs = false;

			if(callback) callback(null, status);
		});
	},

	'getInterface': function() {
		return this.$winston;
	},

	'stop': function(callback) {
		var self = this;
		loggerService.parent.stop.call(self, function(err, status) {
			if(err) {
				callback(err);
				return;
			}

			// The last log of the day...
			self.$winston.info('\n\nThe time is gone, the server is over, thought I\'d something more to play....\nGoodbye, blue sky, goodbye...\n');
			self._teardownWinston(self['$config'], self['$winston']);

			delete self['$winston'];
			if(callback) callback(null, status);
		});
	},

	'_reconfigure': function(config) {
		var self = this;
		if(!self['$enabled']) {
			self['$config'] = config;
			return;
		}

		try {
			self['$config'] = config;
			self._setupWinston(self['$config'], self['$winston']);
			loggerService.parent._reconfigure.call(self, config);
		}
		catch(err) {
			console.error(self.name + '::_reconfigure error: ', err);
		}
	},

	'_setupWinston': function(config, winstonInstance) {
		var rootPath = path.dirname(require.main.filename),
			transports = [];

		for(var transportIdx in config) {
			var thisTransport = JSON.parse(JSON.stringify(config[transportIdx]));

			if(thisTransport.filename) {
				var dirName = path.join(rootPath, path.dirname(thisTransport.filename)),
					baseName = path.basename(thisTransport.filename, path.extname(thisTransport.filename));

				thisTransport.filename = path.resolve(path.join(dirName, baseName + '-' + this.$module.$uuid + path.extname(thisTransport.filename)));
			}

			transports.push(new (winston.transports[transportIdx])(thisTransport));
		}

		// Re-configure with new transports
		winstonInstance.configure({
			'transports': transports
		});
	},

	'_teardownWinston': function(config, winstonInstance) {
		for(var transportIdx in config) {
			try {
				winstonInstance.remove(winstonInstance.transports[transportIdx]);
			}
			catch(error) {
				// console.error('Error Removing ' + transportIdx + ' from the Winston instance: ', err.message);
			}
		}
	},

	'name': 'logger-service',
	'basePath': __dirname,
	'dependencies': ['configuration-service']
});

exports.service = loggerService;
