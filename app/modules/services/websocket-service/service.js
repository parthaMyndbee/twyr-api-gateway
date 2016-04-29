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

var websocketService = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);

		this._setupPrimusAsync = promises.promisify(this._setupPrimus.bind(this));
		this._teardownPrimusAsync = promises.promisify(this._teardownPrimus.bind(this));
	},

	'start': function(dependencies, callback) {
		var self = this;
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
		self.$websocketServer.before('cookies', dependencies['express-service']['$cookieParser']);
		self.$websocketServer.before('session', function (request, response, next) {
			try {
				var sid = request.signedCookies['connect.sid'];
				if (!sid) { return next(); }

				request.pause();
				self.dependencies['express-service']['$sessionStore'].get(sid, function (err, session) {
					if (err) {
						self.$websocketServer.emit('log', 'error', err);
						return next();
					}

					if(session) {
						request.sessionID = sid;
						request.session = self.dependencies['express-service']['$sessionStore'].createSession(request, session);
						request.sessionStore = self.dependencies['express-service']['$sessionStore'];
					}

					request.resume();
					next();
				});
			}
			catch(error) {
				console.log(error);
			}
		});
		self.$websocketServer.use('rooms', PrimusRooms);

		// Step 4: Attach the event handlers...
		self.$websocketServer.on('initialised', self._websocketServerInitialised.bind(self));
		self.$websocketServer.on('log', self._websocketServerLog.bind(self));
		self.$websocketServer.on('error', self._websocketServerError.bind(self));

		// Step 5: Log connection / disconnection events
		self.$websocketServer.on('connection', self._websocketServerConnection.bind(self));
		self.$websocketServer.on('disconnection', self._websocketServerDisconnection.bind(self));

		if(callback) callback(null, true);
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
	},

	'_authorizeWebsocketConnection': function(request, done) {
		console.log(this.name + '::_authorizeWebsocketConnection: ' + JSON.stringify(request.session, null, '\t'));
		done();
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
		this.emit('websocket-connect', spark);
	},

	'_websocketServerDisconnection': function(spark) {
		this.emit('websocket-disconnect', spark);
		spark.leaveAll();
		spark.removeAllListeners();
	},

	'name': 'websocket-service',
	'basePath': __dirname,
	'dependencies': ['configuration-service', 'express-service', 'logger-service']
});

exports.service = websocketService;
