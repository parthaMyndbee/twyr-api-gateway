
exports.up = function(knex, Promise) {
	return Promise.all([
		knex.schema.raw("SET check_function_bodies = true"),
		knex.schema.withSchema('public')
		.raw(
			'CREATE FUNCTION public.fn_get_module_ancestors (IN moduleid uuid) ' +
				'RETURNS TABLE ( level integer,  id uuid,  parent_id uuid,  name text,  type public.module_type) ' +
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
						'A.parent_id, ' +
						'A.name, ' +
						'A.type ' +
					'FROM ' +
						'modules A ' +
					'WHERE ' +
						'A.id = moduleid ' +
					'UNION ALL ' +
					'SELECT ' +
						'q.level + 1, ' +
						'B.id, ' +
						'B.parent_id, ' +
						'B.name, ' +
						'B.type ' +
					'FROM ' +
						'q, ' +
						'modules B ' +
					'WHERE ' +
						'B.id = q.parent_id ' +
				') ' +
				'SELECT DISTINCT ' +
					'q.level, ' +
					'q.id, ' +
					'q.parent_id, ' +
					'q.name, ' +
					'q.type ' +
				'FROM ' +
					'q ' +
				'ORDER BY ' +
					'q.level, ' +
					'q.parent_id; ' +
			'END; ' +
			'$$;'
		),
		knex.schema.withSchema('public')
		.raw(
			'CREATE FUNCTION public.fn_is_module_enabled (IN moduleid uuid) ' +
				'RETURNS boolean ' +
				'LANGUAGE plpgsql ' +
				'VOLATILE ' +
				'CALLED ON NULL INPUT ' +
				'SECURITY INVOKER ' +
				'COST 1 ' +
				'AS $$ ' +
			'DECLARE ' +
				'is_disabled	integer; ' +
			'BEGIN ' +
				'SELECT ' +
					'COUNT(*) ' +
				'FROM ' +
					'modules ' +
				'WHERE ' +
					'id IN  (SELECT id FROM fn_get_module_ancestors(moduleid)) AND ' +
					'enabled = false ' +
				'INTO ' +
					'is_disabled; ' +
				'RETURN is_disabled <= 0; ' +
			'END; ' +
			'$$;'
		),
		knex.schema.withSchema('public')
		.raw(
			'CREATE FUNCTION public.fn_get_module_descendants (IN moduleid uuid) ' +
				'RETURNS TABLE ( level integer,  id uuid,  parent_id uuid,  name text,  type public.module_type, enabled boolean ) ' +
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
						'A.parent_id, ' +
						'A.name, ' +
						'A.type, ' +
						'fn_is_module_enabled(A.id) AS enabled ' +
					'FROM ' +
						'modules A ' +
					'WHERE ' +
						'A.id = moduleid ' +
					'UNION ALL ' +
					'SELECT ' +
						'q.level + 1, ' +
						'B.id, ' +
						'B.parent_id, ' +
						'B.name, ' +
						'B.type, ' +
						'fn_is_module_enabled(B.id) AS enabled ' +
					'FROM ' +
						'q, ' +
						'modules B ' +
					'WHERE ' +
						'B.parent_id = q.id ' +
				') ' +
				'SELECT DISTINCT ' +
					'q.level, ' +
					'q.id, ' +
					'q.parent_id, ' +
					'q.name, ' +
					'q.type, ' +
					'q.enabled ' +
				'FROM ' +
					'q ' +
				'ORDER BY ' +
					'q.level, ' +
					'q.parent_id; ' +
			'END; ' +
			'$$;'
		),
		knex.schema.withSchema('public')
		.raw(
			'CREATE FUNCTION public.fn_check_module_upsert_is_valid () ' +
				'RETURNS trigger ' +
				'LANGUAGE plpgsql ' +
				'VOLATILE  ' +
				'CALLED ON NULL INPUT ' +
				'SECURITY INVOKER ' +
				'COST 1 ' +
				'AS $$ ' +

			'DECLARE ' +
				'is_module_in_tree	INTEGER; ' +
			'BEGIN ' +
				'IF NEW.parent_id IS NULL ' +
				'THEN ' +
					'RETURN NEW; ' +
				'END IF; ' +

				'IF NEW.id = NEW.parent_id ' +
				'THEN ' +
					'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Module cannot be its own parent\'; ' +
					'RETURN NULL; ' +
				'END IF; ' +

				'is_module_in_tree := 0; ' +
				'SELECT ' +
					'COUNT(id) ' +
				'FROM ' +
					'fn_get_module_ancestors(NEW.parent_id) ' +
				'WHERE ' +
					'id = NEW.id ' +
				'INTO ' +
					'is_module_in_tree; ' +

				'IF is_module_in_tree > 0 ' +
				'THEN ' +
					'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Module cannot be its own ancestor\'; ' +
					'RETURN NULL; ' +
				'END IF; ' +

				'is_module_in_tree := 0; ' +
				'SELECT ' +
					'COUNT(id) ' +
				'FROM ' +
					'fn_get_module_descendants(NEW.id) ' +
				'WHERE ' +
					'id = NEW.id AND ' +
					'level > 1 ' +
				'INTO ' +
					'is_module_in_tree; ' +

				'IF is_module_in_tree > 0 ' +
				'THEN ' +
					'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Component cannot be its own descendant\'; ' +
					'RETURN NULL; ' +
				'END IF; ' +

				'RETURN NEW; ' +
			'END; ' +
			'$$;'
		),
		knex.schema.withSchema('public')
		.raw(
			'CREATE FUNCTION public.fn_notify_config_change () ' +
				'RETURNS trigger ' +
				'LANGUAGE plpgsql ' +
				'VOLATILE ' +
				'CALLED ON NULL INPUT ' +
				'SECURITY INVOKER ' +
				'COST 1 ' +
				'AS $$ ' +

			'BEGIN ' +
				'IF OLD.configuration = NEW.configuration AND OLD.enabled = NEW.enabled ' +
				'THEN ' +
					'RETURN NEW; ' +
				'END IF; ' +

				'IF OLD.configuration <> NEW.configuration ' +
				'THEN ' +
					'PERFORM pg_notify(\'config-change\', CAST(NEW.id AS text)); ' +
				'END IF; ' +

				'IF OLD.enabled <> NEW.enabled ' +
				'THEN ' +
					'PERFORM pg_notify(\'state-change\', CAST(NEW.id AS text)); ' +
				'END IF; ' +

				'RETURN NEW; ' +
			'END; ' +
			'$$;'
		),
		knex.schema.withSchema('public')
		.raw(
			'CREATE TRIGGER trigger_check_module_upsert_is_valid BEFORE INSERT OR UPDATE ON public.modules FOR EACH ROW EXECUTE PROCEDURE public.fn_check_module_upsert_is_valid();'
		),
		knex.schema.withSchema('public')
		.raw(
			'CREATE TRIGGER trigger_notify_config_change AFTER UPDATE ON public.modules FOR EACH ROW EXECUTE PROCEDURE public.fn_notify_config_change();'
		)
	]);
};

exports.down = function(knex, Promise) {
	return Promise.all([
		knex.schema.raw('DROP TRIGGER IF EXISTS trigger_notify_config_change ON public.modules CASCADE;'),
		knex.schema.raw('DROP TRIGGER IF EXISTS trigger_check_module_upsert_is_valid ON public.modules CASCADE;'),
		knex.schema.raw('DROP FUNCTION IF EXISTS public.fn_notify_config_change() CASCADE;'),
		knex.schema.raw('DROP FUNCTION IF EXISTS public.fn_check_module_upsert_is_valid() CASCADE;'),
		knex.schema.raw('DROP FUNCTION IF EXISTS public.fn_get_module_descendants(IN uuid) CASCADE'),
		knex.schema.raw('DROP FUNCTION IF EXISTS public.fn_is_module_enabled(IN uuid) CASCADE;'),
		knex.schema.raw('DROP FUNCTION IF EXISTS public.fn_get_module_ancestors(IN uuid) CASCADE;')
	]);
};
