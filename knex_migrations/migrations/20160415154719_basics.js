
exports.up = function(knex, Promise) {
	return Promise.all([
		knex.schema.raw("SET check_function_bodies = true"),
		knex.schema.raw("CREATE TYPE public.module_type AS ENUM ('component','middleware','service')"),
		knex.schema.raw('CREATE EXTENSION "uuid-ossp" WITH SCHEMA public'),
		knex.schema.withSchema('public')
		.createTableIfNotExists('modules', function(modTbl) {
			modTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
			modTbl.uuid('parent_id').references('id').inTable('modules').onDelete('CASCADE').onUpdate('CASCADE');
			modTbl.specificType('type', 'public.module_type').notNullable().defaultTo('component');
			modTbl.text('name').notNullable();
			modTbl.text('display_name').notNullable();
			modTbl.text('description').notNullable().defaultTo('Another Twyr Module');
			modTbl.jsonb('configuration').notNullable().defaultTo('{}');
			modTbl.boolean('enabled').notNullable().defaultTo(true);
			modTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
			modTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
			modTbl.index(['parent_id', 'name'], 'uidx_modules_parent_name', 'btree');
		})
	]);
};

exports.down = function(knex, Promise) {
	return Promise.all([
		knex.schema.raw('DROP TABLE IF EXISTS public.modules CASCADE;'),
		knex.schema.raw('DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;'),
		knex.schema.raw('DROP TYPE IF EXISTS public.module_type CASCADE;'),
	]);
};
