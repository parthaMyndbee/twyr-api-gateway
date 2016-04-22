
exports.up = function(knex, Promise) {
	return Promise.all([
		knex.schema.withSchema('public')
		.createTableIfNotExists('permissions', function(permTbl) {
			permTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
			permTbl.uuid('module_id').references('id').inTable('modules').onDelete('CASCADE').onUpdate('CASCADE');
			permTbl.text('name').notNullable();
			permTbl.text('display_name').notNullable();
			permTbl.text('description').notNullable().defaultTo('Another Random Permission');
			permTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
			permTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
			permTbl.index(['module_id', 'name'], 'uidx_permissions', 'btree');
		})
	]);
};

exports.down = function(knex, Promise) {
	return Promise.all([
		knex.schema.raw('DROP TABLE IF EXISTS public.permissions CASCADE;'),
	]);
};
