
exports.seed = function(knex, Promise) {
	var webappId = null,
		componentId = null,
		authorPermId = null;

	return knex.raw('SELECT id FROM modules WHERE name = ? AND parent IS NULL', ['twyr-webapp'])
	.then(function(parentId) {
		if(!parentId.rows.length)
			return null;

		webappId = parentId.rows[0].id;
		return knex.raw('SELECT id FROM modules WHERE name = ? AND parent = ?', ['pages', webappId]);
	})
	.then(function(existingComponentId) {
		if(existingComponentId.rows.length)
			return null;

		return knex("modules").insert({ 'parent': webappId, 'type': 'component', 'name': 'pages', 'display_name': 'Pages Manager', 'description': 'The Twy\'r Web Application Pages Management Component', 'admin_only': true, 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } }).returning('id')
		.then(function(pagesComponentId) {
			componentId = pagesComponentId[0];
			return Promise.all([
				knex("module_templates").insert({ 'module': componentId, 'name': 'pages-default', 'description': 'The default Page Management Template', 'media_type': 'all', 'user_type': 'all', 'is_default': true, 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } }),
				knex("module_templates").insert({ 'module': componentId, 'name': 'page-view', 'description': 'The default Page View Template', 'media_type': 'all', 'user_type': 'all', 'is_default': true, 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } })
			]);
		})
		.then(function() {
			return knex("module_permissions").insert({ 'module': componentId, 'name': 'page-author', 'display_name': 'Page Author Permission', 'description': 'Allows the User to create / edit / remove Pages in the Web Application' }).returning('id');
		})
		.then(function(permId) {
			authorPermId = permId[0];
			return knex("module_menus").insert({ 'parent': null, 'module': componentId, 'permission': authorPermId, 'ember_route': 'pages-default', 'icon_class': 'fa fa-html5', 'display_name': 'Page Manager', 'description': 'The default Pages Manager that ships with the Web Application', 'tooltip': 'Default Page', 'is_default_home': false });
		});
	});
};
