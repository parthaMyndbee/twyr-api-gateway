/*
 * Name			: app/modules/services/auth-service/strategies/local.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Local Authentication Integration
 *
 */

"use strict";

/**
 * Module dependencies.
 */
var bcrypt = require('bcrypt-nodejs'),
	LocalStrategy = require('passport-local').Strategy;

exports.strategy = (function() {
	var self = this,
		auth = self.$passport,
		database = self.dependencies['database-service'],
		logger = self.dependencies['logger-service'];

	var User = database.Model.extend({
		'tableName': 'users',
		'idAttribute': 'id'
	});

	auth.use('twyr-local', new LocalStrategy({
		'passReqToCallback': true
	},
	function(request, username, password, done) {
		if(!self.$config.strategies.local.enabled) {
			done(new Error('Username / Password Authentication has been disabled'));
			return;
		}

		new User({ 'email': username })
		.fetch()
		.then(function(userRecord) {
			if(!userRecord) {
				throw({'message': 'Invalid Credentials - please try again'});
				return;
			}

			var credentialMatch = bcrypt.compareSync(password, userRecord.get('password'));
			if(credentialMatch) {
				return userRecord;
			}
			else {
				throw({'message': 'Invalid Credentials - please try again'});
				return null;
			}
		})
		.then(function(userRecord) {
			done(null, userRecord.toJSON());
			return null;
		})
		.catch(function(err) {
			logger.error('Error logging in user: ', JSON.stringify(err));
			done(err);
		});
	}));
});

