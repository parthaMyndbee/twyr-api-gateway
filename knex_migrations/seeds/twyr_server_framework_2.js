
exports.seed = function(knex, Promise) {
	var apiGatewayId = null;

	return knex.raw('SELECT id FROM modules WHERE name = ? AND parent_id IS NULL', ['twyr-api-gateway'])
	.then(function(parentId) {
		if(!parentId.rows.length)
			return null;

		apiGatewayId = parentId.rows[0].id;
		return knex.raw('SELECT id FROM modules WHERE name = ? AND parent_id = ?', ['session', apiGatewayId]);
	})
	.then(function(sessionComponentId) {
		if(sessionComponentId.rows.length)
			return null;

		return knex("modules").insert({ 'parent_id': apiGatewayId, 'type': 'component', 'name': 'session', 'display_name': 'Session', 'description': 'The Twy\'r API Gateway Session Management Component' });
	});
};