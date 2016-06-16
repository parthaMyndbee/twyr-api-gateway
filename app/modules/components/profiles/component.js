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

					'profileSocialLogins': function() {
						return this.hasMany(self.$SocialLoginModel, 'login');
					},

					'profileContacts': function() {
						return this.hasMany(self.$ContactModel, 'login');
					},

					'profileEmergencyContacts': function() {
						return this.hasMany(self.$EmergencyContactModel, 'login');
					},

					'profileOthersEmergencyContacts': function() {
						return this.hasMany(self.$EmergencyContactModel, 'contact');
					}
				})
			});

			Object.defineProperty(self, '$SocialLoginModel', {
				'__proto__': null,
				'value': dbSrvc.Model.extend({
					'tableName': 'user_social_logins',
					'idAttribute': 'id',

					'login': function() {
						return this.belongsTo(self.$UserModel, 'login');
					}
				})
			});

			Object.defineProperty(self, '$ContactModel', {
				'__proto__': null,
				'value': dbSrvc.Model.extend({
					'tableName': 'user_contacts',
					'idAttribute': 'id',

					'login': function() {
						return this.belongsTo(self.$UserModel, 'login');
					}
				})
			});

			Object.defineProperty(self, '$EmergencyContactModel', {
				'__proto__': null,
				'value': dbSrvc.Model.extend({
					'tableName': 'user_emergency_contacts',
					'idAttribute': 'id',

					'login': function() {
						return this.belongsTo(self.$UserModel, 'login');
					},

					'contact': function() {
						return this.belongsTo(self.$UserModel, 'contact');
					}
				})
			});

			if(callback) callback(null, status);
		});
	},

	'_addRoutes': function() {
		this.$router.get('/emergencyContact', this._getEmergencyContact.bind(this));
		this.$router.get('/homepages', this._getHomepages.bind(this));

		this.$router.get('/:id', this._getProfile.bind(this));
		this.$router.patch('/:id', this._updateProfile.bind(this));
		this.$router.post('/upload-image', this._updateProfileImage.bind(this));

		this.$router.post('/profile-contacts', this._addProfileContact.bind(this));
		this.$router.delete('/profile-contacts/:id', this._deleteProfileContact.bind(this));

		this.$router.post('/profile-emergency-contacts', this._addProfileEmergencyContact.bind(this));
		this.$router.delete('/profile-emergency-contacts/:id', this._deleteProfileEmergencyContact.bind(this));

		this.$router.post('/change-password', this._changePassword.bind(this));
	},

	'_getEmergencyContact': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'],
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		dbSrvc.knex.raw('SELECT id, first_name, last_name FROM users WHERE email ILIKE \'%' + request.query.filter + '%\' OR first_name ILIKE \'%' + request.query.filter + '%\' OR last_name ILIKE \'%' + request.query.filter + '%\'')
		.then(function(matchedUsers) {
			var responseData = [];
			for(var idx in matchedUsers.rows) {
				responseData.push({
					'id': matchedUsers.rows[idx].id,
					'name': matchedUsers.rows[idx].first_name + ' ' + matchedUsers.rows[idx].last_name
				});
			}

			response.status(200).json(responseData);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request "' + request.path + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(422).json({ 'code': 422, 'message': err.message || err.detail || 'Error fetching genders from the database' });
		});
	},

	'_getHomepages': function(request, response, next) {
		var self = this,
			dbSrvc = self.dependencies['database-service'],
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		dbSrvc.knex.raw('SELECT id, display_name, description FROM module_menus WHERE permission IN (SELECT DISTINCT permission FROM fn_get_user_permissions(?))', [request.user.id])
		.then(function(availHomepages) {
			var responseData = [];
			for(var idx in availHomepages.rows) {
				responseData.push(availHomepages.rows[idx]);
			}

			response.status(200).json(responseData);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request "' + request.path + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(422).json({ 'code': 422, 'message': err.message || err.detail || 'Error fetching genders from the database' });
		});
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

		new self.$UserModel({ 'id': request.user.id })
		.fetch({ 'withRelated': ['profileContacts', 'profileEmergencyContacts', 'profileOthersEmergencyContacts', 'profileSocialLogins'] })
		.then(function(profileData) {
			profileData = self['$jsonApiMapper'].map(profileData, 'profiles');
			delete profileData.data.attributes.password;
			delete profileData.included;

			response.status(200).json(profileData);
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Get profile error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
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

	'_updateProfileImage': function(request, response, next) {
		var self = this,
			Busboy = require('busboy'),
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);

		var busboy = new Busboy({ 'headers': request.headers });
		busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
			console.log('File [' + fieldname + ']: filename: ' + filename);

			file.on('data', function(data) {
				console.log('File [' + fieldname + '] got ' + data.length + ' bytes');
			});

			file.on('end', function() {
				console.log('File [' + fieldname + '] Finished');
			});
		});

		busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
			console.log('Field [' + fieldname + ']: value: ' + JSON.stringify(val, null, '\t'));
		});

		busboy.on('finish', function() {
			console.log('Done parsing form!');

			response.type('application/javascript');
			response.sendStatus(200);
		});

		request.pipe(busboy);
	},

	'_addProfileContact': function(request, response, next) {
		var self = this,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self['$jsonApiDeserializer'].deserializeAsync(request.body)
		.then(function(jsonDeserializedData) {
			jsonDeserializedData.login = request.user.id;

			return self.$ContactModel
			.forge()
			.save(jsonDeserializedData, {
				'patch': false
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
					'title': 'Add profile contact error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_deleteProfileContact': function(request, response, next) {
		var self = this,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		new self.$ContactModel({ 'id': request.params.id })
		.fetch()
		.then(function(profileContact) {
			if(profileContact.get('login') != request.user.id) {
				throw new Error('Contact does not belong to the logged-in User');
				return null;
			}

			return profileContact.destroy();
		})
		.then(function(savedRecord) {
			response.status(204).json({});
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Add profile contact error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_addProfileEmergencyContact': function(request, response, next) {
		var self = this,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		self['$jsonApiDeserializer'].deserializeAsync(request.body)
		.then(function(jsonDeserializedData) {
			jsonDeserializedData.login = request.user.id;
			jsonDeserializedData.contact = request.body.data.relationships.contact.data.id;

			return self.$EmergencyContactModel
			.forge()
			.save(jsonDeserializedData, {
				'patch': false
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
					'title': 'Add profile contact error',
					'detail': (err.stack.split('\n', 1)[0]).replace('error: ', '').trim()
				}]
			});
		});
	},

	'_deleteProfileEmergencyContact': function(request, response, next) {
		var self = this,
			loggerSrvc = self.dependencies['logger-service'];

		loggerSrvc.debug('Servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nParams: ', request.params, '\nBody: ', request.body);
		response.type('application/javascript');

		new self.$EmergencyContactModel({ 'id': request.params.id })
		.fetch()
		.then(function(profileEmergencyContact) {
			if(profileEmergencyContact.get('login') != request.user.id) {
				throw new Error('Emergency Contact does not belong to the logged-in User');
				return null;
			}

			return profileEmergencyContact.destroy();
		})
		.then(function(savedRecord) {
			response.status(204).json({});
			return null;
		})
		.catch(function(err) {
			loggerSrvc.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(422).json({
				'errors': [{
					'status': 422,
					'source': { 'pointer': '/data/id' },
					'title': 'Add profile contact error',
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
