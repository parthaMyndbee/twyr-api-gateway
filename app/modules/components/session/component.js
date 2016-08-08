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
var bcrypt = require('bcrypt-nodejs'),
	emailExists = promises.promisifyAll(require('email-existence')),
	path = require('path'),
	uuid = require('node-uuid'),
	validator = require('validatorjs');

var sessionComponent = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);
	},

	'_addRoutes': function() {
		this.$router.post('/login', this._login.bind(this));
		this.$router.get('/logout', this._logout.bind(this));

		this.$router.post('/resetPassword', this._resetPassword.bind(this));
		this.$router.post('/registerAccount', this._registerAccount.bind(this));

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
				response.status(200).json({
					'status': request.isAuthenticated(),
					'responseText': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				});

				return;
			}

			if(!user) {
				loggerSrvc.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', 'User not found');
				response.status(200).json({
					'status': request.isAuthenticated(),
					'responseText': 'Invalid credentials! Please try again!'
				});

				return;
			}

			request.login(user, function(loginErr) {
				if(loginErr) {
					loggerSrvc.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', loginErr);
					response.status(200).json({
						'status': request.isAuthenticated(),
						'responseText': (loginErr.stack.split('\n', 1)[0]).replace('error: ', '').trim() || 'Internal Error! Please contact us to resolve this issue!!'
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
			response.status(200).json({
				'status': false,
				'responseText': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
			});
		});
	},

	'_resetPassword': function(request, response, next) {
		var self = this,
			cacheSrvc = self.dependencies['cache-service'],
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'],
			mailerSrvc = self.dependencies['mailer-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		dbSrvc.raw('SELECT id FROM users WHERE email = ?', [request.body.username])
		.then(function(result) {
			if(!result.rows.length) {
				throw ({
					'number': 404,
					'message': 'User "' + request.body.username + '" not found!'
				});
			}

			var randomRequestData = JSON.parse(JSON.stringify(self.$config.randomServer.options));
			randomRequestData.data.id = uuid.v4().toString().replace(/-/g, '');
			randomRequestData.data = JSON.stringify(randomRequestData.data);

			return promises.all([result.rows[0].id, self.$module.$utilities.restCallAsync(self.$config.randomServer.protocol, randomRequestData)]);
		})
		.then(function(results) {
			var userId = results[0],
				randomData = (results[1] ? JSON.parse(results[1]) : null);

			if(randomData && randomData.error) {
				throw new Error(randomData.error.message);
			}

			var newPassword = ((randomData && randomData.result) ? randomData.result.random.data[0] : self._generateRandomPassword());
			return promises.all([newPassword, dbSrvc.raw('UPDATE users SET password = ? WHERE id = ?', [bcrypt.hashSync(newPassword), userId])]);
		})
		.then(function(results) {
			var newPassword = results[0],
				renderOptions = {
				'username': request.body.username,
				'password': newPassword
			};

			var renderer = promises.promisify(response.render.bind(response));
			return renderer(path.join(self.basePath, self.$config.resetPassword.template), renderOptions);
		})
		.then(function(html) {
			return mailerSrvc.sendMailAsync({
				'from': self.$config.from,
				'to': request.body.username,
				'subject': self.$config.resetPassword.subject,
				'html': html
			});
		})
		.then(function(notificationResponse) {
			loggerSrvc.debug('Response from Email Server: ', notificationResponse);
			response.status(200).json({
				'status': true,
				'responseText': 'Reset Password Successful! Please check your email for details'
			});

			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(200).json({
				'status': false,
				'responseText': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim() || 'Reset Password Failure!'
			});
		})
	},

	'_registerAccount': function(request, response, next) {
		var self = this,
			cacheSrvc = self.dependencies['cache-service'],
			dbSrvc = self.dependencies['database-service'].knex,
			loggerSrvc = self.dependencies['logger-service'],
			mailerSrvc = self.dependencies['mailer-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		dbSrvc.raw('SELECT id FROM users WHERE email = ?', [request.body.username])
		.then(function(result) {
			if(result.rows.length) {
				throw ({
					'number': 404,
					'message': 'User "' + request.body.username + '" already exists! Please use the forgot password link to access the account!!'
				});
			}

			var validationData = {
					'username': (request.body.username && (request.body.username.trim() == '')) ? '' : request.body.username,
					'firstname': (request.body.firstname && (request.body.firstname.trim() == '')) ? '' : request.body.firstname,
					'lastname': (request.body.lastname && (request.body.lastname.trim() == '')) ? '' : request.body.lastname
				},
				validationRules = {
					'username': 'required|email',
					'firstname': 'required',
					'lastname': 'required'
				};

			var validationResult = new validator(validationData, validationRules);
			if(validationResult.fails()) {
				throw validationResult.errors.all();
			}

			return emailExists.checkAsync(validationData.username);
		})
		.then(function(emailExists) {
			if(!emailExists) {
				throw { 'code': 403, 'message': 'Invalid Email Id (' + ((request.body.username && (request.body.username.trim() == '')) ? '' : request.body.username) + ')' };
			}

			var randomRequestData = JSON.parse(JSON.stringify(self.$config.randomServer.options));
			randomRequestData.data.id = uuid.v4().toString().replace(/-/g, '');
			randomRequestData.data = JSON.stringify(randomRequestData.data);

			return self.$module.$utilities.restCallAsync(self.$config.randomServer.protocol, randomRequestData);
		})
		.then(function(randomPassword) {
			randomPassword = (randomPassword ? JSON.parse(randomPassword) : null);
			if(randomPassword && randomPassword.error) {
				throw new Error(randomPassword.error.message);
			}

			var newPassword = ((randomPassword && randomPassword.result) ? randomPassword.result.random.data[0] : self._generateRandomPassword());
			return promises.all([ newPassword, dbSrvc.raw('INSERT INTO users (first_name, last_name, email, password) VALUES (?, ?, ?, ?) RETURNING id', [
				(request.body.firstname && (request.body.firstname.trim() == '')) ? null : request.body.firstname,
				(request.body.lastname && (request.body.lastname.trim() == '')) ? null : request.body.lastname,
				(request.body.username && (request.body.username.trim() == '')) ? null : request.body.username,
				bcrypt.hashSync(newPassword)
			]) ]);
		})
		.then(function(result) {
			var renderOptions = {
				'username': request.body.username,
				'password': result[0]
			};

			var renderer = promises.promisify(response.render.bind(response));
			return promises.all([
				renderer(path.join(self.basePath, self.$config.newAccount.template), renderOptions),
				dbSrvc.raw('INSERT INTO tenants_users (tenant, login) SELECT id, ? FROM tenants WHERE parent IS NULL;', [result[1].rows[0].id])
			]);
		})
		.then(function(result) {
			return mailerSrvc.sendMailAsync({
				'from': self.$config.from,
				'to': request.body.username,
				'subject': self.$config.newAccount.subject,
				'html': result[0]
			});
		})
		.then(function(notificationResponse) {
			loggerSrvc.debug('Response from Email Server: ', notificationResponse);
			response.status(200).json({
				'status': true,
				'responseText': 'Account registration successful! Please check your email for details'
			});

			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(200).json({
				'status': false,
				'responseText': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim() || 'Account registration failure!'
			});
		})
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

	'_generateRandomPassword': function() {
		return 'xxxxxxxx'.replace(/[x]/g, function(c) {
			var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
			return v.toString(16);
		});
	},

	'name': 'session',
	'basePath': __dirname,
	'dependencies': ['auth-service', 'cache-service', 'database-service', 'mailer-service']
});

exports.component = sessionComponent;
