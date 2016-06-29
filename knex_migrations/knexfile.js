/*
 * Name			: config/development/knexfile.js
 * Author		: Vish Desai (vishwakarma_d@hotmail.com)
 * Version		: 0.7.1
 * Copyright	: Copyright (c) 2014 - 2016 Vish Desai (https://www.linkedin.com/in/vishdesai).
 * License		: The MITNFA License (https://spdx.org/licenses/MITNFA.html).
 * Description	: The Twy'r Web Application database migration configuration
 *
 */

module.exports = {
	'development': {
		'client': 'pg',

		'connection': {
			'database': 'twyr',
			'user': 'postgres',
			'password': 'postgres'
		},

		'migrations': {
			'tableName': 'knex_migrations'
		}
	}
};
