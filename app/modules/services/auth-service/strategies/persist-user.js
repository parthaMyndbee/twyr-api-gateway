/*
 * Name			: app/modules/services/auth-service/strategies/persist-user.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Authentication Information Persistence
 *
 */

"use strict";

/**
 * Module dependencies.
 */
var bcrypt = require('bcrypt-nodejs'),
	uuid = require('node-uuid');

var User = null,
	UserSocialLogins = null;

exports.socialAuthenticate = (function(request, profile, token, done) {
	var self = this,
		database = self.dependencies['database-service'],
		logger = self.dependencies['logger-service'];

	if(!User) {
		User = database.Model.extend({
			'tableName': 'users',
			'idAttribute': 'id',

			'social': function() {
				return this.hasMany(UserSocialLogins, 'login');
			}
		});
	}

	if(!UserSocialLogins) {
		UserSocialLogins = database.Model.extend({
			'tableName': 'user_social_logins',
			'idAttribute': 'id',

			'user': function() {
				return this.belongsTo(User, 'login');
			}
		});
	}

	// Step 1: Is this user already in the database?
	UserSocialLogins.where({ 'provider': profile.provider, 'provider_uid': profile.id }).fetch({'withRelated': ['user']})
	.then(function(userSocialRecord) {
		if(userSocialRecord) {
			var responseUser = userSocialRecord.related('user').toJSON();
			done(null, { 'id': responseUser.id });
		}
		else {
			var newSocialUser = false;

			// Special handling for Twitter...
			if(!profile.emails) {
				profile.emails = [];
				profile.emails.push({ 'value': profile.username + '@' + profile.provider + '.com' });

				var names = profile.displayName.split(' ');
				profile.name = {};
				profile.name.givenName = names[0] || '';
				profile.name.familyName = names[1] || '';
			}

			User.where({ 'email': profile.emails[0].value }).fetch()
			.then(function(userRecord) {
				if(userRecord) {
					return userRecord;
				}

				newSocialUser = true;
				return new User({
					'first_name': profile.name.givenName,
					'last_name': profile.name.familyName,
					'email': profile.emails[0].value,
					'password': bcrypt.hashSync('twyrwebapp')
				}).save();
			})
			.then(function(userRecord) {
				return new UserSocialLogins({
					'provider': profile.provider,
					'provider_uid': profile.id,
					'display_name': profile.displayName || profile.emails[0].value,
					'login': userRecord.get('id'),
					'social_data': profile._json
				}).save();
			})
			.then(function(userSocialLoginRecord) {
				if(newSocialUser) {
					self.$module.emit('socialregistration', userSocialLoginRecord.get('login'), request.query.state);
				}

				done(null, { 'id': userSocialLoginRecord.get('login'), 'first_name': profile.name.givenName, 'last_name': profile.name.familyName });
				return null;
			})
			.catch(function(err) {
				logger.error('socialAuthenticate Profile:\nData: ', profile, '\nError: ', JSON.stringify(err));
				done(err);
			});
		}

		return null;
	})
	.catch(function(err) {
		logger.error('socialAuthenticate Profile:\nData: ', profile, '\nError: ', JSON.stringify(err));
		done(err);
	});
});

exports.socialAuthorize = (function(request, profile, token, done) {
	var self = this,
		database = self.dependencies['database-service'],
		logger = self.dependencies['logger-service'];

	if(!User) {
		User = database.Model.extend({
			'tableName': 'users',
			'idAttribute': 'id',

			'social': function() {
				return this.hasMany(UserSocialLogins, 'login');
			}
		});
	}

	if(!UserSocialLogins) {
		UserSocialLogins = database.Model.extend({
			'tableName': 'user_social_logins',
			'idAttribute': 'id',

			'user': function() {
				return this.belongsTo(User, 'login');
			}
		});
	}

	// Special handling for Twitter...
	if(!profile.emails) {
		profile.emails = [];
		profile.emails.push({ 'value': profile.username + '@' + profile.provider + '.com' });

		var names = profile.displayName.split(' ');
		profile.name = {};
		profile.name.givenName = names[0] || '';
		profile.name.familyName = names[1] || '';
	}

	new UserSocialLogins({
		'provider': profile.provider,
		'provider_uid': profile.id
	})
	.fetch()
	.then(function(userSocialRecord) {
		if(userSocialRecord) {
			userSocialRecord.set('display_name', profile.displayName || profile.emails[0].value);
			userSocialRecord.set('login', request.user.id);
			userSocialRecord.set('social_data', profile._json);

			return userSocialRecord.save();
		}
		else {
			return new UserSocialLogins({
				'provider': profile.provider,
				'provider_uid': profile.id,
				'display_name': profile.displayName || profile.emails[0].value,
				'login': request.user.id,
				'social_data': profile._json
			}).save();
		}
	})
	.then(function(userSocialRecord) {
		request.user.social[profile.provider] = {
			'id': profile.id,
			'displayName': profile.displayName || profile.emails[0].value
		};

		done(null, request.user);
		return null;
	})
	.catch(function(err) {
		logger.error('socialAuthorize Profile:\nData: ', profile, '\nError: ', JSON.stringify(err));
		done(err);
	});
});

