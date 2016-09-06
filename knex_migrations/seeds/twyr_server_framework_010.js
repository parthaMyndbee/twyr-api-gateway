
exports.seed = function(knex, Promise) {
	var webappId = null,
		parentComponentId = null;

	return knex.raw('SELECT id FROM modules WHERE name = ? AND parent IS NULL', ['twyr-webapp'])
	.then(function(parentId) {
		if(!parentId.rows.length)
			return null;

		webappId = parentId.rows[0].id;
		return knex.raw('SELECT id FROM modules WHERE name = ? AND parent = ?', ['tenants', webappId]);
	})
	.then(function(existingComponentId) {
		if(!existingComponentId.rows.length)
			return null;

		parentComponentId = existingComponentId.rows[0].id;
		return knex.raw('SELECT id FROM modules WHERE name = ? AND parent = ?', ['subtenant-editor-widget', parentComponentId]);
	})
	.then(function(existingComponentId) {
		if(existingComponentId.rows.length)
			return null;

		return knex("modules").insert({ 'parent': parentComponentId, 'type': 'component', 'name': 'subtenant-editor-widget', 'display_name': 'Suborganizations', 'description': 'The Twy\'r Web Application Sub-Tenant Management Component', 'admin_only': false, 'metadata': { 'author': 'Twy\'r', 'version': '0.7.1', 'website': 'https://twyr.github.io', 'demo': 'https://twyr.github.io', 'documentation': 'https://twyr.github.io' } });
	});
};
