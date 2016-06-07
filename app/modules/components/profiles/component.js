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
					}
				})
			});

			Object.defineProperty(self, '$SocialLoginModel', {
				'__proto__': null,
				'value': dbSrvc.Model.extend({
					'tableName': 'social_logins',
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
		.fetch()
		.then(function(userRecord) {
			if(!userRecord) {
				throw({
					'number': 404,
					'message': 'Unknown User Id. Please check your request and try again'
				});

				return;
			}

			userRecord = userRecord.toJSON();
			delete userRecord.password;

			response.status(200).json({
				'data': {
					'type': 'profiles',
					'id': request.params.id,
					'attributes': userRecord
				}
			});
			return null;
		})
		.catch(function(err) {
			self.$dependencies.logger.error('Error servicing request ' + request.method + ' "' + request.originalUrl + '":\nQuery: ', request.query, '\nBody: ', request.body, '\nParams: ', request.params, '\nError: ', err);
			response.status(422).json({
				'errors': {
					'status': 422,
					'code': err.code || err.number || 422,
					'title': 'Could not find the required profile',
					'detail': err.message
				}
			});
		});
	},

	'name': 'profiles',
	'basePath': __dirname,
	'dependencies': ['database-service', 'logger-service']
});

exports.component = profilesComponent;
