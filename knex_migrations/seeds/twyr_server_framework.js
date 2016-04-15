
exports.seed = function(knex, Promise) {
	return knex.raw('SELECT id FROM modules WHERE name = ? AND parent_id IS NULL', ['twyr-api-gateway'])
	.then(function(portalId) {
		if(portalId.rows.length)
			return null;

		return Promise.all([
			knex("modules").insert({ 'name': 'twyr-api-gateway', 'display_name': 'Twyr API Gateway', 'description': 'The Twy\'r API Gateway Module - the "Application Class" for the Server' }).returning('id')
			.then(function(parentId) {
				parentId = parentId[0];
				return Promise.all([
					knex("modules").insert({ 'parent_id': parentId, 'type': 'service', 'name': 'logger-service', 'display_name': 'Logger Service', 'description': 'The Twy\'r API Gateway Logger Service' }),
					knex("modules").insert({ 'parent_id': parentId, 'type': 'service', 'name': 'cache-service', 'display_name': 'Cache Service', 'description': 'The Twy\'r API Gateway Cache Service - based on Redis' }),
					knex("modules").insert({ 'parent_id': parentId, 'type': 'service', 'name': 'pubsub-service', 'display_name': 'Publish/Subscribe Service', 'description': 'The Twy\'r API Gateway Publish/Subscribe Service - based on Ascoltatori' }),
					knex("modules").insert({ 'parent_id': parentId, 'type': 'service', 'name': 'database-service', 'display_name': 'Database Service', 'description': 'The Twy\'r API Gateway Database Service - built on top of Knex / Booksshelf and so supports MySQL, PostgreSQL, and a few others' }),
					knex("modules").insert({ 'parent_id': parentId, 'type': 'service', 'name': 'api-service', 'display_name': 'API Service', 'description': 'The Twy\'r API Gateway API Service - allows modules to expose interfaces for use by other modules without direct references to each other' }),
					knex("modules").insert({ 'parent_id': parentId, 'type': 'service', 'name': 'auth-service', 'display_name': 'Authentication Service', 'description': 'The Twy\'r API Gateway Authentication Service - based on Passport and its infinite strategies' }),
					knex("modules").insert({ 'parent_id': parentId, 'type': 'service', 'name': 'configuration-service', 'display_name': 'Configuration Service', 'description': 'The Twy\'r API Gateway Configuration Service' }).returning('id')
					.then(function(configSrvcId) {
						configSrvcId = configSrvcId[0];
						return Promise.all([
							knex("modules").insert({ 'parent_id': configSrvcId, 'type': 'service', 'name': 'file-configuration-service', 'display_name': 'File Configuration Service', 'description': 'The Twy\'r API Gateway Filesystem-based Configuration Service' }),
							knex("modules").insert({ 'parent_id': configSrvcId, 'type': 'service', 'name': 'database-configuration-service', 'display_name': 'Database Configuration Service', 'description': 'The Twy\'r API Gateway Database-based Configuration Service' })
						]);
					}),
				]);
			})
		]);
	});
};
