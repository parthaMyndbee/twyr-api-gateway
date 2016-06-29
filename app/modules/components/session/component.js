/*
 * Name			: app/modules/components/session/component.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Session Component - provides functionality to allow login / logout
 *
 */

"use strict";

/**
 * Module dependencies, required for ALL Twy'r modules
 */
var base = require('./../component-base').baseComponent,
	prime = require('prime'),
	promises = require('bluebird');

/**
 * Module dependencies, required for this module
 */

var sessionComponent = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);
	},

	'_addRoutes': function() {
		this.$router.post('/login', this._login.bind(this));
		this.$router.get('/logout', this._logout.bind(this));

		this.$router.get('/facebook', this._socialLoginRequest.bind(this, 'twyr-facebook'));
		this.$router.get('/github', this._socialLoginRequest.bind(this, 'twyr-github'));
		this.$router.get('/google', this._socialLoginRequest.bind(this, 'twyr-google'));
		this.$router.get('/linkedin', this._socialLoginRequest.bind(this, 'twyr-linkedin'));
		this.$router.get('/twitter', this._socialLoginRequest.bind(this, 'twyr-twitter'));

		this.$router.get('/facebookcallback', this._socialLoginResponse.bind(this, 'twyr-facebook'));
		this.$router.get('/githubcallback', this._socialLoginResponse.bind(this, 'twyr-github'));
		this.$router.get('/googlecallback', this._socialLoginResponse.bind(this, 'twyr-google'));
		this.$router.get('/linkedincallback', this._socialLoginResponse.bind(this, 'twyr-linkedin'));
		this.$router.get('/twittercallback', this._socialLoginResponse.bind(this, 'twyr-twitter'));
	},

	'_login': function(request, response, next) {
		var self = this,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		(self.dependencies['auth-service'].authenticate('twyr-local', function(err, user, info) {
			loggerSrvc.debug('twyr-local authentication result: \nErr: ', err, '\nUser: ', user, '\nInfo: ', info);

			if(err) {
				loggerSrvc.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', err);
				response.status(403).json({
					'status': request.isAuthenticated(),
					'responseText': err.message
				});

				return;
			}

			if(!user) {
				loggerSrvc.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', 'User not found');
				response.status(404).json({
					'status': request.isAuthenticated(),
					'responseText': 'Invalid credentials! Please try again!'
				});

				return;
			}

			request.login(user, function(loginErr) {
				if(loginErr) {
					loggerSrvc.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', loginErr);
					response.status(500).json({
						'status': request.isAuthenticated(),
						'responseText': 'Internal Error! Please contact us to resolve this issue!!'
					});

					return;
				}

				// Tell the rest of the web application that a new login has happened
				loggerSrvc.debug('Logged in: ', request.user.first_name + ' ' + request.user.last_name);
				self.$module.emit('login', request.user.id);

				// Acknowledge the request back to the requester
				response.status(200).json({
					'status': request.isAuthenticated(),
					'responseText': 'Login Successful! Redirecting...',
				});
			});
		}))(request, response, next);
	},

	'_logout': function(request, response, next) {
		var self = this,
			cacheSrvc = self.dependencies['cache-service'],
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self.$module.emit('logout', request.user.id);
		cacheSrvc.delAsync('twyr!webapp!user!' + request.user.id)
		.then(function() {
			loggerSrvc.debug('Logout: ', request.user.first_name + ' ' + request.user.last_name);
			request.logout();

			response.status(200).json({ 'status': !request.isAuthenticated() });
			return null;
		})
		.catch(function(err) {
			self.$dependencies.logger.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(err.code || err.number || 500).json(err);
		});
	},

	'_socialLoginRequest': function(strategy, request, response, next) {
		if(!request.user) {
			(this.dependencies['auth-service'].authenticate(strategy, function(err, user, info) {
				response.redirect(request.get('referrer'));
			}))(request, response, next);
		}
		else {
			(this.dependencies['auth-service'].authorize(strategy, function(err, user, info) {
				response.redirect(request.get('referrer'));
			}))(request, response, next);
		}
	},

	'_socialLoginResponse': function(strategy, request, response, next) {
		var self = this;
		if(!request.user) {
			(this.dependencies['auth-service'].authenticate(strategy, function(err, user, info) {
				request.login(user, function(err) {
					if(err) {
						self.dependencies['logger-service'].error(self.name + '::_socialLoginResponse authenticate\nStrategy: ', strategy,'\nError: ', err);
					}
					else {
						self.$module.emit('login', user.id);
					}

					response.redirect(request.get('referrer'));
				});
			}))(request, response, next);
		}
		else {
			(this.dependencies['auth-service'].authorize(strategy, function(err, user, info) {
				request.login(user, function(err) {
					if(err) {
						self.dependencies['logger-service'].error(self.name + '::_socialLoginResponse authorize\nStrategy: ', strategy, '\nError: ', err);
					}
					else {
						self.$dependencies.eventService.emit('login', user.id);
					}

					response.redirect(request.get('referrer'));
				});
			}))(request, response, next);
		}
	},

	'name': 'session',
	'basePath': __dirname,
	'dependencies': ['auth-service', 'cache-service']
});

exports.component = sessionComponent;
