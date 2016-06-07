
exports.seed = function(knex, Promise) {
	var apiGatewayId = null;

	return knex.raw('SELECT id FROM modules WHERE name = ? AND parent_id IS NULL', ['twyr-api-gateway'])
	.then(function(parentId) {
		if(!parentId.rows.length)
			return null;

		apiGatewayId = parentId.rows[0].id;
		return knex.raw('SELECT id FROM modules WHERE name = ? AND parent_id = ?', ['profiles', apiGatewayId]);
	})
	.then(function(profileComponentId) {
		if(profileComponentId.rows.length)
			return null;

		return knex("modules").insert({ 'parent_id': apiGatewayId, 'type': 'component', 'name': 'profiles', 'display_name': 'Profile Manager', 'description': 'The Twy\'r API Gateway User Profile Management Component' });
	});
};