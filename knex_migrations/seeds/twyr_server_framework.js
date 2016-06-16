
exports.seed = function(knex, Promise) {
	var rootTenantId = null,
		rootUserId = null;

	return knex.raw('SELECT id FROM modules WHERE name = ? AND parent IS NULL', ['twyr-api-gateway'])
	.then(function(gatewayId) {
		if(gatewayId.rows.length)
			return null;

		return knex("modules").insert({ 'name': 'twyr-api-gateway', 'display_name': 'Twyr API Gateway', 'description': 'The Twy\'r API Gateway Module - the "Application Class" for the Server' }).returning('id')
		.then(function(parentId) {
			parentId = parentId[0];
			return Promise.all([
				parentId,
				knex("modules").insert({ 'parent': parentId, 'type': 'service', 'name': 'logger-service', 'display_name': 'Logger Service', 'description': 'The Twy\'r API Gateway Logger Service' }),
				knex("modules").insert({ 'parent': parentId, 'type': 'service', 'name': 'cache-service', 'display_name': 'Cache Service', 'description': 'The Twy\'r API Gateway Cache Service - based on Redis' }),
				knex("modules").insert({ 'parent': parentId, 'type': 'service', 'name': 'pubsub-service', 'display_name': 'Publish/Subscribe Service', 'description': 'The Twy\'r API Gateway Publish/Subscribe Service - based on Ascoltatori' }),
				knex("modules").insert({ 'parent': parentId, 'type': 'service', 'name': 'database-service', 'display_name': 'Database Service', 'description': 'The Twy\'r API Gateway Database Service - built on top of Knex / Booksshelf and so supports MySQL, PostgreSQL, and a few others' }),
				knex("modules").insert({ 'parent': parentId, 'type': 'service', 'name': 'api-service', 'display_name': 'API Service', 'description': 'The Twy\'r API Gateway API Service - allows modules to expose interfaces for use by other modules without direct references to each other' }),
				knex("modules").insert({ 'parent': parentId, 'type': 'service', 'name': 'auth-service', 'display_name': 'Authentication Service', 'description': 'The Twy\'r API Gateway Authentication Service - based on Passport and its infinite strategies' }),
				knex("modules").insert({ 'parent': parentId, 'type': 'service', 'name': 'express-service', 'display_name': 'Express Service', 'description': 'The Twy\'r API Gateway Webserver Service - based on Express and node.js HTTP/HTTPS modules' }),
				knex("modules").insert({ 'parent': parentId, 'type': 'service', 'name': 'websocket-service', 'display_name': 'Websocket Service', 'description': 'The Twy\'r API Gateway Websocket Service - based on Primus using WS Transformer' }),
				knex("modules").insert({ 'parent': parentId, 'type': 'service', 'name': 'configuration-service', 'display_name': 'Configuration Service', 'description': 'The Twy\'r API Gateway Configuration Service' }).returning('id')
				.then(function(configSrvcId) {
					configSrvcId = configSrvcId[0];
					return Promise.all([
						knex("modules").insert({ 'parent': configSrvcId, 'type': 'service', 'name': 'file-configuration-service', 'display_name': 'File Configuration Service', 'description': 'The Twy\'r API Gateway Filesystem-based Configuration Service' }),
						knex("modules").insert({ 'parent': configSrvcId, 'type': 'service', 'name': 'database-configuration-service', 'display_name': 'Database Configuration Service', 'description': 'The Twy\'r API Gateway Database-based Configuration Service' })
					]);
				})
			]);
		})
		.then(function(parentId) {
			parentId = parentId[0];

			return Promise.all([
				parentId,
				knex("module_permissions").insert({ 'module': parentId, 'name': 'public', 'display_name': 'Public User Permissions', 'description': 'The Twy\'r API Gateway Permissions for non-logged-in Users' }),
				knex("module_permissions").insert({ 'module': parentId, 'name': 'registered', 'display_name': 'Registered User Permissions', 'description': 'The Twy\'r API Gateway Permissions for logged-in Users' }),
				knex("module_permissions").insert({ 'module': parentId, 'name': 'administrator', 'display_name': 'Administrator Permissions', 'description': 'The Twy\'r API Gateway Permissions for Administrators' }),
				knex("module_permissions").insert({ 'module': parentId, 'name': 'super-administrator', 'display_name': 'Super Administrator Permissions', 'description': 'The Twy\'r API Gateway Permissions for Super Administrators' })
			]);
		});
	})
	.then(function() {
		return knex.raw('SELECT id FROM tenants WHERE parent IS NULL');
	})
	.then(function(tenantid) {
		if(tenantid.rows.length) {
			return [ tenantid.rows[0]['id'] ];
		}

		return knex("tenants").insert({ 'name': 'Twy\'r Root Tenant' }).returning('id');
	})
	.then(function(tenantId) {
		rootTenantId = tenantId[0];
		return knex.raw('SELECT id FROM users WHERE email = \'root@twyr.com\'');
	})
	.then(function(userId) {
		if(userId.rows.length) {
			return [ userId.rows[0]['id'] ];
		}

		return knex("users").insert({ 'email': 'root@twyr.com', 'password': '$2a$10$P7Vl27zD8grTPiocNj5U2eU5X7/9Vyy/tBVI3PO5KNR3tWkHhtM4S', 'first_name': 'Root', 'last_name': 'Twyr', 'nickname': 'root' }).returning('id');
	})
	.then(function(userId) {
		rootUserId = userId[0];
		return knex.raw('SELECT id FROM tenants_users WHERE tenant = \'' + rootTenantId + '\' AND login = \'' + rootUserId + '\';');
	})
	.then(function(rootTenantUserId) {
		if(rootTenantUserId.rows.length) {
			return null;
		}

		return knex("tenants_users").insert({ 'tenant': rootTenantId, 'login': rootUserId });
	})
	.then(function() {
		return knex.raw('INSERT INTO tenants_users_groups (tenant, login, tenant_group) SELECT \'' + rootTenantId + '\', \'' + rootUserId + '\', id FROM tenant_groups WHERE tenant = \'' + rootTenantId + '\' AND parent IS NULL ON CONFLICT DO NOTHING;');
	})
	.then(function() {
		var superAdminGroupId = null,
			adminGroupId = null,
			registeredGroupId = null,
			publicGroupId = null;

		return knex.raw('SELECT id FROM tenant_groups WHERE tenant = \'' + rootTenantId + '\' AND parent IS NULL;')
		.then(function(groupId) {
			superAdminGroupId = groupId.rows[0]['id'];

			return knex('tenant_groups').where('id', '=', superAdminGroupId).update({ 'name': 'super-administators', 'display_name': 'Super Administrators', 'description': 'The Super Administrator Group for the root tenant' });
		})
		.then(function() {
			return knex.raw('SELECT id FROM tenant_groups WHERE tenant = \'' + rootTenantId + '\' AND parent = \'' + superAdminGroupId + '\';');
		})
		.then(function(groupId) {
			if(groupId.rows.length) {
				return [ groupId.rows[0]['id'] ];
			}

			return knex('tenant_groups').insert({ 'tenant': rootTenantId, 'parent': superAdminGroupId, 'name': 'administrators', 'display_name': 'Twy\'r Root Administrators', 'description': 'The Administrator Group for the root tenant' }).returning('id');
		})
		.then(function(groupId) {
			adminGroupId = groupId[0];
			return knex.raw('SELECT id FROM tenant_groups WHERE tenant = \'' + rootTenantId + '\' AND parent = \'' + adminGroupId + '\';');
		})
		.then(function(groupId) {
			if(groupId.rows.length) {
				return [ groupId.rows[0]['id'] ];
			}

			return knex('tenant_groups').insert({ 'tenant': rootTenantId, 'parent': adminGroupId, 'name': 'registered-users', 'display_name': 'Twy\'r Registered Users', 'description': 'The Registered User Group for the root tenant', 'default_for_new_user': true }).returning('id');
		})
		.then(function(groupId) {
			registeredGroupId = groupId[0];
			return knex.raw('SELECT id FROM tenant_groups WHERE tenant = \'' + rootTenantId + '\' AND parent = \'' + registeredGroupId + '\';');
		})
		.then(function(groupId) {
			if(groupId.rows.length) {
				return [ groupId.rows[0]['id'] ];
			}

			return knex('tenant_groups').insert({ 'tenant': rootTenantId, 'parent': registeredGroupId, 'name': 'public', 'display_name': 'Twy\'r Public Users', 'description': 'The public, non-logged-in, Users' }).returning('id');
		})
		.then(function(groupId) {
			publicGroupId = groupId[0];
			return knex.raw('INSERT INTO tenant_group_permissions (tenant, tenant_group, module, permission) SELECT \'' + rootTenantId + '\', \'' + adminGroupId + '\', module, id FROM module_permissions WHERE name NOT IN (\'super-administrator\') ON CONFLICT DO NOTHING;');
		})
		.then(function() {
			return knex.raw('INSERT INTO tenant_group_permissions (tenant, tenant_group, module, permission) SELECT \'' + rootTenantId + '\', \'' + registeredGroupId + '\', module, id FROM module_permissions WHERE name NOT IN (\'super-administrator\', \'administrator\') ON CONFLICT DO NOTHING;');
		})
		.then(function() {
			return knex.raw('INSERT INTO tenant_group_permissions (tenant, tenant_group, module, permission) SELECT \'' + rootTenantId + '\', \'' + publicGroupId + '\', module, id FROM module_permissions WHERE name NOT IN (\'super-administrator\', \'administrator\', \'registered\') ON CONFLICT DO NOTHING;');
		});
	});
};
