/*
 * Name			: app/modules/services/auth-service/strategies/google.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Google Authentication Integration
 *
 */

"use strict";

/**
 * Module dependencies.
 */
var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy,
	persistUser = require('./persist-user');

exports.strategy = (function() {
	var self = this,
		socialAuthenticate = persistUser.socialAuthenticate.bind(self),
		socialAuthorize = persistUser.socialAuthorize.bind(self);

	self.$passport.use('twyr-google', new GoogleStrategy({
		'clientID': self.$config.strategies.google.applicationID,
		'clientSecret': self.$config.strategies.google.applicationSecret,
		'callbackURL': self.$config.strategies.google.callbackUrl,
		'scope': ['https://www.googleapis.com/auth/plus.me', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
		'passReqToCallback': true
	},
	function(request, accessToken, refreshToken, profile, done) {
		if(!self.$config.strategies.google.enabled) {
			done(new Error('Google Authentication has been disabled'));
			return;
		}

		if(!request.user) {
			socialAuthenticate(request, profile, refreshToken, done);
		}
		else {
			socialAuthorize(request, profile, refreshToken, done);
		}
	}));
});
