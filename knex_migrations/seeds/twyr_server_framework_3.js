
exports.seed = function(knex, Promise) {
	var webappId = null,
		componentId = null,
		registeredPermId = null,
		widgetId = null;

	return knex.raw('SELECT id FROM modules WHERE name = ? AND parent IS NULL', ['twyr-webapp'])
	.then(function(parentId) {
		if(!parentId.rows.length)
			return null;

		webappId = parentId.rows[0].id;
		return knex.raw('SELECT id FROM modules WHERE name = ? AND parent = ?', ['profiles', webappId]);
	})
	.then(function(existingComponentId) {
		if(existingComponentId.rows.length)
			return null;

		return knex("modules").insert({ 'parent': webappId, 'type': 'component', 'name': 'profiles', 'display_name': 'Profile Manager', 'description': 'The Twy\'r Web Application User Profile Management Component', 'admin_only': true, 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } }).returning('id')
		.then(function(sessionComponentId) {
			componentId = sessionComponentId[0];
			return knex.raw('SELECT id FROM module_permissions WHERE module = ? AND name = ?', [webappId, 'registered']);
		})
		.then(function(permId) {
			registeredPermId = permId.rows[0].id;
			return knex("module_templates").insert({ 'module': componentId, 'permission': registeredPermId, 'name': 'profiles-default', 'description': 'The default Profile Management Template', 'media': 'all', 'is_default': true, 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } }).returning('id');
		})
		.then(function(templateId) {
			templateId = templateId[0];
			return knex("module_template_positions").insert({ 'template': templateId, 'name': 'module' });
		})
		.then(function() {
			return knex("module_widgets").insert({ 'module': componentId, 'permission': registeredPermId, 'ember_component': 'profile-widget', 'display_name': 'Profile', 'description': 'The Twy\'r Web Application Profile Management Widget', 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } }).returning('id');
		})
		.then(function(profileWidgetId) {
			widgetId = profileWidgetId[0];
			return knex.raw('SELECT id FROM module_template_positions WHERE template = (SELECT id FROM module_templates WHERE module = ? AND permission = ?) AND name = \'settings\'', [webappId, registeredPermId]);
		})
		.then(function(tmplPositionId) {
			tmplPositionId = tmplPositionId.rows[0].id;
			return knex("module_widget_module_template_positions").insert({ 'template_position': tmplPositionId, 'module_widget': widgetId, 'display_order': 9999 });
		})
		.then(function() {
			return knex("module_menus").insert({ 'parent': null, 'module': componentId, 'permission': registeredPermId, 'ember_route': 'profiles-default', 'icon_class': 'fa fa-user', 'display_name': 'Profile Manager', 'description': 'The Profile Management Menu', 'tooltip': 'Profile Manager' });
		});
	});
};
