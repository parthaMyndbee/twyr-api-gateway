
exports.seed = function(knex, Promise) {
	var apiGatewayId = null;

	return knex.raw('SELECT id FROM modules WHERE name = ? AND parent IS NULL', ['twyr-api-gateway'])
	.then(function(parentId) {
		if(!parentId.rows.length)
			return null;

		apiGatewayId = parentId.rows[0].id;
		return knex.raw('SELECT id FROM modules WHERE name = ? AND parent = ?', ['pages', apiGatewayId]);
	})
	.then(function(pagesComponentId) {
		if(pagesComponentId.rows.length)
			return null;

		return knex("modules").insert({ 'parent': apiGatewayId, 'type': 'component', 'name': 'pages', 'display_name': 'Pages Manager', 'description': 'The Twy\'r API Gateway Pages Management Component', 'admin_only': true }).returning('id')
		.then(function(pagesComponentId) {
			pagesComponentId = pagesComponentId[0];
			return knex("module_permissions").insert({ 'module': pagesComponentId, 'name': 'page-author', 'display_name': 'Page Author Permission', 'description': 'Allows the User to create / edit / remove Pages in the Portal' });
		});
	});
};
