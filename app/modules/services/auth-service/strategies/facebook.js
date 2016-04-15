/*
 * Name			: app/modules/services/auth-service/strategies/facebook.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Facebook Authentication Integration
 *
 */

"use strict";

/**
 * Module dependencies.
 */
var FacebookStrategy = require('passport-facebook').Strategy,
	persistUser = require('./persist-user');

exports.strategy = (function() {
	var self = this,
		socialAuthenticate = persistUser.socialAuthenticate.bind(self),
		socialAuthorize = persistUser.socialAuthorize.bind(self);

	self.$passport.use('twyr-facebook', new FacebookStrategy({
		'clientID': self.$config.strategies.facebook.applicationID,
		'clientSecret': self.$config.strategies.facebook.applicationSecret,
		'callbackURL': self.$config.strategies.facebook.callbackUrl,
		'passReqToCallback': true
	},
	function(request, token, refreshToken, profile, done) {
		if(!self.$config.strategies.facebook.enabled) {
			done(new Error('Facebook Authentication has been disabled'));
			return;
		}

		if(!request.user) {
			socialAuthenticate(request, profile, token, done);
		}
		else {
			socialAuthorize(request, profile, token, done);
		}
	}));
});
