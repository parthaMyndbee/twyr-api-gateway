/*
 * Name			: app/modules/services/mailer-service/service.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Mailer Service - allows components to send emails
 *
 */

"use strict";

/**
 * Module dependencies, required for ALL Twy'r modules
 */
var base = require('./../service-base').baseService,
	prime = require('prime'),
	promises = require('bluebird');

/**
 * Module dependencies, required for this module
 */
var path = require('path'),
	mailer = promises.promisifyAll(require('nodemailer')),
	transport = require('nodemailer-smtp-transport');

var mailerService = prime({
	'inherits': base,

	'constructor': function(module) {
		base.call(this, module);
	},

	'start': function(dependencies, callback) {
		var self = this,
			thisConfig = JSON.parse(JSON.stringify(self.$config));

		mailerService.parent.start.call(self, dependencies, function(err, status) {
			if(err) {
				callback(err);
				return;
			}

			self['$smtpMailer'] = mailer.createTransport(transport(thisConfig));
			callback(null, status);
		});
	},

	'getInterface': function() {
		return promises.promisifyAll(this['$smtpMailer']);
	},

	'stop': function(callback) {
		var self = this;
		mailerService.parent.stop.call(self, function(err, status) {
			if(err) {
				callback(err);
				return;
			}

			self['$smtpMailer'].close();
			delete self['$smtpMailer'];
			callback(null, status);
		});
	},

	'_reconfigure': function(config) {
		var self = this;
		if(!self['$enabled']) {
			self['$config'] = JSON.parse(JSON.stringify(config));
			return;
		}

		self['$smtpMailer'].close();
		delete self['$smtpMailer'];

		self['$config'] = JSON.parse(JSON.stringify(config));
		self['$smtpMailer'] = mailer.createTransport(transport(self.$config));
		mailerService.parent._reconfigure.call(self, config);
	},

	'name': 'mailer-service',
	'basePath': __dirname,
	'dependencies': ['logger-service']
});

exports.service = mailerService;
