/*
 * Name			: app/modules/services/auth-service/strategies/serialize-user.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway User Session Serialization / Deserialization
 *
 */

"use strict";

/**
 * Module dependencies.
 */

exports.strategy = (function() {
	var self = this,
		auth = self.$passport,
		logger = self.dependencies['logger-service'];

	auth.serializeUser(function(user, done) {
		self.$utilities.userSessionCacheAsync(user.id)
		.then(function(deserializedUser) {
			done(null, deserializedUser.id);
			return null;
		}).
		catch(function(err) {
			logger.error('Error serializing user: ', user, '\nError: ', err);
			done(err);
		});
	});

	auth.deserializeUser(function(id, done) {
		self.$utilities.userSessionCacheAsync(id)
		.then(function(deserializedUser) {
			done(null, deserializedUser);
			return null;
		})
		.catch(function(err) {
			logger.error('Error deserializing user:\nId: ', id, '\nError: ', err);
			done(err);
		});
	});
});
