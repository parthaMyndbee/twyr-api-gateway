/*
 * Name			: app/modules/services/websocket-service/service.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Websocket Service - based on Primus using WS Transformer
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
var httpMocks = require('node-mocks-http');

var websocketService = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);

		this._setupPrimusAsync = promises.promisify(this._setupPrimus.bind(this));
		this._teardownPrimusAsync = promises.promisify(this._teardownPrimus.bind(this));
	},

	'start': function(dependencies, callback) {
		var self = this;

		self._initializedAuthService = dependencies['auth-service'].initialize();
		self._initializedAuthSession = dependencies['auth-service'].session();

		websocketService.parent.start.call(self, dependencies, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			self._setupPrimusAsync(dependencies)
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
		return this.$websocketServer;
	},

	'stop': function(callback) {
		var self = this;
		websocketService.parent.stop.call(self, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			self._teardownPrimusAsync()
			.then(function() {
				self._initializedAuthService = undefined;
				self._initializedAuthSession = undefined;

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
		if(!self['$enabled']) {
			self['$config'] = config;
			return;
		}

		self._teardownPrimusAsync()
		.then(function() {
			self['$config'] = config;
			return self._setupPrimusAsync(self.dependencies);
		})
		.then(function() {
			return websocketService.parent._reconfigure.call(self, config);
		})
		.catch(function(err) {
			self.dependencies['logger-service'].error(self.name + '::_reconfigure:\n', err);
		});
	},

	'_dependencyReconfigure': function(dependency) {
		if(dependency != 'express-service')
			return;

		var thisConfig = JSON.parse(JSON.stringify(this['$config']));
		return this._reconfigure(thisConfig);
	},

	'_dependencyStateChange': function(dependency, state) {
		if(dependency != 'express-service')
			return;

		return this._changeState(state);
	},

	'_setupPrimus': function(dependencies, callback) {
		var PrimusServer = require('primus'),
			PrimusRooms = require('primus-rooms'),
			self = this;

		// Step 1: Setup the realtime streaming server
		var thisConfig = JSON.parse(JSON.stringify(self.$config));
		self['$websocketServer'] = new PrimusServer(dependencies['express-service']['$server'], thisConfig);

		// Step 2: Put in the authorization hook
		self.$websocketServer.authorize(self._authorizeWebsocketConnection.bind(self));

		// Step 3: Primus extensions...
		self.$websocketServer.use('rooms', PrimusRooms);

		// Step 4: Attach the event handlers...
		self.$websocketServer.on('initialised', self._websocketServerInitialised.bind(self));
		self.$websocketServer.on('log', self._websocketServerLog.bind(self));
		self.$websocketServer.on('error', self._websocketServerError.bind(self));

		// Step 5: Log connection / disconnection events
		self.$websocketServer.on('connection', self._websocketServerConnection.bind(self));
		self.$websocketServer.on('disconnection', self._websocketServerDisconnection.bind(self));

		if(callback) callback(null, true);
		return null;
	},

	'_teardownPrimus': function(callback) {
		var self = this;

		if(self['$websocketServer']) {
			self['$websocketServer'].end({
				'close': false,
				'timeout': 10
			});

			delete self['$websocketServer'];
		}

		if(callback) callback(null, true);
		return null;
	},

	'_authorizeWebsocketConnection': function(request, done) {
		var self = this,
			response = httpMocks.createResponse();

		self.dependencies['express-service']['$cookieParser'](request, response, function(err) {
			if(err) {
				done(err);
				return;
			}

			self.dependencies['express-service']['$session'](request, response, function(err) {
				if(err) {
					done(err);
					return;
				}

				self._initializedAuthService(request, response, function(err) {
					if(err) {
						done(err);
						return;
					}

					self._initializedAuthSession(request, response, function(err) {
						done(err);
					});
				});
			});
		});
	},

	'_websocketServerInitialised': function(transformer, parser, options) {
		console.log('Websocket Server has been initialised with options: ' + JSON.stringify(options, null, '\t') + '\n');
	},

	'_websocketServerLog': function() {
		console.log('Websocket Server Log: ' + JSON.stringify(arguments, null, '\t'));
	},

	'_websocketServerError': function() {
		console.error('Websocket Server Error: ' + JSON.stringify(arguments, null, '\t'));
		this.emit('websocket-error', arguments);
	},

	'_websocketServerConnection': function(spark) {
		var username = (spark.request.user ? [spark.request.user.first_name, spark.request.user.last_name].join(' ') : 'Public');
		console.log('Websocket Server Connection for user: ' + username);

		this.emit('websocket-connect', spark);
		spark.write({ 'channel': 'display-status-message', 'data': 'Realtime Data connection established for User: ' + username });
	},

	'_websocketServerDisconnection': function(spark) {
		this.emit('websocket-disconnect', spark);
		spark.leaveAll();
		spark.removeAllListeners();
	},

	'name': 'websocket-service',
	'basePath': __dirname,
	'dependencies': ['auth-service', 'configuration-service', 'express-service', 'logger-service']
});

exports.service = websocketService;
