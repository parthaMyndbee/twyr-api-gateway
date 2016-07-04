
exports.seed = function(knex, Promise) {
	var webappId = null,
		componentId = null,
		managerPermId = null;

	return knex.raw('SELECT id FROM modules WHERE name = ? AND parent IS NULL', ['twyr-webapp'])
	.then(function(parentId) {
		if(!parentId.rows.length)
			return null;

		webappId = parentId.rows[0].id;
		return knex.raw('SELECT id FROM modules WHERE name = ? AND parent = ?', ['modules', webappId]);
	})
	.then(function(existingComponentId) {
		if(existingComponentId.rows.length)
			return null;

		return knex("modules").insert({ 'parent': webappId, 'type': 'component', 'name': 'modules', 'display_name': 'Module Manager', 'description': 'The Twy\'r Web Application Modules Management Component', 'admin_only': true, 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } }).returning('id')
		.then(function(pagesComponentId) {
			componentId = pagesComponentId[0];
			return Promise.all([
				knex("module_templates").insert({ 'module': componentId, 'name': 'modules-default', 'description': 'The default Module Management Template', 'media': 'all', 'role': 'registered', 'is_default': true, 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } }),
			]);
		})
		.then(function() {
			return knex("module_permissions").insert({ 'module': componentId, 'name': 'module-manager', 'display_name': 'Module Manager Permission', 'description': 'Allows the User to edit Module Configurations & Templates in the Web Application' }).returning('id');
		})
		.then(function(permId) {
			managerPermId = permId[0];
			return knex("module_menus").insert({ 'parent': null, 'module': componentId, 'permission': managerPermId, 'ember_route': 'modules-default', 'icon_class': 'fa fa-cog', 'display_name': 'Module Manager', 'description': 'The default Module Manager that ships with the Web Application', 'tooltip': 'Default Module Manager', 'is_default_home': false });
		});
	});
};
