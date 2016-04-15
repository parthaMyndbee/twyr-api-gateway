/*
 * Name			: config/production/twyr-api-gateway.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r API Gateway application-level configuration parameters
 *
 */

"use strict";

exports.config = ({
	'utilities': {
		'path': './modules/utilities'
	},

	'services': {
		'path': './modules/services'
	},

	'components': {
		'path': './modules/components'
	}
});
