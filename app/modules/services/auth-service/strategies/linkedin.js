/*
 * Name			: app/modules/services/auth-service/strategies/linkedin.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway LinkedIn Authentication Integration
 *
 */

"use strict";

/**
 * Module dependencies.
 */
var LinkedinStrategy = require('passport-linkedin-oauth2').Strategy,
	persistUser = require('./persist-user');

exports.strategy = (function() {
	var self = this,
		socialAuthenticate = persistUser.socialAuthenticate.bind(self),
		socialAuthorize = persistUser.socialAuthorize.bind(self);

	self.$passport.use('twyr-linkedin', new LinkedinStrategy({
		'clientID': self.$config.strategies.linkedin.applicationID,
		'clientSecret': self.$config.strategies.linkedin.applicationSecret,
		'callbackURL': self.$config.strategies.linkedin.callbackUrl,
		'scope': ['r_basicprofile', 'r_emailaddress'],
		'state': true,
		'passReqToCallback': true
	},
	function(request, accessToken, refreshToken, profile, done) {
		if(!self.$config.strategies.linkedin.enabled) {
			done(new Error('LinkedIn Authentication has been disabled'));
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
