
exports.seed = function(knex, Promise) {
	var webappId = null,
		componentId = null,
		loginWidgetId = null,
		logoutWidgetId = null;

	var publicPermissionId = null,
		registeredPermissionId = null;

	return knex.raw('SELECT id FROM modules WHERE name = ? AND parent IS NULL', ['twyr-webapp'])
	.then(function(parentId) {
		if(!parentId.rows.length)
			return null;

		webappId = parentId.rows[0].id;
		return knex.raw('SELECT id FROM modules WHERE name = ? AND parent = ?', ['session', webappId]);
	})
	.then(function(existingComponentId) {
		if(existingComponentId.rows.length)
			return null;

		return knex("modules").insert({ 'parent': webappId, 'type': 'component', 'name': 'session', 'display_name': 'Session', 'description': 'The Twy\'r Web Application Session Management Component', 'admin_only': true, 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } }).returning('id')
		.then(function(sessionComponentId) {
			componentId = sessionComponentId[0];
			return knex.raw('SELECT id FROM module_permissions WHERE module = ? AND name = ?', [webappId, 'public']);
		})
		.then(function(publicPermId) {
			publicPermissionId = publicPermId.rows[0].id;
			return knex("module_widgets").insert({ 'module': componentId, 'permission': publicPermissionId, 'ember_component': 'login-widget', 'display_name': 'Twy\'r Login', 'description': 'The Twy\'r Web Application Login Widget', 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } }).returning('id');
		})
		.then(function(loginComponentId) {
			loginWidgetId = loginComponentId[0];
			return knex.raw('SELECT id FROM module_template_positions WHERE template = (SELECT id FROM module_templates WHERE module = ? AND permission = ?) AND name = \'right-sidebar\'', [webappId, publicPermissionId]);
		})
		.then(function(tmplPositionId) {
			tmplPositionId = tmplPositionId.rows[0].id;
			return knex("module_widget_module_template_positions").insert({ 'template_position': tmplPositionId, 'module_widget': loginWidgetId, 'display_order': 0 });
		})
		.then(function() {
			return knex.raw('SELECT id FROM module_permissions WHERE module = ? AND name = ?', [webappId, 'registered']);
		})
		.then(function(registeredPermId) {
			registeredPermissionId = registeredPermId.rows[0].id;
			return knex("module_widgets").insert({ 'module': componentId, 'permission': registeredPermissionId, 'ember_component': 'logout-widget', 'display_name': 'Twy\'r Logout', 'description': 'The Twy\'r Web Application Logout Widget', 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } }).returning('id');
		})
		.then(function(logoutComponentId) {
			logoutWidgetId = logoutComponentId[0];
			return knex.raw('SELECT id FROM module_template_positions WHERE template = (SELECT id FROM module_templates WHERE module = ? AND permission = ?) AND name = \'settings\'', [webappId, registeredPermissionId]);
		})
		.then(function(tmplPositionId) {
			tmplPositionId = tmplPositionId.rows[0].id;
			return knex("module_widget_module_template_positions").insert({ 'template_position': tmplPositionId, 'module_widget': logoutWidgetId, 'display_order': 10000 });
		});
	});
};
