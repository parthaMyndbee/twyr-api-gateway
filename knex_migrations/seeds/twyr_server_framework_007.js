
exports.seed = function(knex, Promise) {
	var webappId = null,
		componentId = null,
		menuPermId = null;

	return knex.raw('SELECT id FROM modules WHERE name = ? AND parent IS NULL', ['twyr-webapp'])
	.then(function(parentId) {
		if(!parentId.rows.length)
			return null;

		webappId = parentId.rows[0].id;
		return knex.raw('SELECT id FROM modules WHERE name = ? AND parent = ?', ['menus', webappId]);
	})
	.then(function(existingComponentId) {
		if(existingComponentId.rows.length)
			return null;

		return knex("modules").insert({ 'parent': webappId, 'type': 'component', 'name': 'menus', 'display_name': 'Menu Manager', 'description': 'The Twy\'r Web Application Menus Management Component', 'admin_only': true, 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } }).returning('id')
		.then(function(menusComponentId) {
			componentId = menusComponentId[0];
			return knex("module_permissions").insert({ 'module': componentId, 'name': 'menu-author', 'display_name': 'Menu Author Permission', 'description': 'Allows the User to create / edit / remove Menus in the Web Application' }).returning('id');
		})
		.then(function(permId) {
			menuPermId = permId[0];
			return knex("module_templates").insert({ 'module': componentId, 'permission': menuPermId, 'name': 'menus-default', 'description': 'The default Menu Management Template', 'is_default': true, 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } });
		})
		.then(function() {
			return knex("module_menus").insert({ 'parent': null, 'module': componentId, 'permission': menuPermId, 'ember_route': 'menus-default', 'icon_class': 'fa fa-bars', 'display_name': 'Menu Manager', 'description': 'The default Menus Manager that ships with the Web Application', 'tooltip': 'Default Menu Manager' });
		})
		.then(function() {
			return Promise.all([
				knex("modules").insert({ 'parent': componentId, 'type': 'component', 'name': 'horizontal', 'display_name': 'Horizontal Menu Designer', 'description': 'The Twy\'r Web Application Horizontal Menu Designer Component', 'admin_only': true, 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } }),
				knex("modules").insert({ 'parent': componentId, 'type': 'component', 'name': 'vertical', 'display_name': 'Vertical Menu Designer', 'description': 'The Twy\'r Web Application Vertical Menu Designer Component', 'admin_only': true, 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } })
			]);
		});
	});
};
