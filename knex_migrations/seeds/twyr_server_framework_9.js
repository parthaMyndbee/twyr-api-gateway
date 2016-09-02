
exports.seed = function(knex, Promise) {
	var webappId = null,
		componentId = null,
		tenantPermId = null;

	return knex.raw('SELECT id FROM modules WHERE name = ? AND parent IS NULL', ['twyr-webapp'])
	.then(function(parentId) {
		if(!parentId.rows.length)
			return null;

		webappId = parentId.rows[0].id;
		return knex.raw('SELECT id FROM modules WHERE name = ? AND parent = ?', ['tenants', webappId]);
	})
	.then(function(existingComponentId) {
		if(existingComponentId.rows.length)
			return null;

		return knex("modules").insert({ 'parent': webappId, 'type': 'component', 'name': 'tenants', 'display_name': 'Tenant Administration', 'description': 'The Twy\'r Web Application Tenant Management Component', 'admin_only': false, 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } }).returning('id')
		.then(function(tenantsComponentId) {
			componentId = tenantsComponentId[0];
			return knex("module_permissions").insert({ 'module': componentId, 'name': 'tenant-administrator', 'display_name': 'Tenant Administration Permission', 'description': 'Allows the User to create / edit / remove Organizations in the Web Application' }).returning('id');
		})
		.then(function(permId) {
			tenantPermId = permId[0];
			return knex("module_templates").insert({ 'module': componentId, 'permission': tenantPermId, 'name': 'tenant-administrator-default', 'description': 'The default Tenant Administration Template', 'is_default': true, 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } });
		})
		.then(function() {
			return knex("module_menus").insert({ 'parent': null, 'module': componentId, 'permission': tenantPermId, 'ember_route': 'tenant-administrator', 'icon_class': 'fa fa-tree', 'display_name': 'Tenant Administration', 'description': 'The default Tenant Administration that ships with the Web Application', 'tooltip': 'Tenant Administration' });
		});
	});
};
