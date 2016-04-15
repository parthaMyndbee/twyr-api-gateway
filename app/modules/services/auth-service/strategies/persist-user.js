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
				return this.hasMany(UserSocialLogins, 'user_id');
			}
		});
	}

	if(!UserSocialLogins) {
		UserSocialLogins = database.Model.extend({
			'tableName': 'user_social_logins',
			'idAttribute': 'id',

			'user': function() {
				return this.belongsTo(User, 'user_id');
			}
		});
	}

	// Step 1: Is this user already in the database?
	UserSocialLogins.where({ 'provider': profile.provider, 'profile_id': profile.id }).fetch({'withRelated': ['user']})
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
					'password': bcrypt.hashSync('twyrportal')
				}).save();
			})
			.then(function(userRecord) {
				return new UserSocialLogins({
					'provider': profile.provider,
					'profile_id': profile.id,
					'profile_displayname': profile.displayName || profile.emails[0].value,
					'user_id': userRecord.get('id'),
					'profile_data': profile._json
				}).save();
			})
			.then(function(userSocialLoginRecord) {
				if(newSocialUser) {
					self.$module.emit('socialregistration', userSocialLoginRecord.get('user_id'), request.query.state);
				}

				done(null, { 'id': userSocialLoginRecord.get('user_id'), 'first_name': profile.name.givenName, 'last_name': profile.name.familyName });
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
				return this.hasMany(UserSocialLogins, 'user_id');
			}
		});
	}

	if(!UserSocialLogins) {
		UserSocialLogins = database.Model.extend({
			'tableName': 'user_social_logins',
			'idAttribute': 'id',

			'user': function() {
				return this.belongsTo(User, 'user_id');
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
		'profile_id': profile.id
	})
	.fetch()
	.then(function(userSocialRecord) {
		if(userSocialRecord) {
			userSocialRecord.set('profile_displayname', profile.displayName || profile.emails[0].value);
			userSocialRecord.set('user_id', request.user.id);
			userSocialRecord.set('profile_data', profile._json);

			return userSocialRecord.save();
		}
		else {
			return new UserSocialLogins({
				'provider': profile.provider,
				'profile_id': profile.id,
				'profile_displayname': profile.displayName || profile.emails[0].value,
				'user_id': request.user.id,
				'profile_data': profile._json
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

