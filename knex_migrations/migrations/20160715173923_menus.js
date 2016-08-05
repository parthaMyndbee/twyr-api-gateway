
exports.up = function(knex, Promise) {
	return knex.schema.raw("CREATE TYPE public.menu_type AS ENUM ('footer','horizontal','vertical')")
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
	.then(function() {
		return knex.schema.withSchema('public')
		.createTableIfNotExists('menu_items', function(menuItemsTbl) {
			menuItemsTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
			menuItemsTbl.uuid('menu').notNullable().references('id').inTable('menus').onDelete('CASCADE').onUpdate('CASCADE');
			menuItemsTbl.uuid('parent').references('id').inTable('menu_items').onDelete('CASCADE').onUpdate('CASCADE');
			menuItemsTbl.uuid('module_menu').references('id').inTable('module_menus').onDelete('CASCADE').onUpdate('CASCADE');
			menuItemsTbl.text('icon_class');
			menuItemsTbl.text('display_name');
			menuItemsTbl.integer('display_order');
			menuItemsTbl.text('description');
			menuItemsTbl.text('tooltip');
			menuItemsTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
			menuItemsTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
		});
	})
	.then(function() {
		return Promise.all([
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_get_menu_item_ancestors (IN menuitemid uuid) ' +
					'RETURNS TABLE (level integer,  id uuid,  parent uuid, module_menu uuid, icon_class text,  display_name text,  tooltip text) ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +
				'BEGIN ' +
					'RETURN QUERY ' +
					'WITH RECURSIVE q AS ( ' +
						'SELECT ' +
							'1 AS level, ' +
							'A.id, ' +
							'A.parent, ' +
							'A.module_menu, ' +
							'A.icon_class, ' +
							'A.display_name, ' +
							'A.tooltip ' +
						'FROM ' +
							'menu_items A ' +
						'WHERE ' +
							'A.id = menuitemid ' +
						'UNION ALL ' +
						'SELECT ' +
							'q.level + 1, ' +
							'B.id, ' +
							'B.parent, ' +
							'B.module_menu, ' +
							'B.icon_class, ' +
							'B.display_name, ' +
							'B.tooltip ' +
						'FROM ' +
							'q, ' +
							'menu_items B ' +
						'WHERE ' +
							'B.id = q.parent ' +
					') ' +
					'SELECT DISTINCT ' +
						'q.level, ' +
						'q.id, ' +
						'q.parent, ' +
						'q.module_menu, ' +
						'q.icon_class, ' +
						'q.display_name, ' +
						'q.tooltip ' +
					'FROM ' +
						'q ' +
					'ORDER BY ' +
						'q.level, ' +
						'q.parent; ' +
				'END; ' +
				'$$;'
			),
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_get_menu_item_descendants (IN menuitemid uuid) ' +
					'RETURNS TABLE (level integer,  id uuid,  parent uuid, module_menu uuid, icon_class text, display_name text, tooltip text) ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +
				'BEGIN ' +
					'RETURN QUERY ' +
					'WITH RECURSIVE q AS ( ' +
						'SELECT ' +
							'1 AS level, ' +
							'A.id, ' +
							'A.parent, ' +
							'A.module_menu, ' +
							'A.icon_class, ' +
							'A.display_name, ' +
							'A.tooltip ' +
						'FROM ' +
							'menu_items A ' +
						'WHERE ' +
							'A.id = menuitemid ' +
						'UNION ALL ' +
						'SELECT ' +
							'q.level + 1, ' +
							'B.id, ' +
							'B.parent, ' +
							'B.module_menu, ' +
							'B.icon_class, ' +
							'B.display_name, ' +
							'B.tooltip ' +
						'FROM ' +
							'q, ' +
							'menu_items B ' +
						'WHERE ' +
							'B.parent = q.id ' +
					') ' +
					'SELECT DISTINCT ' +
						'q.level, ' +
						'q.id, ' +
						'q.parent, ' +
						'q.module_menu, ' +
						'q.icon_class, ' +
						'q.display_name, ' +
						'q.tooltip ' +
					'FROM ' +
						'q ' +
					'ORDER BY ' +
						'q.level, ' +
						'q.parent; ' +
				'END; ' +
				'$$;'
			),
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_check_menu_item_upsert_is_valid () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +

				'DECLARE ' +
					'is_menu_item_in_tree	INTEGER; ' +
				'BEGIN ' +
					'IF NEW.parent IS NULL ' +
					'THEN ' +
						'RETURN NEW; ' +
					'END IF; ' +

					'IF NEW.id = NEW.parent ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Menu Item cannot be its own parent\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'is_menu_item_in_tree := 0; ' +
					'SELECT ' +
						'COUNT(id) ' +
					'FROM ' +
						'fn_get_menu_item_ancestors(NEW.parent) ' +
					'WHERE ' +
						'id = NEW.id ' +
					'INTO ' +
						'is_menu_item_in_tree; ' +

					'IF is_menu_item_in_tree > 0 ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Menu Item cannot be its own ancestor\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'is_menu_item_in_tree := 0; ' +
					'SELECT ' +
						'COUNT(id) ' +
					'FROM ' +
						'fn_get_menu_item_descendants(NEW.id) ' +
					'WHERE ' +
						'id = NEW.id AND ' +
						'level > 1 ' +
					'INTO ' +
						'is_menu_item_in_tree; ' +

					'IF is_menu_item_in_tree > 0 ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Menu Item cannot be its own descendant\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'RETURN NEW; ' +
				'END; ' +
				'$$;'
			)
		]);
	})
	.then(function() {
		return knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_check_menu_item_upsert_is_valid BEFORE INSERT OR UPDATE ON public.menu_items FOR EACH ROW EXECUTE PROCEDURE public.fn_check_menu_item_upsert_is_valid();');
	});
};

exports.down = function(knex, Promise) {
	return Promise.all([
		knex.schema.raw("DROP TABLE IF EXISTS menu_items CASCADE"),
		knex.schema.raw("DROP TABLE IF EXISTS menus CASCADE")
	]);
};
