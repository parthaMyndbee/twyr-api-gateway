
exports.up = function(knex, Promise) {
	return knex.schema.withSchema('public')
	.createTableIfNotExists('pages', function(pagesTbl) {
		pagesTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
		pagesTbl.uuid('author').notNullable().references('id').inTable('users').onDelete('CASCADE').onUpdate('CASCADE');
		pagesTbl.text('title').notNullable();
		pagesTbl.text('content');
		pagesTbl.specificType('status', 'public.publish_status').notNullable().defaultTo('draft');
		pagesTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
		pagesTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
	});
};

exports.down = function(knex, Promise) {
	return knex.schema.raw("DROP TABLE IF EXISTS pages");
};
