/*
 * Name			: app/modules/services/auth-service/strategies/twitter.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Twitter Authentication Integration
 *
 */

"use strict";

/**
 * Module dependencies.
 */
var TwitterStrategy = require('passport-twitter').Strategy,
	persistUser = require('./persist-user');

exports.strategy = (function() {
	var self = this,
		socialAuthenticate = persistUser.socialAuthenticate.bind(self),
		socialAuthorize = persistUser.socialAuthorize.bind(self);

	self.$passport.use('twyr-twitter', new TwitterStrategy({
		'consumerKey': self.$config.strategies.twitter.applicationID,
		'consumerSecret': self.$config.strategies.twitter.applicationSecret,
		'callbackURL': self.$config.strategies.twitter.callbackUrl,
		'passReqToCallback': true
	},
	function(request, token, tokenSecret, profile, done) {
		if(!self.$config.strategies.twitter.enabled) {
			done(new Error('Twitter Authentication has been disabled'));
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
