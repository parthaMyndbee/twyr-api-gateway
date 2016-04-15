/*
 * Name			: app/modules/services/auth-service/strategies/github.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Github Authentication Integration
 *
 */

"use strict";

/**
 * Module dependencies.
 */
var GithubStrategy = require('passport-github').Strategy,
	persistUser = require('./persist-user');

exports.strategy = (function() {
	var self = this,
		socialAuthenticate = persistUser.socialAuthenticate.bind(self),
		socialAuthorize = persistUser.socialAuthorize.bind(self);

	self.$passport.use('twyr-github', new GithubStrategy({
		'clientID': self.$config.strategies.github.applicationID,
		'clientSecret': self.$config.strategies.github.applicationSecret,
		'callbackURL': self.$config.strategies.github.callbackUrl,
		'passReqToCallback': true
	},
	function(request, accessToken, refreshToken, profile, done) {
		if(!self.$config.strategies.github.enabled) {
			done(new Error('Github Authentication has been disabled'));
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
