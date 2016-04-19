/*
 * Name			: app/modules/services/express-service/service.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy\'r API Gateway Webserver Service - based on Express and node.js HTTP/HTTPS modules
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
var domain = require('domain'),
	filesystem = require('fs'),
	path = require('path');

var expressService = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);

		this._setupExpressAsync = promises.promisify(this._setupExpress.bind(this));
		this._teardownExpressAsync = promises.promisify(this._teardownExpress.bind(this));
	},

	'start': function(dependencies, callback) {
		var self = this;

		self._setupExpressAsync(dependencies)
		.catch(function(err) {
			if(callback) callback(err);
		})
		.finally(function() {
			expressService.parent.start.call(self, dependencies, callback);
			return null;
		});
	},

	'getInterface': function() {
		return this.$express;
	},

	'stop': function(callback) {
		var self = this;

		self._teardownExpressAsync()
		.then(function() {
			expressService.parent.stop.call(self, function(err, status) {
				if(err) {
					if(callback) callback(err);
					return;
				}

				if(callback) callback(null, status);
			});

			return null;
		})
		.catch(function(err) {
			if(callback) callback(err);
		})
	},

	'_reconfigure': function(config) {
		var self = this;

		self._teardownExpressAsync()
		.then(function() {
			self['$config'] = config;
			return self._setupExpressAsync(self.dependencies);
		})
		.catch(function(err) {
			self.dependencies['logger-service'].error(self.name + '::_reconfigure:\n', err);
		});
	},

	'_setupExpress': function(dependencies, callback) {
		var self = this;

		// Step 1: Require the Web Server
		var express = require('express'),
			acceptOverride = require('connect-acceptoverride'),
			bodyParser = require('body-parser'),
			cookieParser = require('cookie-parser'),
			compress = require('compression'),
			cors = require('cors'),
			debounce = require('connect-debounce'),
			engines = require('consolidate'),
			flash = require('connect-flash'),
			logger = require('morgan'),
			methodOverride = require('method-override'),
			poweredBy = require('connect-powered-by'),
			session = require('express-session'),
			sessStore = require('connect-' + self.$config.session.store.media)(session),
			timeout = require('connect-timeout'),
			loggerSrvc = dependencies['logger-service'];

		// Step 2: Setup Winston for Express Logging
		var loggerStream = {
			'write': function(message, encoding) {
				loggerSrvc.silly(message);
			}
		};

		// Step 3: Setup CORS configuration
		var corsOptions = {
			'origin': function(origin, callback) {
				if(!self.$config.corsAllowedDomains) {
					callback(null, true);
					return;
				}

				var isAllowedOrigin = (self.$config.corsAllowedDomains.indexOf(origin) !== -1);
				callback(null, isAllowedOrigin);
			},

			'credentials': true
		};

		// Step 4: Setup Session Store, etc.
		var sessionStore = new sessStore({
			'client': dependencies['cache-service'],
			'prefix': self.$config.session.store.prefix,
			'ttl': self.$config.session.ttl
		});

		self['$cookieParser'] = cookieParser(self.$config.session.secret, self.$config.cookieParser);
		self['$session'] = session({
			'cookie': self.$config.cookieParser,
			'key': self.$config.session.key,
			'secret': self.$config.session.secret,
			'store': sessionStore,
			'saveUninitialized': true,
			'resave': false
		});

		// Step 5: Setup Express
		var webServer = express();
		self['$express'] = webServer;

		webServer.set('view engine', self.$config.templateEngine);
//		webServer.set('views', path.join(__dirname, self.$config.templateDir));
		webServer.engine(self.$config.templateEngine, engines[self.$config.templateEngine]);

		if(self.$config.cookieParser.secure) {
			webServer.set('trust proxy', 1)
		};

		webServer
		.use(logger('combined', {
			'stream': loggerStream
		}))
		.use(function(request, response, next) {
			if(!self['$enabled']) {
				response.status(500).redirect('/error');
				return;
			}

			var requestDomain = domain.create();
			requestDomain.add(request);
			requestDomain.add(response);

			requestDomain.on('error', function(error) {
				loggerSrvc.error('Error servicing request "' + request.path + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', error);
				response.status(500).redirect('/error');
			});

			next();
		})
		.use(debounce())
		.use(cors(corsOptions))
		.use(acceptOverride())
		.use(methodOverride())
		.use(compress())
		.use(poweredBy(self.$config.poweredBy))
		.use(timeout(self.$config.requestTimeout * 1000))
		.use(flash())
		.use(self.$cookieParser)
		.use(self.$session)
		.use(bodyParser.json({
			'limit': self.$config.maxRequestSize
		}))
		.use(bodyParser.json({
			'type': 'application/vnd.api+json',
			'limit': self.$config.maxRequestSize
		}))
		.use(bodyParser.raw({
			'limit': self.$config.maxRequestSize
		}))
		.use(bodyParser.text({
			'limit': self.$config.maxRequestSize
		}))
		.use(bodyParser.urlencoded({
			'extended': true,
			'limit': self.$config.maxRequestSize
		}))
		.use(dependencies['auth-service'].initialize())
		.use(dependencies['auth-service'].session());

		// Step 6: Create the Server
		var protocol = require(self.$config.protocol || 'http');
		if((self.$config.protocol || 'http') == 'http') {
			self['$server'] = protocol.createServer(webServer);
		}
		else {
			self.$config.ssl.key = filesystem.readFileSync(path.join(__dirname, self.$config.ssl.key));
			self.$config.ssl.cert = filesystem.readFileSync(path.join(__dirname, self.$config.ssl.cert));
			self['$server'] = protocol.createServer(self.$config.ssl, webServer);
		}

		// Step 7: Setup start flow listening
		self.$server.once('error', function(error) {
			if(callback) callback(error);
		});

		self.$server.once('listening', function() {
			self.$server.on('connection', self._serverConnection.bind(self));
			self.$server.on('error', self._serverError.bind(self));

			if(callback) callback(null, true);
		});

		// Step 8: Start listening...
		self.$server.listen(self.$config.port || 8000);

		// Miscellaneous...
		self['$express']['$server'] =  self['$server'];
		self['$express']['$session'] =  self['$session'];
		self['$express']['$cookieParser'] = self['$cookieParser'];
	},

	'_teardownExpress': function(callback) {
		var self = this;

		this.$server.once('close', function() {
			delete self['$express']['$server'];
			delete self['$express']['$session'];
			delete self['$express']['$cookieParser'];

			delete self['$server'];
			delete self['$express'];
			delete self['$session'];
			delete self['$cookieParser'];

			if(callback) callback(null, true);
		});

		self.$server.close();
	},

	'_serverConnection': function(socket) {
		socket.setTimeout(this.$config.connectionTimeout * 1000);
	},

	'_serverError': function(error) {
		this.dependencies['logger-service'].error('Server Error: ', JSON.stringify(error, null, '\t'));
	},

	'name': 'express-service',
	'basePath': __dirname,
	'dependencies': ['auth-service', 'cache-service', 'configuration-service', 'logger-service']
});

exports.service = expressService;
