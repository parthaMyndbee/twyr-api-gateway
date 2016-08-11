
exports.seed = function(knex, Promise) {
	var webappId = null,
		componentId = null,
		mediaPermId = null;

	return knex.raw('SELECT id FROM modules WHERE name = ? AND parent IS NULL', ['twyr-webapp'])
	.then(function(parentId) {
		if(!parentId.rows.length)
			return null;

		webappId = parentId.rows[0].id;
		return knex.raw('SELECT id FROM modules WHERE name = ? AND parent = ?', ['media', webappId]);
	})
	.then(function(existingComponentId) {
		if(existingComponentId.rows.length)
			return null;

		return knex("modules").insert({ 'parent': webappId, 'type': 'component', 'name': 'media', 'display_name': 'Media Manager', 'description': 'The Twy\'r Web Application Media Management Component', 'admin_only': true, 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } }).returning('id')
		.then(function(menusComponentId) {
			componentId = menusComponentId[0];
			return knex("module_permissions").insert({ 'module': componentId, 'name': 'media-manager', 'display_name': 'Media Manager Permission', 'description': 'Allows the User to create / edit / remove Media in the Web Application' }).returning('id');
		})
		.then(function(permId) {
			mediaPermId = permId[0];
			return knex("module_templates").insert({ 'module': componentId, 'permission': mediaPermId, 'name': 'media-default', 'description': 'The default Media Management Template', 'media': 'all', 'is_default': true, 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } });
		})
		.then(function() {
			return knex("module_menus").insert({ 'parent': null, 'module': componentId, 'permission': mediaPermId, 'ember_route': 'media-default', 'icon_class': 'fa fa-video-camera', 'display_name': 'Media Manager', 'description': 'The default Media Manager that ships with the Web Application', 'tooltip': 'Default Media Manager' });
		});
	});
};
