/*
 * Name			: app/modules/services/service-base.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway Base Class for Services - providing common functionality required for all services
 *
 */

"use strict";

var base = require('./../../module-base').baseModule,
	prime = require('prime'),
	promises = require('bluebird');

/**
 * Module dependencies, required for this module
 */

var twyrServiceBase = prime({
	'inherits': base,

	'constructor': function(module, loader) {
		var SrvcLoader = require('./service-loader').loader;

		loader = loader || (promises.promisifyAll(new SrvcLoader(this), {
			'filter': function(name, func) {
				return true;
			}
		}));

		base.call(this, module, loader);
	},

	'getInterface': function () {
		return this;
	},

	'name': 'twyr-service-base',
	'basePath': __dirname,
	'dependencies': []
});

exports.baseService = twyrServiceBase;