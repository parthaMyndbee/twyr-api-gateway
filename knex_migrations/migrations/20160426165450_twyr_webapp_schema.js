
exports.up = function(knex, Promise) {
	// Step 1: Setup the basics in the database
	return Promise.all([
		knex.schema.raw("SET check_function_bodies = true"),
		knex.schema.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public'),
	])
	// Step 2: Setup types
	.then(function() {
		return Promise.all([
			knex.schema.raw("CREATE TYPE public.contact_type AS ENUM ('email','landline','mobile','other')"),
			knex.schema.raw("CREATE TYPE public.emergency_contact_type AS ENUM ('self','parent','sibling','child','cousin','colleague','medical professional','legal professional','other')"),
			knex.schema.raw("CREATE TYPE public.gender AS ENUM ('female','male','other')"),
			knex.schema.raw("CREATE TYPE public.module_type AS ENUM ('component','middleware','service')"),
			knex.schema.raw("CREATE TYPE public.tenant_type AS ENUM ('department','organization')"),
			knex.schema.raw("CREATE TYPE public.media_type AS ENUM ('all','desktop', 'tablet', 'mobile', 'other')"),
			knex.schema.raw("CREATE TYPE public.publish_status AS ENUM ('draft','published')")
		]);
	})
	// Step 3: Setup primary tables  - those that aren't dependent on other tables (i.e. no foreign keys to other tables)
	.then(function() {
		return Promise.all([
			knex.schema.withSchema('public')
			.createTableIfNotExists('modules', function(modTbl) {
				modTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				modTbl.uuid('parent').references('id').inTable('modules').onDelete('CASCADE').onUpdate('CASCADE');
				modTbl.specificType('type', 'public.module_type').notNullable().defaultTo('component');
				modTbl.text('name').notNullable();
				modTbl.text('display_name').notNullable();
				modTbl.text('description').notNullable().defaultTo('Another Twyr Module');
				modTbl.jsonb('metadata').notNullable().defaultTo('{}');
				modTbl.jsonb('configuration').notNullable().defaultTo('{}');
				modTbl.jsonb('configuration_schema').notNullable().defaultTo('{}');
				modTbl.boolean('admin_only').notNullable().defaultTo(false);
				modTbl.boolean('enabled').notNullable().defaultTo(true);
				modTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				modTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
				modTbl.unique(['parent', 'name']);
			}),

			knex.schema.withSchema('public')
			.createTableIfNotExists('users', function(userTbl) {
				userTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				userTbl.text('email').notNullable();
				userTbl.text('password').notNullable();
				userTbl.text('first_name').notNullable();
				userTbl.text('middle_names');
				userTbl.text('last_name').notNullable();
				userTbl.text('nickname');
				userTbl.uuid('profile_image');
				userTbl.jsonb('profile_image_metadata');
				userTbl.specificType('gender', 'public.gender').notNullable().defaultTo('other');
				userTbl.timestamp('dob');
				userTbl.uuid('home_module_menu');
				userTbl.boolean('enabled').notNullable().defaultTo(true);
				userTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				userTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
				userTbl.unique('email');
			}),

			knex.schema.withSchema('public')
			.createTableIfNotExists('tenants', function(tenantTbl) {
				tenantTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				tenantTbl.uuid('parent').references('id').inTable('tenants').onDelete('CASCADE').onUpdate('CASCADE');
				tenantTbl.specificType('type', 'public.tenant_type').notNullable().defaultTo('organization');
				tenantTbl.text('name').notNullable();
				tenantTbl.boolean('enabled').notNullable().defaultTo(true);
				tenantTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				tenantTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
				tenantTbl.unique(['parent', 'name']);
			})
		]);
	})
	// Step 4: Setup second-level tables - those that have foreign key relationships with the primary tables
	.then(function() {
		return Promise.all([
			knex.schema.withSchema('public')
			.createTableIfNotExists('tenants_modules', function(tenantModuleTbl) {
				tenantModuleTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				tenantModuleTbl.uuid('tenant').notNullable().references('id').inTable('tenants').onDelete('CASCADE').onUpdate('CASCADE');
				tenantModuleTbl.uuid('module').notNullable().references('id').inTable('modules').onDelete('CASCADE').onUpdate('CASCADE');
				tenantModuleTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				tenantModuleTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
				tenantModuleTbl.unique(['tenant', 'module']);
			}),

			knex.schema.withSchema('public')
			.createTableIfNotExists('module_permissions', function(permTbl) {
				permTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				permTbl.uuid('module').notNullable().references('id').inTable('modules').onDelete('CASCADE').onUpdate('CASCADE');
				permTbl.text('name').notNullable();
				permTbl.text('display_name').notNullable();
				permTbl.text('description').notNullable().defaultTo('Another Random Permission');
				permTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				permTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
				permTbl.unique(['module', 'name']);
				permTbl.unique(['module', 'id']);
			}),

			knex.schema.withSchema('public')
			.createTableIfNotExists('user_social_logins', function(socialLoginTbl) {
				socialLoginTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				socialLoginTbl.uuid('login').notNullable().references('id').inTable('users').onDelete('CASCADE').onUpdate('CASCADE');
				socialLoginTbl.text('provider').notNullable();
				socialLoginTbl.text('provider_uid').notNullable();
				socialLoginTbl.text('display_name').notNullable();
				socialLoginTbl.jsonb('social_data').notNullable();
				socialLoginTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				socialLoginTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
				socialLoginTbl.unique(['provider', 'provider_uid']);
			}),

			knex.schema.withSchema('public')
			.createTableIfNotExists('user_contacts', function(contactsTbl) {
				contactsTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				contactsTbl.uuid('login').notNullable().references('id').inTable('users').onDelete('CASCADE').onUpdate('CASCADE');
				contactsTbl.text('contact').notNullable();
				contactsTbl.specificType('type', 'public.contact_type').notNullable().defaultTo('other');
				contactsTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				contactsTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
			}),

			knex.schema.withSchema('public')
			.createTableIfNotExists('user_emergency_contacts', function(emergencyContactsTbl) {
				emergencyContactsTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				emergencyContactsTbl.uuid('login').notNullable().references('id').inTable('users').onDelete('CASCADE').onUpdate('CASCADE');
				emergencyContactsTbl.uuid('contact').notNullable().references('id').inTable('users').onDelete('CASCADE').onUpdate('CASCADE');
				emergencyContactsTbl.specificType('relationship', 'public.emergency_contact_type').notNullable().defaultTo('other');
				emergencyContactsTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				emergencyContactsTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
				emergencyContactsTbl.unique(['login', 'contact']);
			}),

			knex.schema.withSchema('public')
			.createTableIfNotExists('tenant_locations', function(locationTbl) {
				locationTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				locationTbl.uuid('tenant').notNullable().references('id').inTable('tenants').onDelete('CASCADE').onUpdate('CASCADE');
				locationTbl.text('line1').notNullable();
				locationTbl.text('line2');
				locationTbl.text('line3');
				locationTbl.text('area').notNullable();
				locationTbl.text('city').notNullable();
				locationTbl.text('state').notNullable();
				locationTbl.text('country').notNullable();
				locationTbl.text('postal_code').notNullable();
				locationTbl.decimal('latitude').notNullable();
				locationTbl.decimal('longitude').notNullable();
				locationTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				locationTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
				locationTbl.unique(['tenant', 'id']);
			}),

			knex.schema.withSchema('public')
			.createTableIfNotExists('tenant_job_titles', function(jobTitleTbl) {
				jobTitleTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				jobTitleTbl.uuid('tenant').notNullable().references('id').inTable('tenants').onDelete('CASCADE').onUpdate('CASCADE');
				jobTitleTbl.text('title').notNullable();
				jobTitleTbl.text('description');
				jobTitleTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				jobTitleTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
				jobTitleTbl.unique(['tenant', 'id']);
			}),

			knex.schema.withSchema('public')
			.createTableIfNotExists('tenant_groups', function(groupTbl) {
				groupTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				groupTbl.uuid('tenant').notNullable().references('id').inTable('tenants').onDelete('CASCADE').onUpdate('CASCADE');
				groupTbl.uuid('parent').references('id').inTable('tenant_groups').onDelete('CASCADE').onUpdate('CASCADE');
				groupTbl.text('name').notNullable();
				groupTbl.text('display_name').notNullable();
				groupTbl.text('description');
				groupTbl.boolean('default_for_new_user').notNullable().defaultTo(false);
				groupTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				groupTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
				groupTbl.unique(['parent', 'name']);
				groupTbl.unique(['tenant', 'id']);
			})
		]);
	})
	// Step 5: Setup third-level tables
	.then(function() {
		return Promise.all([
			knex.schema.withSchema('public')
			.createTableIfNotExists('module_widgets', function(modWidgetsTbl) {
				modWidgetsTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				modWidgetsTbl.uuid('module').notNullable().references('id').inTable('modules').onDelete('CASCADE').onUpdate('CASCADE');
				modWidgetsTbl.uuid('permission').notNullable().references('id').inTable('module_permissions').onDelete('CASCADE').onUpdate('CASCADE');
				modWidgetsTbl.text('ember_component').notNullable();
				modWidgetsTbl.text('display_name').notNullable();
				modWidgetsTbl.text('description');
				modWidgetsTbl.specificType('media', 'public.media_type[]').notNullable().defaultTo('{all}');
				modWidgetsTbl.jsonb('metadata').notNullable().defaultTo('{}');
				modWidgetsTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				modWidgetsTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
				modWidgetsTbl.unique(['ember_component']);
			}),

			knex.schema.withSchema('public')
			.createTableIfNotExists('module_menus', function(modMenusTbl) {
				modMenusTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				modMenusTbl.uuid('parent').references('id').inTable('module_menus').onDelete('CASCADE').onUpdate('CASCADE');
				modMenusTbl.uuid('module').notNullable().references('id').inTable('modules').onDelete('CASCADE').onUpdate('CASCADE');
				modMenusTbl.uuid('permission').notNullable().references('id').inTable('module_permissions').onDelete('CASCADE').onUpdate('CASCADE');
				modMenusTbl.text('category').notNullable().defaultTo('Components');
				modMenusTbl.text('ember_route').notNullable();
				modMenusTbl.text('icon_class').notNullable();
				modMenusTbl.text('display_name').notNullable();
				modMenusTbl.text('description');
				modMenusTbl.specificType('media', 'public.media_type[]').notNullable().defaultTo('{all}');
				modMenusTbl.text('tooltip');
				modMenusTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				modMenusTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
				modMenusTbl.unique(['ember_route']);
				modMenusTbl.unique(['module', 'display_name']);
			}),

			knex.schema.withSchema('public')
			.createTableIfNotExists('module_templates', function(modTmplTbl) {
				modTmplTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				modTmplTbl.uuid('module').notNullable().references('id').inTable('modules').onDelete('CASCADE').onUpdate('CASCADE');
				modTmplTbl.uuid('permission').notNullable().references('id').inTable('module_permissions').onDelete('CASCADE').onUpdate('CASCADE');
				modTmplTbl.text('name').notNullable();
				modTmplTbl.text('description').notNullable().defaultTo('Another Module Template');
				modTmplTbl.specificType('media', 'public.media_type[]').notNullable().defaultTo('{all}');
				modTmplTbl.boolean('is_default').notNullable().defaultTo(false);
				modTmplTbl.jsonb('metadata').notNullable().defaultTo('{}');
				modTmplTbl.jsonb('configuration').notNullable().defaultTo('{}');
				modTmplTbl.jsonb('configuration_schema').notNullable().defaultTo('{}');
				modTmplTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				modTmplTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
				modTmplTbl.unique(['module', 'name']);
			}),

			knex.schema.withSchema('public')
			.createTableIfNotExists('tenants_users', function(tenantUserTbl) {
				tenantUserTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				tenantUserTbl.uuid('tenant').notNullable().references('id').inTable('tenants').onDelete('CASCADE').onUpdate('CASCADE');
				tenantUserTbl.uuid('login').notNullable().references('id').inTable('users').onDelete('CASCADE').onUpdate('CASCADE');
				tenantUserTbl.uuid('job_title').references('id').inTable('tenant_job_titles').onDelete('CASCADE').onUpdate('CASCADE');
				tenantUserTbl.uuid('location').references('id').inTable('tenant_locations').onDelete('CASCADE').onUpdate('CASCADE');
				tenantUserTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				tenantUserTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
				tenantUserTbl.unique(['tenant', 'login']);
			}),

			knex.schema.withSchema('public')
			.createTableIfNotExists('tenant_group_permissions', function(groupPermissionTbl) {
				groupPermissionTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				groupPermissionTbl.uuid('tenant').notNullable();
				groupPermissionTbl.uuid('tenant_group').notNullable();
				groupPermissionTbl.uuid('module').notNullable();
				groupPermissionTbl.uuid('permission').notNullable();
				groupPermissionTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				groupPermissionTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
				groupPermissionTbl.unique(['tenant_group', 'permission']);

				groupPermissionTbl.foreign(['module', 'permission']).references(['module', 'id']).inTable('module_permissions').onDelete('CASCADE').onUpdate('CASCADE');
				groupPermissionTbl.foreign(['tenant', 'tenant_group']).references(['tenant', 'id']).inTable('tenant_groups').onDelete('CASCADE').onUpdate('CASCADE');
				groupPermissionTbl.foreign(['tenant', 'module']).references(['tenant', 'module']).inTable('tenants_modules').onDelete('CASCADE').onUpdate('CASCADE');
			}),

			knex.schema.withSchema('public')
			.createTableIfNotExists('module_template_positions', function(tmplPositionsTbl) {
				tmplPositionsTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				tmplPositionsTbl.uuid('template').notNullable().references('id').inTable('module_templates').onDelete('CASCADE').onUpdate('CASCADE');
				tmplPositionsTbl.text('name').notNullable();
				tmplPositionsTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				tmplPositionsTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
			})
		]);
	})
	// Step 6: Setup fourth-level tables
	.then(function() {
		return Promise.all([
			knex.schema.withSchema('public')
			.createTableIfNotExists('tenants_users_groups', function(tenantUserGroupTbl) {
				tenantUserGroupTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				tenantUserGroupTbl.uuid('tenant').notNullable();
				tenantUserGroupTbl.uuid('tenant_group').notNullable();
				tenantUserGroupTbl.uuid('login').notNullable();
				tenantUserGroupTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				tenantUserGroupTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
				tenantUserGroupTbl.unique(['tenant', 'tenant_group', 'login']);

				tenantUserGroupTbl.foreign(['tenant', 'tenant_group']).references(['tenant', 'id']).inTable('tenant_groups').onDelete('CASCADE').onUpdate('CASCADE');
				tenantUserGroupTbl.foreign(['tenant', 'login']).references(['tenant', 'login']).inTable('tenants_users').onDelete('CASCADE').onUpdate('CASCADE');
			}),

			knex.schema.withSchema('public')
			.createTableIfNotExists('module_widget_module_template_positions', function(widgetTmplPositionTbl) {
				widgetTmplPositionTbl.uuid('id').notNullable().primary().defaultTo(knex.raw('uuid_generate_v4()'));
				widgetTmplPositionTbl.uuid('template_position').notNullable().references('id').inTable('module_template_positions').onDelete('CASCADE').onUpdate('CASCADE');
				widgetTmplPositionTbl.uuid('module_widget').notNullable().references('id').inTable('module_widgets').onDelete('CASCADE').onUpdate('CASCADE');
				widgetTmplPositionTbl.integer('display_order').notNullable().defaultTo(1);
				widgetTmplPositionTbl.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
				widgetTmplPositionTbl.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
				widgetTmplPositionTbl.unique(['template_position', 'module_widget']);
			})
		]);
	})
	// Step 7: Setup user-defined functions on Modules table
	.then(function() {
		return Promise.all([
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_get_module_ancestors (IN moduleid uuid) ' +
					'RETURNS TABLE ( level integer,  id uuid,  parent uuid,  name text,  type public.module_type) ' +
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
							'B.parent, ' +
							'B.name, ' +
							'B.type ' +
						'FROM ' +
							'q, ' +
							'modules B ' +
						'WHERE ' +
							'B.id = q.parent ' +
					') ' +
					'SELECT DISTINCT ' +
						'q.level, ' +
						'q.id, ' +
						'q.parent, ' +
						'q.name, ' +
						'q.type ' +
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
					'RETURNS TABLE ( level integer,  id uuid,  parent uuid,  name text,  type public.module_type, enabled boolean ) ' +
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
							'B.parent, ' +
							'B.name, ' +
							'B.type, ' +
							'fn_is_module_enabled(B.id) AS enabled ' +
						'FROM ' +
							'q, ' +
							'modules B ' +
						'WHERE ' +
							'B.parent = q.id ' +
					') ' +
					'SELECT DISTINCT ' +
						'q.level, ' +
						'q.id, ' +
						'q.parent, ' +
						'q.name, ' +
						'q.type, ' +
						'q.enabled ' +
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
					'IF TG_OP = \'UPDATE\' ' +
					'THEN ' +
						'IF OLD.name <> NEW.name ' +
						'THEN ' +
							'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Module name is NOT mutable\'; ' +
							'RETURN NULL; ' +
						'END IF; ' +

						'IF OLD.type <> NEW.type ' +
						'THEN ' +
							'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Module type is NOT mutable\'; ' +
							'RETURN NULL; ' +
						'END IF; ' +
					'END IF; ' +


					'IF NEW.parent IS NULL ' +
					'THEN ' +
						'RETURN NEW; ' +
					'END IF; ' +

					'IF NEW.id = NEW.parent ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Module cannot be its own parent\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'is_module_in_tree := 0; ' +
					'SELECT ' +
						'COUNT(id) ' +
					'FROM ' +
						'fn_get_module_ancestors(NEW.parent) ' +
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
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Module cannot be its own descendant\'; ' +
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
				'CREATE FUNCTION public.fn_assign_module_to_tenant () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +

				'BEGIN ' +
					'IF NEW.type <> \'component\' ' +
					'THEN ' +
						'RETURN NEW; ' +
					'END IF; ' +

					'IF NEW.admin_only = true ' +
					'THEN ' +
						'INSERT INTO tenants_modules ( ' +
							'tenant, ' +
							'module ' +
						') ' +
						'SELECT ' +
							'id, ' +
							'NEW.id ' +
						'FROM ' +
							'tenants ' +
						'WHERE ' +
							'parent IS NULL; ' +
					'END IF; ' +

					'IF NEW.admin_only = false ' +
					'THEN ' +
						'INSERT INTO tenants_modules ( ' +
							'tenant, ' +
							'module ' +
						') ' +
						'SELECT ' +
							'id, ' +
							'NEW.id ' +
						'FROM ' +
							'tenants; ' +
					'END IF; ' +

					'RETURN NEW; ' +
				'END; ' +
				'$$;'
			)
		]);
	})
	// Step 8: Setup user-defined functions on Tenants table
	.then(function() {
		return Promise.all([
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_get_tenant_ancestors (IN tenantid uuid) ' +
					'RETURNS TABLE (level integer,  id uuid,  parent uuid,  name text,  type public.tenant_type) ' +
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
							'A.name, ' +
							'A.type ' +
						'FROM ' +
							'tenants A ' +
						'WHERE ' +
							'A.id = tenantid ' +
						'UNION ALL ' +
						'SELECT ' +
							'q.level + 1, ' +
							'B.id, ' +
							'B.parent, ' +
							'B.name, ' +
							'B.type ' +
						'FROM ' +
							'q, ' +
							'tenants B ' +
						'WHERE ' +
							'B.id = q.parent ' +
					') ' +
					'SELECT DISTINCT ' +
						'q.level, ' +
						'q.id, ' +
						'q.parent, ' +
						'q.name, ' +
						'q.type ' +
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
				'CREATE FUNCTION public.fn_is_tenant_enabled (IN tenantid uuid) ' +
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
						'tenants ' +
					'WHERE ' +
						'id IN  (SELECT id FROM fn_get_tenant_ancestors(tenantid)) AND ' +
						'enabled = false ' +
					'INTO ' +
						'is_disabled; ' +
					'RETURN is_disabled <= 0; ' +
				'END; ' +
				'$$;'
			),
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_get_tenant_descendants (IN tenantid uuid) ' +
					'RETURNS TABLE ( level integer,  id uuid,  parent uuid,  name text,  type public.tenant_type, enabled boolean ) ' +
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
							'A.name, ' +
							'A.type, ' +
							'fn_is_tenant_enabled(A.id) AS enabled ' +
						'FROM ' +
							'tenants A ' +
						'WHERE ' +
							'A.id = tenantid ' +
						'UNION ALL ' +
						'SELECT ' +
							'q.level + 1, ' +
							'B.id, ' +
							'B.parent, ' +
							'B.name, ' +
							'B.type, ' +
							'fn_is_tenant_enabled(B.id) AS enabled ' +
						'FROM ' +
							'q, ' +
							'tenants B ' +
						'WHERE ' +
							'B.parent = q.id ' +
					') ' +
					'SELECT DISTINCT ' +
						'q.level, ' +
						'q.id, ' +
						'q.parent, ' +
						'q.name, ' +
						'q.type, ' +
						'q.enabled ' +
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
				'CREATE FUNCTION public.fn_check_tenant_upsert_is_valid () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +

				'DECLARE ' +
					'is_tenant_in_tree	INTEGER; ' +
				'BEGIN ' +
					'IF NEW.parent IS NULL ' +
					'THEN ' +
						'RETURN NEW; ' +
					'END IF; ' +

					'IF NEW.id = NEW.parent ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Tenant cannot be its own parent\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'is_tenant_in_tree := 0; ' +
					'SELECT ' +
						'COUNT(id) ' +
					'FROM ' +
						'fn_get_tenant_ancestors(NEW.parent) ' +
					'WHERE ' +
						'id = NEW.id ' +
					'INTO ' +
						'is_tenant_in_tree; ' +

					'IF is_tenant_in_tree > 0 ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Tenant cannot be its own ancestor\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'is_tenant_in_tree := 0; ' +
					'SELECT ' +
						'COUNT(id) ' +
					'FROM ' +
						'fn_get_tenant_descendants(NEW.id) ' +
					'WHERE ' +
						'id = NEW.id AND ' +
						'level > 1 ' +
					'INTO ' +
						'is_tenant_in_tree; ' +

					'IF is_tenant_in_tree > 0 ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Tenant cannot be its own descendant\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'RETURN NEW; ' +
				'END; ' +
				'$$;'
			),
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_assign_defaults_to_tenant () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +

				'BEGIN ' +
					'INSERT INTO tenant_groups ( ' +
						'parent, ' +
						'tenant, ' +
						'name, ' +
						'display_name, ' +
						'description ' +
					') ' +
					'VALUES ( ' +
						'NULL, ' +
						'NEW.id, ' +
						'\'administrators\', ' +
						'NEW.name || \' Administrators\', ' +
						'\'The Administrator Group for \' || NEW.name ' +
					'); ' +

					'IF NEW.parent IS NOT NULL ' +
					'THEN ' +
						'INSERT INTO tenants_modules ( ' +
							'tenant, ' +
							'module ' +
						') ' +
						'SELECT ' +
							'NEW.id, ' +
							'id ' +
						'FROM ' +
							'modules ' +
						'WHERE ' +
							'admin_only = false AND ' +
							'type = \'component\' ' +
						'ORDER BY ' +
							'parent DESC; ' +
					'END IF; ' +

					'IF NEW.parent IS NULL ' +
					'THEN ' +
						'INSERT INTO tenants_modules ( ' +
							'tenant, ' +
							'module ' +
						') ' +
						'SELECT ' +
							'NEW.id, ' +
							'id ' +
						'FROM ' +
							'modules ' +
						'WHERE ' +
							'type = \'component\' ' +
						'ORDER BY ' +
							'parent DESC; ' +
					'END IF; ' +

					'RETURN NEW; ' +
				'END; ' +
				'$$;'
			)
		]);
	})
	// Step 9: Setup user-defined functions on Users table
	.then(function() {
		return Promise.all([
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_get_user_permissions (IN userid uuid) ' +
					'RETURNS TABLE ( tenant uuid,  permission uuid) ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +
				'BEGIN ' +
					'RETURN QUERY ' +
					'SELECT DISTINCT ' +
						'A.tenant AS tenant, ' +
						'A.permission AS permission ' +
					'FROM ' +
						'tenant_group_permissions A ' +
					'WHERE ' +
						'A.tenant_group IN (SELECT tenant_group FROM tenants_users_groups WHERE login = userid); ' +
				'END; ' +
				'$$;'
			),
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_check_user_upsert_is_valid () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +
				'DECLARE ' +
					'is_valid_home_module_menu INTEGER; ' +
				'BEGIN ' +
					'IF NEW.home_module_menu IS NULL ' +
					'THEN ' +
						'RETURN NEW; ' +
					'END IF; ' +

					'is_valid_home_module_menu := 0; ' +
					'SELECT ' +
						'count(id) ' +
					'FROM ' +
						'module_menus ' +
					'WHERE ' +
						'id = NEW.home_module_menu AND ' +
						'permission IN (SELECT DISTINCT permission FROM fn_get_user_permissions(NEW.id)) ' +
					'INTO ' +
						'is_valid_home_module_menu; ' +

					'IF is_valid_home_module_menu <= 0 ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'User does not have permissions for chosen Home Menu\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'RETURN NEW; ' +
				'END; ' +
				'$$;'
			)
		]);
	})
	// Step 10: Setup user-defined functions on Permissions table
	.then(function() {
		return Promise.all([
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_check_permission_insert_is_valid () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +

				'DECLARE ' +
					'is_component	INTEGER; ' +
				'BEGIN ' +
					'SELECT ' +
						'count(id) ' +
					'FROM ' +
						'modules ' +
					'WHERE ' +
						'id = NEW.module AND ' +
						'type = \'component\' ' +
					'INTO ' +
						'is_component; ' +

					'IF is_component <= 0 ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Permissions can be defined only for components, and not for other types of modules\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'RETURN NEW; ' +
				'END; ' +
				'$$;'
			),
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_check_permission_update_is_valid () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +

				'BEGIN ' +
					'IF OLD.module <> NEW.module ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Module assigned to a permission is NOT mutable\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'IF OLD.name <> NEW.name ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Permission name is NOT mutable\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'RETURN NEW; ' +
				'END; ' +
				'$$;'
			),
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_assign_permission_to_tenants () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +
				'BEGIN ' +
					'INSERT INTO tenant_group_permissions ( ' +
						'tenant, ' +
						'tenant_group, ' +
						'module, ' +
						'permission ' +
					') ' +
					'SELECT ' +
						'A.tenant, ' +
						'B.id, ' +
						'A.module, ' +
						'NEW.id ' +
					'FROM ' +
						'tenants_modules A ' +
						'INNER JOIN tenant_groups B ON (A.tenant = B.tenant) ' +
					'WHERE ' +
						'A.module = NEW.module AND ' +
						'B.parent IS NULL; ' +

					'RETURN NEW; ' +
				'END; ' +
				'$$;'
			)
		]);
	})
	// Step 11: Setup user-defined functions on Tenant Modules table
	.then(function() {
		return Promise.all([
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_check_tenant_module_upsert_is_valid () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +

				'DECLARE ' +
					'is_component	INTEGER; ' +
					'is_admin_only	BOOLEAN; ' +
					'tenant_parent	UUID; ' +
					'component_parent	UUID; ' +
				'BEGIN ' +
					'is_component := 0; ' +
					'SELECT ' +
						'count(id) ' +
					'FROM ' +
						'modules ' +
					'WHERE ' +
						'id = NEW.module AND ' +
						'type = \'component\' ' +
					'INTO ' +
						'is_component; ' +

					'IF is_component <= 0 ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Only components can be mapped to tenants\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'component_parent := NULL; ' +
					'SELECT  ' +
						'parent ' +
					'FROM ' +
						'modules ' +
					'WHERE ' +
						'id = NEW.module ' +
					'INTO ' +
						'component_parent; ' +

					'IF component_parent IS NOT NULL ' +
					'THEN ' +
						'is_component := 0; ' +
						'SELECT ' +
							'count(id) ' +
						'FROM ' +
							'tenants_modules ' +
						'WHERE ' +
							'tenant = NEW.tenant AND ' +
							'module = component_parent ' +
						'INTO ' +
							'is_component; ' +

						'IF is_component = 0 ' +
						'THEN ' +
							'RAISE WARNING SQLSTATE \'2F003\' USING MESSAGE = \'Parent component not mapped to this Tenant\'; ' +
						'END IF; ' +
					'END IF; ' +

					'is_admin_only := false; ' +
					'SELECT ' +
						'admin_only ' +
					'FROM ' +
						'modules ' +
					'WHERE ' +
						'id = NEW.module ' +
					'INTO ' +
						'is_admin_only; ' +

					'IF is_admin_only = false ' +
					'THEN ' +
						'RETURN NEW; ' +
					'END IF; ' +

					'tenant_parent := NULL; ' +
					'SELECT ' +
						'parent ' +
					'FROM ' +
						'tenants ' +
					'WHERE ' +
						'id = NEW.tenant ' +
					'INTO ' +
						'tenant_parent; ' +

					'IF tenant_parent IS NOT NULL ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Admin only components can be mapped only to root tenant\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'RETURN NEW; ' +
				'END; ' +
				'$$;'
			),
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_assign_permission_to_tenant_group () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +

				'DECLARE ' +
					'tenant_root_tenant_group	UUID; ' +
				'BEGIN ' +
					'tenant_root_tenant_group := NULL; ' +
					'SELECT ' +
						'id ' +
					'FROM ' +
						'tenant_groups ' +
					'WHERE ' +
						'tenant = NEW.tenant AND ' +
						'parent IS NULL ' +
					'INTO ' +
						'tenant_root_tenant_group; ' +

					'IF tenant_root_tenant_group IS NULL ' +
					'THEN ' +
						'RETURN NEW; ' +
					'END IF; ' +

					'INSERT INTO tenant_group_permissions( ' +
						'tenant, ' +
						'tenant_group, ' +
						'module, ' +
						'permission ' +
					') ' +
					'SELECT ' +
						'NEW.tenant, ' +
						'tenant_root_tenant_group, ' +
						'module, ' +
						'id ' +
					'FROM ' +
						'module_permissions ' +
					'WHERE ' +
						'module = NEW.module; ' +

					'RETURN NEW; ' +
				'END; ' +
				'$$;'
			),
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_remove_descendant_module_from_tenant () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +

				'BEGIN ' +
					'DELETE FROM ' +
						'tenants_modules ' +
					'WHERE ' +
						'tenant = OLD.tenant AND ' +
						'module IN (SELECT id FROM fn_get_module_descendants(OLD.module) WHERE level = 2); ' +

					'RETURN OLD; ' +
				'END; ' +
				'$$;'
			)
		]);
	})
	// Step 12: Setup user-defined functions on Groups & Group Permissions table
	.then(function() {
		return Promise.all([
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_get_group_ancestors (IN groupid uuid) ' +
					'RETURNS TABLE (level integer,  id uuid,  parent uuid,  name text) ' +
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
							'A.name ' +
						'FROM ' +
							'tenant_groups A ' +
						'WHERE ' +
							'A.id = groupid ' +
						'UNION ALL ' +
						'SELECT ' +
							'q.level + 1, ' +
							'B.id, ' +
							'B.parent, ' +
							'B.name ' +
						'FROM ' +
							'q, ' +
							'tenant_groups B ' +
						'WHERE ' +
							'B.id = q.parent ' +
					') ' +
					'SELECT DISTINCT ' +
						'q.level, ' +
						'q.id, ' +
						'q.parent, ' +
						'q.name ' +
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
				'CREATE FUNCTION public.fn_get_group_descendants (IN groupid uuid) ' +
					'RETURNS TABLE (level integer,  id uuid,  parent uuid,  name text) ' +
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
							'A.name ' +
						'FROM ' +
							'tenant_groups A ' +
						'WHERE ' +
							'A.id = groupid ' +
						'UNION ALL ' +
						'SELECT ' +
							'q.level + 1, ' +
							'B.id, ' +
							'B.parent, ' +
							'B.name ' +
						'FROM ' +
							'q, ' +
							'tenant_groups B ' +
						'WHERE ' +
							'B.parent = q.id ' +
					') ' +
					'SELECT DISTINCT ' +
						'q.level, ' +
						'q.id, ' +
						'q.parent, ' +
						'q.name ' +
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
				'CREATE FUNCTION public.fn_check_group_update_is_valid () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +

				'BEGIN ' +
					'IF OLD.parent <> NEW.parent ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Group cannot change parent\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'RETURN NEW; ' +
				'END; ' +
				'$$;'
			),
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_check_group_permission_insert_is_valid () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +
				'DECLARE ' +
					'parent_tenant_group					UUID; ' +
					'does_parent_group_have_permission	INTEGER; ' +
				'BEGIN ' +
					'parent_tenant_group := NULL; ' +
					'SELECT ' +
						'parent ' +
					'FROM ' +
						'tenant_groups ' +
					'WHERE ' +
						'id = NEW.tenant_group ' +
					'INTO ' +
						'parent_tenant_group; ' +

					'IF parent_tenant_group IS NULL ' +
					'THEN ' +
						'RETURN NEW; ' +
					'END IF; ' +

					'does_parent_group_have_permission := 0; ' +
					'SELECT ' +
						'count(id) ' +
					'FROM ' +
						'tenant_group_permissions ' +
					'WHERE ' +
						'tenant_group = parent_tenant_group AND ' +
						'permission = NEW.permission ' +
					'INTO ' +
						'does_parent_group_have_permission; ' +

					'IF does_parent_group_have_permission > 0 ' +
					'THEN ' +
						'RETURN NEW; ' +
					'END IF; ' +

					'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Parent Group does not have this permission\'; ' +
					'RETURN NULL; ' +
				'END; ' +
				'$$;'
			),
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_remove_group_permission_from_descendants () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +

				'BEGIN ' +
					'DELETE FROM ' +
						'tenant_group_permissions ' +
					'WHERE ' +
						'tenant_group IN (SELECT id FROM fn_get_group_descendants(OLD.tenant_group) WHERE level = 2) AND ' +
						'permission = OLD.permission; ' +

					'RETURN OLD; ' +
				'END; ' +
				'$$;'
			)
		]);
	})
	// Step 13: Setup user-defined functions on Tenants Users table
	.then(function() {
		return Promise.all([
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_assign_default_group_to_tenant_user () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +

				'DECLARE ' +
					'default_tenant_group	UUID; ' +
				'BEGIN ' +
					'default_tenant_group := NULL; ' +
					'SELECT ' +
						'id ' +
					'FROM ' +
						'tenant_groups ' +
					'WHERE ' +
						'tenant = NEW.tenant AND ' +
						'default_for_new_user = true ' +
					'INTO ' +
						'default_tenant_group; ' +

					'IF default_tenant_group IS NULL ' +
					'THEN ' +
						'RETURN NEW; ' +
					'END IF; ' +

					'INSERT INTO tenants_users_groups ( ' +
						'tenant, ' +
						'tenant_group, ' +
						'login ' +
					') ' +
					'VALUES ( ' +
						'NEW.tenant, ' +
						'default_tenant_group, ' +
						'NEW.login ' +
					'); ' +

					'RETURN NEW; ' +
				'END; ' +
				'$$;'
			)
		]);
	})
	// Step 14: Setup user-defined functions on Tenants Users Groups table
	.then(function() {
		return Promise.all([
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_check_tenant_user_group_upsert_is_valid () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +
				'DECLARE ' +
					'is_member_of_ancestor_group	INTEGER; ' +
				'BEGIN ' +
					'is_member_of_ancestor_group := 0; ' +
					'SELECT ' +
						'count(id) ' +
					'FROM ' +
						'tenants_users_groups ' +
					'WHERE ' +
						'tenant = NEW.tenant AND ' +
						'tenant_group IN (SELECT id FROM fn_get_group_ancestors(NEW.tenant_group) WHERE level > 1) AND ' +
						'login = NEW.login ' +
					'INTO ' +
						'is_member_of_ancestor_group; ' +

					'IF is_member_of_ancestor_group = 0 ' +
					'THEN ' +
						'RETURN NEW; ' +
					'END IF; ' +

					'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'User is already a member of a Parent Group\'; ' +
					'RETURN NULL; ' +
				'END; ' +
				'$$;'
			),
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_remove_descendant_group_from_tenant_user () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +
				'BEGIN ' +
					'DELETE FROM ' +
						'tenants_users_groups ' +
					'WHERE ' +
						'tenant = NEW.tenant AND ' +
						'tenant_group IN (SELECT id FROM fn_get_group_descendants(NEW.tenant_group) WHERE level > 1) AND ' +
						'login = NEW.login; ' +

					'RETURN NEW; ' +
				'END; ' +
				'$$;'
			)
		]);
	})
	// Step 15: Setup user-defined functions on Module Menus table
	.then(function() {
		return Promise.all([
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_get_module_menu_ancestors (IN menuid uuid) ' +
					'RETURNS TABLE ( level integer,  id uuid,  parent uuid,  ember_route text) ' +
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
							'A.ember_route ' +
						'FROM ' +
							'module_menus A ' +
						'WHERE ' +
							'A.id = menuid ' +
						'UNION ALL ' +
						'SELECT ' +
							'q.level + 1, ' +
							'B.id, ' +
							'B.parent, ' +
							'B.ember_route ' +
						'FROM ' +
							'q, ' +
							'module_menus B ' +
						'WHERE ' +
							'B.id = q.parent ' +
					') ' +
					'SELECT DISTINCT ' +
						'q.level, ' +
						'q.id, ' +
						'q.parent, ' +
						'q.ember_route ' +
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
				'CREATE FUNCTION public.fn_get_module_menu_descendants (IN menuid uuid) ' +
					'RETURNS TABLE ( level integer,  id uuid,  parent uuid,  ember_route text) ' +
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
							'A.ember_route ' +
						'FROM ' +
							'module_menus A ' +
						'WHERE ' +
							'A.id = menuid ' +
						'UNION ALL ' +
						'SELECT ' +
							'q.level + 1, ' +
							'B.id, ' +
							'B.parent, ' +
							'B.ember_route ' +
						'FROM ' +
							'q, ' +
							'module_menus B ' +
						'WHERE ' +
							'B.parent = q.id ' +
					') ' +
					'SELECT DISTINCT ' +
						'q.level, ' +
						'q.id, ' +
						'q.parent, ' +
						'q.ember_route ' +
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
				'CREATE FUNCTION public.fn_check_module_menu_upsert_is_valid () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +

				'DECLARE ' +
					'is_module_menu_in_tree	INTEGER; ' +
					'is_component			INTEGER; ' +
					'is_permission_ok		INTEGER; ' +
				'BEGIN ' +
					'is_component := 0; ' +
					'SELECT ' +
						'count(id) ' +
					'FROM ' +
						'modules ' +
					'WHERE ' +
						'id = NEW.module AND ' +
						'type = \'component\' ' +
					'INTO ' +
						'is_component; ' +

					'IF is_component <= 0 ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Menus can be assigned only to Components\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'is_permission_ok := 0; ' +
					'SELECT ' +
						'count(id) ' +
					'FROM ' +
						'module_permissions ' +
					'WHERE ' +
						'module IN (SELECT id FROM fn_get_module_ancestors(NEW.module)) AND ' +
						'id = NEW.permission ' +
					'INTO ' +
						'is_permission_ok; ' +

					'IF is_permission_ok <= 0 ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Menus must use Permissions defined by the Component or one of its parents\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'IF NEW.parent IS NULL ' +
					'THEN ' +
						'RETURN NEW; ' +
					'END IF; ' +

					'IF NEW.id = NEW.parent ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Module Menu cannot be its own parent\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'is_module_menu_in_tree := 0; ' +
					'SELECT ' +
						'COUNT(id) ' +
					'FROM ' +
						'fn_get_module_menu_ancestors(NEW.parent) ' +
					'WHERE ' +
						'id = NEW.id ' +
					'INTO ' +
						'is_module_menu_in_tree; ' +

					'IF is_module_menu_in_tree > 0 ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Module Menu cannot be its own ancestor\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'is_module_menu_in_tree := 0; ' +
					'SELECT ' +
						'COUNT(id) ' +
					'FROM ' +
						'fn_get_module_menu_descendants(NEW.id) ' +
					'WHERE ' +
						'id = NEW.id AND ' +
						'level > 1 ' +
					'INTO ' +
						'is_module_menu_in_tree; ' +

					'IF is_module_menu_in_tree > 0 ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Module Menu cannot be its own descendant\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'RETURN NEW; ' +
				'END; ' +
				'$$;'
			)
		]);
	})
	// Step 16: Setup user-defined functions on Module Widgets table
	.then(function() {
		return Promise.all([
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_check_module_widget_upsert_is_valid () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +

				'DECLARE ' +
					'is_component			INTEGER; ' +
					'is_permission_ok		INTEGER; ' +
				'BEGIN ' +
					'is_component := 0; ' +
					'SELECT ' +
						'count(id) ' +
					'FROM ' +
						'modules ' +
					'WHERE ' +
						'id = NEW.module AND ' +
						'type = \'component\' ' +
					'INTO ' +
						'is_component; ' +

					'IF is_component <= 0 ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Widgets can be assigned only to Components\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'is_permission_ok := 0; ' +
					'SELECT ' +
						'count(id) ' +
					'FROM ' +
						'module_permissions ' +
					'WHERE ' +
						'module IN (SELECT id FROM fn_get_module_ancestors(NEW.module)) AND ' +
						'id = NEW.permission ' +
					'INTO ' +
						'is_permission_ok; ' +

					'IF is_permission_ok <= 0 ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Widgets must use Permissions defined by the Component or one of its parents\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'RETURN NEW; ' +
				'END; ' +
				'$$;'
			)
		]);
	})
	// Step 17: Setup user-defined functions on Module Templates table
	.then(function() {
		return Promise.all([
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_check_module_template_upsert_is_valid () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +

				'DECLARE ' +
					'is_component			INTEGER; ' +
					'is_permission_ok		INTEGER; ' +
				'BEGIN ' +
					'is_component := 0; ' +
					'SELECT ' +
						'count(id) ' +
					'FROM ' +
						'modules ' +
					'WHERE ' +
						'id = NEW.module AND ' +
						'type = \'component\' ' +
					'INTO ' +
						'is_component; ' +

					'IF is_component <= 0 ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Templates can be assigned only to Components\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'is_permission_ok := 0; ' +
					'SELECT ' +
						'count(id) ' +
					'FROM ' +
						'module_permissions ' +
					'WHERE ' +
						'module IN (SELECT id FROM fn_get_module_ancestors(NEW.module)) AND ' +
						'id = NEW.permission ' +
					'INTO ' +
						'is_permission_ok; ' +

					'IF is_permission_ok <= 0 ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Templates must use Permissions defined by the Component or one of its parents\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'RETURN NEW; ' +
				'END; ' +
				'$$;'
			)
		]);
	})
	// Step 18: Setup user-defined functions on Widget Template Position table
	.then(function() {
		return Promise.all([
			knex.schema.withSchema('public')
			.raw(
				'CREATE FUNCTION public.fn_check_widget_template_position_upsert_is_valid () ' +
					'RETURNS trigger ' +
					'LANGUAGE plpgsql ' +
					'VOLATILE  ' +
					'CALLED ON NULL INPUT ' +
					'SECURITY INVOKER ' +
					'COST 1 ' +
					'AS $$ ' +
				'DECLARE ' +
					'template_module 			UUID; ' +
					'template_module_parent 	UUID; ' +
					'widget_module				UUID; ' +
					'is_child_component			INTEGER; ' +
				'BEGIN ' +
					'template_module := NULL; ' +
					'template_module_parent := NULL; ' +
					'widget_module := NULL; ' +
					'is_child_component := 0; ' +

					'SELECT ' +
						'id, parent ' +
					'FROM ' +
						'modules ' +
					'WHERE ' +
						'id = (SELECT module FROM module_templates WHERE id = (SELECT template FROM module_template_positions WHERE id = NEW.template_position)) ' +
					'INTO ' +
						'template_module, ' +
						'template_module_parent; ' +

					'SELECT ' +
						'module ' +
					'FROM ' +
						'module_widgets ' +
					'WHERE ' +
						'id = NEW.module_widget ' +
					'INTO ' +
						'widget_module; ' +

					'IF template_module_parent IS NOT NULL ' +
					'THEN ' +
						'SELECT ' +
							'count(A.id) ' +
						'FROM ' +
							'(SELECT id FROM fn_get_module_descendants(template_module_parent) WHERE level = 2 AND type = \'component\') A ' +
						'WHERE ' +
							'A.id = widget_module ' +
						'INTO ' +
							'is_child_component; ' +

						'IF is_child_component > 0 ' +
						'THEN ' +
							'RETURN NEW; ' +
						'END IF; ' +
					'END IF; ' +

					'is_child_component := 0; ' +
					'SELECT ' +
						'count(A.id) ' +
					'FROM ' +
						'(SELECT id FROM fn_get_module_descendants(template_module) WHERE level <= 2 AND type = \'component\') A ' +
					'WHERE ' +
						'A.id = widget_module ' +
					'INTO ' +
						'is_child_component; ' +

					'IF is_child_component <= 0 ' +
					'THEN ' +
						'RAISE SQLSTATE \'2F003\' USING MESSAGE = \'Only widgets belonging to the same component or one of its children or a sibling can be assigned to a components template\'; ' +
						'RETURN NULL; ' +
					'END IF; ' +

					'RETURN NEW; ' +
				'END; ' +
				'$$;'
			)
		]);
	})
	// Finally: Create the triggers on all the tables
	.then(function() {
		return Promise.all([
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_notify_config_change AFTER UPDATE ON public.modules FOR EACH ROW EXECUTE PROCEDURE public.fn_notify_config_change();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_check_module_upsert_is_valid BEFORE INSERT OR UPDATE ON public.modules FOR EACH ROW EXECUTE PROCEDURE public.fn_check_module_upsert_is_valid();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_assign_module_to_tenant AFTER INSERT ON public.modules FOR EACH ROW EXECUTE PROCEDURE public.fn_assign_module_to_tenant();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_check_tenant_upsert_is_valid BEFORE INSERT OR UPDATE ON public.tenants FOR EACH ROW EXECUTE PROCEDURE public.fn_check_tenant_upsert_is_valid();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_check_user_upsert_is_valid BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE PROCEDURE public.fn_check_user_upsert_is_valid();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_assign_defaults_to_tenant AFTER INSERT ON public.tenants FOR EACH ROW EXECUTE PROCEDURE public.fn_assign_defaults_to_tenant();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_check_permission_insert_is_valid BEFORE INSERT ON public.module_permissions FOR EACH ROW EXECUTE PROCEDURE public.fn_check_permission_insert_is_valid();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_check_permission_update_is_valid BEFORE UPDATE ON public.module_permissions FOR EACH ROW EXECUTE PROCEDURE public.fn_check_permission_update_is_valid();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_assign_default_group_to_tenant_user AFTER INSERT ON public.tenants_users FOR EACH ROW EXECUTE PROCEDURE public.fn_assign_default_group_to_tenant_user();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_check_group_update_is_valid BEFORE UPDATE ON public.tenant_groups FOR EACH ROW EXECUTE PROCEDURE public.fn_check_group_update_is_valid();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_check_tenant_module_upsert_is_valid BEFORE INSERT OR UPDATE ON public.tenants_modules FOR EACH ROW EXECUTE PROCEDURE public.fn_check_tenant_module_upsert_is_valid();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_assign_permission_to_tenant_group AFTER INSERT OR UPDATE ON public.tenants_modules FOR EACH ROW EXECUTE PROCEDURE public.fn_assign_permission_to_tenant_group();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_remove_descendant_module_from_tenant AFTER DELETE ON public.tenants_modules FOR EACH ROW EXECUTE PROCEDURE public.fn_remove_descendant_module_from_tenant();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_remove_group_permission_from_descendants AFTER DELETE ON public.tenant_group_permissions FOR EACH ROW EXECUTE PROCEDURE public.fn_remove_group_permission_from_descendants();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_check_group_permission_insert_is_valid BEFORE INSERT OR UPDATE ON public.tenant_group_permissions FOR EACH ROW EXECUTE PROCEDURE public.fn_check_group_permission_insert_is_valid();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_assign_permission_to_tenants AFTER INSERT ON public.module_permissions FOR EACH ROW EXECUTE PROCEDURE public.fn_assign_permission_to_tenants();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_remove_descendant_group_from_tenant_user AFTER INSERT OR UPDATE ON public.tenants_users_groups FOR EACH ROW EXECUTE PROCEDURE public.fn_remove_descendant_group_from_tenant_user();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_check_tenant_user_group_upsert_is_valid BEFORE INSERT OR UPDATE ON public.tenants_users_groups FOR EACH ROW EXECUTE PROCEDURE public.fn_check_tenant_user_group_upsert_is_valid();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_check_module_menu_upsert_is_valid BEFORE INSERT OR UPDATE ON public.module_menus FOR EACH ROW EXECUTE PROCEDURE public.fn_check_module_menu_upsert_is_valid();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_check_module_widget_upsert_is_valid BEFORE INSERT OR UPDATE ON public.module_widgets FOR EACH ROW EXECUTE PROCEDURE public.fn_check_module_widget_upsert_is_valid();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_check_module_template_upsert_is_valid BEFORE INSERT OR UPDATE ON public.module_templates FOR EACH ROW EXECUTE PROCEDURE public.fn_check_module_template_upsert_is_valid();'),
			knex.schema.withSchema('public').raw('CREATE TRIGGER trigger_check_widget_template_position_upsert_is_valid BEFORE INSERT OR UPDATE ON public.module_widget_module_template_positions FOR EACH ROW EXECUTE PROCEDURE public.fn_check_widget_template_position_upsert_is_valid();')
		]);
	});
};

exports.down = function(knex, Promise) {
	return knex.schema.raw('DROP SCHEMA public CASCADE;')
	.then(function() {
		return knex.schema.raw('CREATE SCHEMA public;');
	});
};
