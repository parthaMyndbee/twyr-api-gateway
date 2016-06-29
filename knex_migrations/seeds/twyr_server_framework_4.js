
exports.seed = function(knex, Promise) {
	var webappId = null,
		componentId = null,
		publicPermId = null,
		widgetId = null;

	return knex.raw('SELECT id FROM modules WHERE name = ? AND parent IS NULL', ['twyr-webapp'])
	.then(function(parentId) {
		if(!parentId.rows.length)
			return null;

		webappId = parentId.rows[0].id;
		return knex.raw('SELECT id FROM modules WHERE name = ? AND parent = ?', ['homepage', webappId]);
	})
	.then(function(existingComponentId) {
		if(existingComponentId.rows.length)
			return null;

		return knex("modules").insert({ 'parent': webappId, 'type': 'component', 'name': 'homepage', 'display_name': 'Homepage Manager', 'description': 'The Twy\'r Web Application Homepage Management Component', 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } }).returning('id')
		.then(function(sessionComponentId) {
			componentId = sessionComponentId[0];
			return knex("module_templates").insert({ 'module': componentId, 'name': 'homepage-home', 'description': 'The default Homepage Management Template', 'media_type': 'all', 'user_type': 'all', 'is_default': true, 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } }).returning('id');
		})
		.then(function() {
			return knex.raw('SELECT id FROM module_permissions WHERE module = ? AND name = ?', [webappId, 'public']);
		})
		.then(function(permId) {
			publicPermId = permId.rows[0].id;
			return knex("module_menus").insert({ 'parent': null, 'module': componentId, 'permission': publicPermId, 'ember_route': 'homepage-home', 'icon_class': 'fa fa-home', 'display_name': 'Default Home', 'description': 'The default Home Menu that ships with the Web Application', 'tooltip': 'Default Home', 'is_default_home': true });
		});
	});
};
