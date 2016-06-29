/*
 * Name			: config/development/index-config.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway cluster-level configuration parameters
 *
 */

"use strict";

exports.config = ({
	'loadFactor': 0.25,
	'restart': false,

	'repl': {
		'prompt': ''
	},

	'main' : './app/server',
	'application': 'twyr-webapp',
	'title': 'twyr-api-gateway'
});
