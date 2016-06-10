/*
 * Name			: app/modules/components/profiles/component.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Profile Component - provides functionality to allow users to manage their own profile
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
var bcrypt = require('bcrypt-nodejs');

var profilesComponent = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);
	},

	'start': function(dependencies, callback) {
		// console.log(this.name + ' Start');

		var self = this;
		profilesComponent.parent.start.call(self, dependencies, function(err, status) {
			if(err) {
				if(callback) callback(err);
				return;
			}

			// Define the models....
			var dbSrvc = self.dependencies['database-service'];

			Object.defineProperty(self, '$UserModel', {
				'__proto__': null,
				'value': dbSrvc.Model.extend({
					'tableName': 'users',
					'idAttribute': 'id',

					'socialLogins': function() {
						return this.hasMany(self.$SocialLoginModel, 'user_id');
					},

					'contacts': function() {
						return this.hasMany(self.$ContactModel, 'user_id');
					}
				})
			});

			Object.defineProperty(self, '$SocialLoginModel', {
				'__proto__': null,
				'value': dbSrvc.Model.extend({
					'tableName': 'user_social_logins',
					'idAttribute': 'id',

					'user': function() {
						return this.belongsTo(self.$UserModel, 'user_id');
					}
				})
			});

			Object.defineProperty(self, '$ContactModel', {
				'__proto__': null,
				'value': dbSrvc.Model.extend({
					'tableName': 'user_contacts',
					'idAttribute': 'id',

					'user': function() {
						return this.belongsTo(self.$UserModel, 'user_id');
					}
				})
			});

			if(callback) callback(null, status);
		});
	},

	'_addRoutes': function() {
		this.$router.get('/:id', this._getProfile.bind(this));
		this.$router.patch('/:id', this._updateProfile.bind(this));

		this.$router.post('/change-password', this._changePassword.bind(this));
	},

	'_getProfile': function(request, response, next) {
		var self = this,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		if(request.user.id != request.params.id) {
			response.status(422).json({
				'errors': {
					'status': 403,
					'code': 403,
					'title': 'Unauthorized Access',
					'detail': 'Profile information of other users is private'
				}
			});
			return;
		}

		new self.$UserModel({ 'id': request.params.id })
		.fetch({ 'withRelated': 'contacts' })
		.then(function(userRecord) {
			if(!userRecord) {
				throw({
					'number': 404,
					'message': 'Unknown User Id. Please check your request and try again'
				});

				return null;
			}

			var mappedData = self['$jsonApiMapper'].map(userRecord, 'profiles');
			delete mappedData.data.attributes.password;

			response.status(200).json(mappedData);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Could not find the required profile',
					'detail': err.detail || err.message
				}]
			});
		});
	},

	'_updateProfile': function(request, response, next) {
		var self = this,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		if(request.user.id != request.params.id) {
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Unauthorized Access',
					'detail': 'Profile information of other users is private'
				}]
			});

			return;
		}

		self['$jsonApiDeserializer'].deserializeAsync(request.body)
		.then(function(jsonDeserializedData) {
			delete jsonDeserializedData.email;
			delete jsonDeserializedData.created_at;
			delete jsonDeserializedData.updated_at;

			return self.$UserModel
			.forge()
			.save(jsonDeserializedData, {
				'patch': true
			});
		})
		.then(function(savedRecord) {
			response.status(200).json({
				'data': {
					'type': request.body.data.type,
					'id': savedRecord.get('id')
				}
			});

			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Update profile error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_changePassword': function(request, response, next) {
		var self = this,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		new self.$UserModel({ 'id': request.user.id })
		.fetch()
		.then(function(userRecord) {
			if(request.body.newPassword1 != request.body.newPassword2) {
				throw({ 'code': 403, 'message': 'The new passwords do not match' });
				return;
			}

			if(!bcrypt.compareSync(request.body.currentPassword, userRecord.get('password'))) {
				throw({ 'code': 403, 'message': 'Incorrect current password' });
				return;
			}

			userRecord.set('password', bcrypt.hashSync(request.body.newPassword1));
			return userRecord.save();
		})
		.then(function() {
			response.status(200).json({
				'status': true,
				'responseText': 'Change Password Successful!'
			});

			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query,  '\nParams: ', request.params, '\nError: ', err);
			response.status(500).json({
				'status': false,
				'message': err.message || err.detail || 'Change Password Failure!'
			});
		});
	},

	'name': 'profiles',
	'basePath': __dirname,
	'dependencies': ['database-service', 'logger-service']
});

exports.component = profilesComponent;
