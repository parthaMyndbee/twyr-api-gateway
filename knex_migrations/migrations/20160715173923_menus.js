
exports.up = function(knex, Promise) {
	return knex.schema.raw("CREATE TYPE public.menu_type AS ENUM ('horizontal','vertical')")
	.then(function() {
		return knex.schema.withSchema('public')
		.createTableIfNotExists('menus', function(menusTbl) {
			menusTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
			menusTbl.text('name').notNullable();
			menusTbl.specificType('type', 'public.menu_type').notNullable().defaultTo('horizontal');
			menusTbl.specificType('status', 'public.publish_status').notNullable().defaultTo('draft');
			menusTbl.uuid('module_widget').notNullable().references('id').inTable('module_widgets').onDelete('CASCADE').onUpdate('CASCADE');
			menusTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
			menusTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
		});
	})
};

exports.down = function(knex, Promise) {
	return knex.schema.raw("DROP TABLE IF EXISTS menus");
};
