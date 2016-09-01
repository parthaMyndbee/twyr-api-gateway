-- Database generated with pgModeler (PostgreSQL Database Modeler).
-- pgModeler  version: 0.8.1
-- PostgreSQL version: 9.4
-- Project Site: pgmodeler.com.br
-- Model Author: ---

SET check_function_bodies = false;
-- ddl-end --


-- Database creation must be done outside an multicommand file.
-- These commands were put in this file only for convenience.
-- -- object: "twyr-api-gateway" | type: DATABASE --
-- -- DROP DATABASE IF EXISTS "twyr-api-gateway";
-- CREATE DATABASE "twyr-api-gateway"
-- ;
-- -- ddl-end --
-- 

-- object: public.module_type | type: TYPE --
-- DROP TYPE IF EXISTS public.module_type CASCADE;
CREATE TYPE public.module_type AS
 ENUM ('component','middleware','service');
-- ddl-end --
ALTER TYPE public.module_type OWNER TO postgres;
-- ddl-end --

-- object: "uuid-ossp" | type: EXTENSION --
-- DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;
CREATE EXTENSION "uuid-ossp"
      WITH SCHEMA public;
-- ddl-end --

-- object: public.fn_assign_module_to_tenant | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_assign_module_to_tenant() CASCADE;
CREATE FUNCTION public.fn_assign_module_to_tenant ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

BEGIN
	IF NEW.type <> 'component'
	THEN
		RETURN NEW;
	END IF;

	IF NEW.admin_only = true
	THEN
		INSERT INTO tenants_modules (
			tenant,
			module
		)
		SELECT
			id,
			NEW.id
		FROM
			tenants
		WHERE
			parent IS NULL;
	END IF;

	IF NEW.admin_only = false
	THEN
		INSERT INTO tenants_modules (
			tenant,
			module
		)
		SELECT
			id,
			NEW.id
		FROM
			tenants;
	END IF;

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_assign_module_to_tenant() OWNER TO postgres;
-- ddl-end --

-- object: public.fn_get_module_ancestors | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_get_module_ancestors(IN uuid) CASCADE;
CREATE FUNCTION public.fn_get_module_ancestors (IN moduleid uuid)
	RETURNS TABLE ( level integer,  id uuid,  parent uuid,  name text,  type public.module_type)
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

BEGIN
	RETURN QUERY
	WITH RECURSIVE q AS (
		SELECT
			1 AS level,
			A.id,
			A.parent,
			A.name,
			A.type
		FROM
			modules A
		WHERE
			A.id = moduleid
		UNION ALL
		SELECT
			q.level + 1,
			B.id,
			B.parent,
			B.name,
			B.type
		FROM
			q,
			modules B
		WHERE
			B.id = q.parent
	)
	SELECT DISTINCT
		q.level,
		q.id,
		q.parent,
		q.name,
		q.type
	FROM
		q
	ORDER BY
		q.level,
		q.parent;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_get_module_ancestors(IN uuid) OWNER TO postgres;
-- ddl-end --

-- object: public.fn_get_module_descendants | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_get_module_descendants(IN uuid) CASCADE;
CREATE FUNCTION public.fn_get_module_descendants (IN moduleid uuid)
	RETURNS TABLE ( level integer,  id uuid,  parent uuid,  name text,  type public.module_type,  enabled boolean)
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

BEGIN
	RETURN QUERY
	WITH RECURSIVE q AS (
		SELECT
			1 AS level,
			A.id,
			A.parent,
			A.name,
			A.type,
			fn_is_module_enabled(A.id) AS enabled
		FROM
			modules A
		WHERE
			A.id = moduleid
		UNION ALL
		SELECT
			q.level + 1,
			B.id,
			B.parent,
			B.name,
			B.type,
			fn_is_module_enabled(B.id) AS enabled
		FROM
			q,
			modules B
		WHERE
			B.parent = q.id
	)
	SELECT DISTINCT
		q.level,
		q.id,
		q.parent,
		q.name,
		q.type,
		q.enabled
	FROM
		q
	ORDER BY
		q.level,
		q.parent;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_get_module_descendants(IN uuid) OWNER TO postgres;
-- ddl-end --

-- object: public.fn_is_module_enabled | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_is_module_enabled(IN uuid) CASCADE;
CREATE FUNCTION public.fn_is_module_enabled (IN moduleid uuid)
	RETURNS boolean
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

DECLARE
	is_disabled	integer;
BEGIN
	SELECT
		COUNT(*)
	FROM
		modules
	WHERE
		id IN  (SELECT id FROM fn_get_module_ancestors(moduleid)) AND
		enabled = false
	INTO
		is_disabled;

	RETURN is_disabled <= 0;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_is_module_enabled(IN uuid) OWNER TO postgres;
-- ddl-end --

-- object: public.fn_check_module_upsert_is_valid | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_check_module_upsert_is_valid() CASCADE;
CREATE FUNCTION public.fn_check_module_upsert_is_valid ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

DECLARE
	is_module_in_tree	INTEGER;
BEGIN
	IF TG_OP = 'UPDATE'
	THEN
		IF OLD.name <> NEW.name
		THEN
			RAISE SQLSTATE '2F003' USING MESSAGE = 'Module name is NOT mutable';
			RETURN NULL;
		END IF;

		IF OLD.type <> NEW.type
		THEN
			RAISE SQLSTATE '2F003' USING MESSAGE = 'Module type is NOT mutable';
			RETURN NULL;
		END IF;
	END IF;



	IF NEW.parent IS NULL
	THEN
		RETURN NEW;
	END IF;

	IF NEW.id = NEW.parent
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Module cannot be its own parent';
		RETURN NULL;
	END IF;

	/* Check if the module is its own ancestor */
	is_module_in_tree := 0;
	SELECT
		COUNT(id)
	FROM
		fn_get_module_ancestors(NEW.parent)
	WHERE
		id = NEW.id
	INTO
		is_module_in_tree;

	IF is_module_in_tree > 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Module cannot be its own ancestor';
		RETURN NULL;
	END IF;

	/* Check if the module is its own descendant */
	is_module_in_tree := 0;
	SELECT
		COUNT(id)
	FROM
		fn_get_module_descendants(NEW.id)
	WHERE
		id = NEW.id AND
		level > 1
	INTO
		is_module_in_tree;

	IF is_module_in_tree > 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Module cannot be its own descendant';
		RETURN NULL;
	END IF;

	RETURN NEW;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_check_module_upsert_is_valid() OWNER TO postgres;
-- ddl-end --

-- object: public.fn_notify_config_change | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_notify_config_change() CASCADE;
CREATE FUNCTION public.fn_notify_config_change ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

BEGIN
	IF OLD.configuration = NEW.configuration AND OLD.enabled = NEW.enabled
	THEN
		RETURN NEW;
	END IF;

	IF OLD.configuration <> NEW.configuration
	THEN
		PERFORM pg_notify('config-change', CAST(NEW.id AS text));
	END IF;

	IF OLD.enabled <> NEW.enabled
	THEN
		PERFORM pg_notify('state-change', CAST(NEW.id AS text));
	END IF;

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_notify_config_change() OWNER TO postgres;
-- ddl-end --

-- object: public.modules | type: TABLE --
-- DROP TABLE IF EXISTS public.modules CASCADE;
CREATE TABLE public.modules(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	parent uuid,
	type public.module_type NOT NULL DEFAULT 'component',
	name text NOT NULL,
	display_name text NOT NULL,
	description text NOT NULL DEFAULT 'Another Twyr Module',
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
	configuration_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
	admin_only boolean DEFAULT false::boolean,
	enabled boolean NOT NULL DEFAULT true::boolean,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_modules PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.modules OWNER TO postgres;
-- ddl-end --

-- object: public.tenant_type | type: TYPE --
-- DROP TYPE IF EXISTS public.tenant_type CASCADE;
CREATE TYPE public.tenant_type AS
 ENUM ('department','organization');
-- ddl-end --
ALTER TYPE public.tenant_type OWNER TO postgres;
-- ddl-end --

-- object: public.tenants | type: TABLE --
-- DROP TABLE IF EXISTS public.tenants CASCADE;
CREATE TABLE public.tenants(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	parent uuid,
	type public.tenant_type NOT NULL DEFAULT 'organization'::tenant_type,
	name text NOT NULL,
	enabled boolean NOT NULL DEFAULT true::boolean,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_tenants PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.tenants OWNER TO postgres;
-- ddl-end --

-- object: public.gender | type: TYPE --
-- DROP TYPE IF EXISTS public.gender CASCADE;
CREATE TYPE public.gender AS
 ENUM ('female','male','other');
-- ddl-end --
ALTER TYPE public.gender OWNER TO postgres;
-- ddl-end --

-- object: public.users | type: TABLE --
-- DROP TABLE IF EXISTS public.users CASCADE;
CREATE TABLE public.users(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	email text NOT NULL,
	password text NOT NULL,
	first_name text NOT NULL,
	middle_names text,
	last_name text NOT NULL,
	nickname text,
	profile_image uuid,
	profile_image_metadata jsonb,
	gender public.gender NOT NULL DEFAULT 'male'::gender,
	dob date,
	home_module_menu uuid,
	enabled boolean NOT NULL DEFAULT true::boolean,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_users PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.users OWNER TO postgres;
-- ddl-end --

-- object: uidx_users | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_users CASCADE;
CREATE UNIQUE INDEX uidx_users ON public.users
	USING btree
	(
	  email ASC NULLS LAST
	);
-- ddl-end --

-- object: uidx_tenant_parent_name | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_tenant_parent_name CASCADE;
CREATE UNIQUE INDEX uidx_tenant_parent_name ON public.tenants
	USING btree
	(
	  parent ASC NULLS LAST,
	  name ASC NULLS LAST
	);
-- ddl-end --

-- object: public.tenants_users | type: TABLE --
-- DROP TABLE IF EXISTS public.tenants_users CASCADE;
CREATE TABLE public.tenants_users(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	tenant uuid NOT NULL,
	login uuid NOT NULL,
	job_title uuid,
	location uuid,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_tenants_users PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.tenants_users OWNER TO postgres;
-- ddl-end --

-- object: uidx_tenants_users | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_tenants_users CASCADE;
CREATE UNIQUE INDEX uidx_tenants_users ON public.tenants_users
	USING btree
	(
	  tenant ASC NULLS LAST,
	  login ASC NULLS LAST
	);
-- ddl-end --

-- object: public.tenant_locations | type: TABLE --
-- DROP TABLE IF EXISTS public.tenant_locations CASCADE;
CREATE TABLE public.tenant_locations(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	tenant uuid NOT NULL,
	line1 text NOT NULL,
	line2 text,
	line3 text,
	area text,
	city text NOT NULL,
	state text NOT NULL,
	country text NOT NULL,
	postal_code text NOT NULL,
	latitude double precision NOT NULL,
	longitude double precision NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_locations PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.tenant_locations OWNER TO postgres;
-- ddl-end --

-- object: uidx_locations | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_locations CASCADE;
CREATE UNIQUE INDEX uidx_locations ON public.tenant_locations
	USING btree
	(
	  tenant ASC NULLS LAST,
	  id ASC NULLS LAST
	);
-- ddl-end --

-- object: public.tenant_job_titles | type: TABLE --
-- DROP TABLE IF EXISTS public.tenant_job_titles CASCADE;
CREATE TABLE public.tenant_job_titles(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	tenant uuid NOT NULL,
	title text NOT NULL,
	description text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_job_titles PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.tenant_job_titles OWNER TO postgres;
-- ddl-end --

-- object: uidx_job_titles | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_job_titles CASCADE;
CREATE UNIQUE INDEX uidx_job_titles ON public.tenant_job_titles
	USING btree
	(
	  tenant ASC NULLS LAST,
	  id ASC NULLS LAST
	);
-- ddl-end --

-- object: public.tenant_groups | type: TABLE --
-- DROP TABLE IF EXISTS public.tenant_groups CASCADE;
CREATE TABLE public.tenant_groups(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	parent uuid,
	tenant uuid NOT NULL,
	name text NOT NULL,
	display_name text NOT NULL,
	description text,
	default_for_new_user boolean NOT NULL DEFAULT false::boolean,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT fk_groups PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.tenant_groups OWNER TO postgres;
-- ddl-end --

-- object: uidx_group_parent_name | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_group_parent_name CASCADE;
CREATE UNIQUE INDEX uidx_group_parent_name ON public.tenant_groups
	USING btree
	(
	  parent ASC NULLS LAST,
	  name ASC NULLS LAST
	);
-- ddl-end --

-- object: uidx_group_tenant | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_group_tenant CASCADE;
CREATE UNIQUE INDEX uidx_group_tenant ON public.tenant_groups
	USING btree
	(
	  tenant ASC NULLS LAST,
	  id ASC NULLS LAST
	);
-- ddl-end --

-- object: public.tenants_users_groups | type: TABLE --
-- DROP TABLE IF EXISTS public.tenants_users_groups CASCADE;
CREATE TABLE public.tenants_users_groups(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	tenant uuid NOT NULL,
	tenant_group uuid NOT NULL,
	login uuid NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_tenant_user_groups PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.tenants_users_groups OWNER TO postgres;
-- ddl-end --

-- object: public.module_permissions | type: TABLE --
-- DROP TABLE IF EXISTS public.module_permissions CASCADE;
CREATE TABLE public.module_permissions(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	module uuid NOT NULL,
	name text NOT NULL,
	display_name text NOT NULL,
	description text NOT NULL DEFAULT 'Another Random Permission'::text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_permissions PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.module_permissions OWNER TO postgres;
-- ddl-end --

-- object: public.fn_get_tenant_ancestors | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_get_tenant_ancestors(IN uuid) CASCADE;
CREATE FUNCTION public.fn_get_tenant_ancestors (IN tenantid uuid)
	RETURNS TABLE ( level integer,  id uuid,  parent uuid,  name text,  type public.tenant_type)
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

BEGIN
	RETURN QUERY
	WITH RECURSIVE q AS (
		SELECT
			1 AS level,
			A.id,
			A.parent,
			A.name,
			A.type
		FROM
			tenants A
		WHERE
			A.id = tenantid
		UNION ALL
		SELECT
			q.level + 1,
			B.id,
			B.parent,
			B.name,
			B.type
		FROM
			q,
			tenants B
		WHERE
			B.id = q.parent
	)
	SELECT DISTINCT
		q.level,
		q.id,
		q.parent,
		q.name,
		q.type
	FROM
		q
	ORDER BY
		q.level,
		q.parent;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_get_tenant_ancestors(IN uuid) OWNER TO postgres;
-- ddl-end --

-- object: public.fn_is_tenant_enabled | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_is_tenant_enabled(IN uuid) CASCADE;
CREATE FUNCTION public.fn_is_tenant_enabled (IN tenantid uuid)
	RETURNS boolean
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

DECLARE
	is_disabled	integer;
BEGIN
	SELECT
		COUNT(*)
	FROM
		tenants
	WHERE
		id IN  (SELECT id FROM fn_get_tenant_ancestors(tenantid)) AND
		enabled = false
	INTO
		is_disabled;

	RETURN is_disabled <= 0;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_is_tenant_enabled(IN uuid) OWNER TO postgres;
-- ddl-end --

-- object: public.fn_get_tenant_descendants | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_get_tenant_descendants(IN uuid) CASCADE;
CREATE FUNCTION public.fn_get_tenant_descendants (IN tenantid uuid)
	RETURNS TABLE ( level integer,  id uuid,  parent uuid,  name text,  type public.tenant_type,  enabled boolean)
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

BEGIN
	RETURN QUERY
	WITH RECURSIVE q AS (
		SELECT
			1 AS level,
			A.id,
			A.parent,
			A.name,
			A.type,
			fn_is_tenant_enabled(A.id) AS enabled
		FROM
			tenants A
		WHERE
			A.id = tenantid
		UNION ALL
		SELECT
			q.level + 1,
			B.id,
			B.parent,
			B.name,
			B.type,
			fn_is_tenant_enabled(B.id) AS enabled
		FROM
			q,
			tenants B
		WHERE
			B.parent = q.id
	)
	SELECT DISTINCT
		q.level,
		q.id,
		q.parent,
		q.name,
		q.type,
		q.enabled
	FROM
		q
	ORDER BY
		q.level,
		q.parent;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_get_tenant_descendants(IN uuid) OWNER TO postgres;
-- ddl-end --

-- object: public.fn_check_tenant_upsert_is_valid | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_check_tenant_upsert_is_valid() CASCADE;
CREATE FUNCTION public.fn_check_tenant_upsert_is_valid ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

DECLARE
	is_tenant_in_tree	INTEGER;
BEGIN
	IF NEW.parent IS NULL
	THEN
		RETURN NEW;
	END IF;

	IF NEW.id = NEW.parent
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Tenant cannot be its own parent';
		RETURN NULL;
	END IF;

	/* Check if the tenant is its own ancestor */
	is_tenant_in_tree := 0;
	SELECT
		COUNT(id)
	FROM
		fn_get_tenant_ancestors(NEW.parent)
	WHERE
		id = NEW.id
	INTO
		is_tenant_in_tree;

	IF is_tenant_in_tree > 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Tenant cannot be its own ancestor';
		RETURN NULL;
	END IF;

	/* Check if the tenant is its own descendant */
	is_tenant_in_tree := 0;
	SELECT
		COUNT(id)
	FROM
		fn_get_tenant_descendants(NEW.id)
	WHERE
		id = NEW.id AND
		level > 1
	INTO
		is_tenant_in_tree;

	IF is_tenant_in_tree > 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Tenant cannot be its own descendant';
		RETURN NULL;
	END IF;

	RETURN NEW;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_check_tenant_upsert_is_valid() OWNER TO postgres;
-- ddl-end --

-- object: trigger_check_tenant_upsert_is_valid | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_check_tenant_upsert_is_valid ON public.tenants  ON public.tenants CASCADE;
CREATE TRIGGER trigger_check_tenant_upsert_is_valid
	BEFORE INSERT OR UPDATE
	ON public.tenants
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_check_tenant_upsert_is_valid();
-- ddl-end --

-- object: public.fn_get_group_ancestors | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_get_group_ancestors(IN uuid) CASCADE;
CREATE FUNCTION public.fn_get_group_ancestors (IN groupid uuid)
	RETURNS TABLE ( level integer,  id uuid,  parent uuid,  name text)
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

BEGIN
	RETURN QUERY
	WITH RECURSIVE q AS (
		SELECT
			1 AS level,
			A.id,
			A.parent,
			A.name
		FROM
			tenant_groups A
		WHERE
			A.id = groupid
		UNION ALL
		SELECT
			q.level + 1,
			B.id,
			B.parent,
			B.name
		FROM
			q,
			tenant_groups B
		WHERE
			B.id = q.parent
	)
	SELECT DISTINCT
		q.level,
		q.id,
		q.parent,
		q.name
	FROM
		q
	ORDER BY
		q.level,
		q.parent;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_get_group_ancestors(IN uuid) OWNER TO postgres;
-- ddl-end --

-- object: public.fn_get_group_descendants | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_get_group_descendants(IN uuid) CASCADE;
CREATE FUNCTION public.fn_get_group_descendants (IN groupid uuid)
	RETURNS TABLE ( level integer,  id uuid,  parent uuid,  name text)
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

BEGIN
	RETURN QUERY
	WITH RECURSIVE q AS (
		SELECT
			1 AS level,
			A.id,
			A.parent,
			A.name
		FROM
			tenant_groups A
		WHERE
			A.id = groupid
		UNION ALL
		SELECT
			q.level + 1,
			B.id,
			B.parent,
			B.name
		FROM
			q,
			tenant_groups B
		WHERE
			B.parent = q.id
	)
	SELECT DISTINCT
		q.level,
		q.id,
		q.parent,
		q.name
	FROM
		q
	ORDER BY
		q.level,
		q.parent;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_get_group_descendants(IN uuid) OWNER TO postgres;
-- ddl-end --

-- object: public.fn_check_group_update_is_valid | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_check_group_update_is_valid() CASCADE;
CREATE FUNCTION public.fn_check_group_update_is_valid ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$
BEGIN
	IF OLD.parent <> NEW.parent
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Group cannot change parent';
		RETURN NULL;
	END IF;

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_check_group_update_is_valid() OWNER TO postgres;
-- ddl-end --

-- object: trigger_check_group_update_is_valid | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_check_group_update_is_valid ON public.tenant_groups  ON public.tenant_groups CASCADE;
CREATE TRIGGER trigger_check_group_update_is_valid
	BEFORE UPDATE
	ON public.tenant_groups
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_check_group_update_is_valid();
-- ddl-end --

-- object: public.fn_assign_default_group_to_tenant_user | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_assign_default_group_to_tenant_user() CASCADE;
CREATE FUNCTION public.fn_assign_default_group_to_tenant_user ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

DECLARE
	default_tenant_group	UUID;
BEGIN
	default_tenant_group := NULL;
	SELECT
		id
	FROM
		tenant_groups
	WHERE
		tenant = NEW.tenant AND
		default_for_new_user = true
	INTO
		default_tenant_group;

	IF default_tenant_group IS NULL
	THEN
		RETURN NEW;
	END IF;

	INSERT INTO tenants_users_groups (
		tenant,
		tenant_group,
		login
	)
	VALUES (
		NEW.tenant,
		default_tenant_group,
		NEW.login
	);

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_assign_default_group_to_tenant_user() OWNER TO postgres;
-- ddl-end --

-- object: trigger_assign_default_group_to_tenant_user | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_assign_default_group_to_tenant_user ON public.tenants_users  ON public.tenants_users CASCADE;
CREATE TRIGGER trigger_assign_default_group_to_tenant_user
	AFTER INSERT 
	ON public.tenants_users
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_assign_default_group_to_tenant_user();
-- ddl-end --

-- object: public.fn_remove_group_permission_from_descendants | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_remove_group_permission_from_descendants() CASCADE;
CREATE FUNCTION public.fn_remove_group_permission_from_descendants ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

BEGIN
	DELETE FROM
		tenant_group_permissions
	WHERE
		tenant_group IN (SELECT id FROM fn_get_group_descendants(OLD.tenant_group) WHERE level = 2) AND
		permission = OLD.permission;

	RETURN OLD;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_remove_group_permission_from_descendants() OWNER TO postgres;
-- ddl-end --

-- object: public.user_social_logins | type: TABLE --
-- DROP TABLE IF EXISTS public.user_social_logins CASCADE;
CREATE TABLE public.user_social_logins(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	login uuid NOT NULL,
	provider text NOT NULL,
	provider_uid text NOT NULL,
	display_name text NOT NULL,
	social_data jsonb NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_social_logins PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.user_social_logins OWNER TO postgres;
-- ddl-end --

-- object: uidx_social_logins | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_social_logins CASCADE;
CREATE UNIQUE INDEX uidx_social_logins ON public.user_social_logins
	USING btree
	(
	  provider ASC NULLS LAST,
	  provider_uid ASC NULLS LAST
	);
-- ddl-end --

-- object: public.tenant_group_permissions | type: TABLE --
-- DROP TABLE IF EXISTS public.tenant_group_permissions CASCADE;
CREATE TABLE public.tenant_group_permissions(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	tenant uuid NOT NULL,
	tenant_group uuid NOT NULL,
	module uuid NOT NULL,
	permission uuid NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_group_permissions PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.tenant_group_permissions OWNER TO postgres;
-- ddl-end --

-- object: public.fn_assign_defaults_to_tenant | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_assign_defaults_to_tenant() CASCADE;
CREATE FUNCTION public.fn_assign_defaults_to_tenant ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

BEGIN
	INSERT INTO tenant_groups (
		parent,
		tenant,
		name,
		display_name,
		description
	)
	VALUES (
		NULL,
		NEW.id,
		'administrators'
		NEW.name || 'Administrators',
		'The Administrator Group for ' || NEW.name
	);

	IF NEW.parent IS NOT NULL
	THEN
		INSERT INTO tenants_modules (
			tenant,
			module
		)
		SELECT
			NEW.id,
			id
		FROM
			modules
		WHERE
			admin_only = false AND
			type = 'component';
	END IF;

	IF NEW.parent IS NULL
	THEN
		INSERT INTO tenants_modules (
			tenant,
			module
		)
		SELECT
			NEW.id,
			id
		FROM
			modules
		WHERE
			type = 'component';
	END IF;

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_assign_defaults_to_tenant() OWNER TO postgres;
-- ddl-end --

-- object: trigger_assign_defaults_to_tenant | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_assign_defaults_to_tenant ON public.tenants  ON public.tenants CASCADE;
CREATE TRIGGER trigger_assign_defaults_to_tenant
	AFTER INSERT 
	ON public.tenants
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_assign_defaults_to_tenant();
-- ddl-end --

-- object: public.fn_check_permission_insert_is_valid | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_check_permission_insert_is_valid() CASCADE;
CREATE FUNCTION public.fn_check_permission_insert_is_valid ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

DECLARE
	is_component	INTEGER;
BEGIN
	SELECT
		count(id)
	FROM
		modules
	WHERE
		id = NEW.module AND
		type = 'component'
	INTO
		is_component;

	IF is_component <= 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Permissions can be defined only for components, and not for other types of modules';
		RETURN NULL;
	END IF;

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_check_permission_insert_is_valid() OWNER TO postgres;
-- ddl-end --

-- object: trigger_check_permission_insert_is_valid | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_check_permission_insert_is_valid ON public.module_permissions  ON public.module_permissions CASCADE;
CREATE TRIGGER trigger_check_permission_insert_is_valid
	BEFORE INSERT 
	ON public.module_permissions
	FOR EACH STATEMENT
	EXECUTE PROCEDURE public.fn_check_permission_insert_is_valid();
-- ddl-end --

-- object: public.fn_check_permission_update_is_valid | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_check_permission_update_is_valid() CASCADE;
CREATE FUNCTION public.fn_check_permission_update_is_valid ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

BEGIN
	IF OLD.module <> NEW.module
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Module assigned to a permission is NOT mutable';
		RETURN NULL;
	END IF;

	IF OLD.name <> NEW.name
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Permission name is NOT mutable';
		RETURN NULL;
	END IF;

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_check_permission_update_is_valid() OWNER TO postgres;
-- ddl-end --

-- object: trigger_check_permission_update_is_valid | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_check_permission_update_is_valid ON public.module_permissions  ON public.module_permissions CASCADE;
CREATE TRIGGER trigger_check_permission_update_is_valid
	BEFORE UPDATE
	ON public.module_permissions
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_check_permission_update_is_valid();
-- ddl-end --

-- object: public.tenants_modules | type: TABLE --
-- DROP TABLE IF EXISTS public.tenants_modules CASCADE;
CREATE TABLE public.tenants_modules(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	tenant uuid NOT NULL,
	module uuid NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_tenant_modules PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.tenants_modules OWNER TO postgres;
-- ddl-end --

-- object: public.fn_check_tenant_module_upsert_is_valid | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_check_tenant_module_upsert_is_valid() CASCADE;
CREATE FUNCTION public.fn_check_tenant_module_upsert_is_valid ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

DECLARE
	is_component	INTEGER;
	is_admin_only	BOOLEAN;
	component_parent	UUID;
	tenant_parent	UUID;
BEGIN
	is_component := 0;
	SELECT
		count(id)
	FROM
		modules
	WHERE
		id = NEW.module AND
		type = 'component'
	INTO
		is_component;

	IF is_component <= 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Only components can be mapped to tenants';
		RETURN NULL;
	END IF;

	component_parent := NULL;
	SELECT
		parent
	FROM
		modules
	WHERE
		id = NEW.module
	INTO
		component_parent;

	IF component_parent IS NOT NULL
	THEN
		is_component := 0;
		SELECT
			count(id)
		FROM
			tenants_modules
		WHERE
			tenant = NEW.tenant AND
			module = component_parent
		INTO
			is_component;

		IF is_component = 0
		THEN
			RAISE SQLSTATE '2F003' USING MESSAGE = 'Parent component not mapped to this Tenant';
			RETURN NULL;
		END IF;
	END IF;

	is_admin_only := false;
	SELECT
		admin_only
	FROM
		modules
	WHERE
		id = NEW.module
	INTO
		is_admin_only;

	IF is_admin_only = false
	THEN
		RETURN NEW;
	END IF;

	tenant_parent := NULL;
	SELECT
		parent
	FROM
		tenants
	WHERE
		id = NEW.tenant
	INTO
		tenant_parent;

	IF tenant_parent IS NOT NULL
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Admin only components can be mapped only to root tenant';
		RETURN NULL;
	END IF;

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_check_tenant_module_upsert_is_valid() OWNER TO postgres;
-- ddl-end --

-- object: trigger_check_tenant_module_upsert_is_valid | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_check_tenant_module_upsert_is_valid ON public.tenants_modules  ON public.tenants_modules CASCADE;
CREATE TRIGGER trigger_check_tenant_module_upsert_is_valid
	BEFORE INSERT OR UPDATE
	ON public.tenants_modules
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_check_tenant_module_upsert_is_valid();
-- ddl-end --

-- object: trigger_notify_config_change | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_notify_config_change ON public.modules  ON public.modules CASCADE;
CREATE TRIGGER trigger_notify_config_change
	AFTER UPDATE
	ON public.modules
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_notify_config_change();
-- ddl-end --

-- object: trigger_check_module_upsert_is_valid | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_check_module_upsert_is_valid ON public.modules  ON public.modules CASCADE;
CREATE TRIGGER trigger_check_module_upsert_is_valid
	BEFORE INSERT OR UPDATE
	ON public.modules
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_check_module_upsert_is_valid();
-- ddl-end --

-- object: trigger_assign_module_to_tenant | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_assign_module_to_tenant ON public.modules  ON public.modules CASCADE;
CREATE TRIGGER trigger_assign_module_to_tenant
	AFTER INSERT 
	ON public.modules
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_assign_module_to_tenant();
-- ddl-end --

-- object: uidx_module_parent_name | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_module_parent_name CASCADE;
CREATE UNIQUE INDEX uidx_module_parent_name ON public.modules
	USING btree
	(
	  parent ASC NULLS LAST,
	  name ASC NULLS LAST
	);
-- ddl-end --

-- object: uidx_permissions | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_permissions CASCADE;
CREATE UNIQUE INDEX uidx_permissions ON public.module_permissions
	USING btree
	(
	  module ASC NULLS LAST,
	  name ASC NULLS LAST
	);
-- ddl-end --

-- object: trigger_remove_group_permission_from_descendants | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_remove_group_permission_from_descendants ON public.tenant_group_permissions  ON public.tenant_group_permissions CASCADE;
CREATE TRIGGER trigger_remove_group_permission_from_descendants
	BEFORE DELETE 
	ON public.tenant_group_permissions
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_remove_group_permission_from_descendants();
-- ddl-end --

-- object: uidx_tenant_modules | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_tenant_modules CASCADE;
CREATE UNIQUE INDEX uidx_tenant_modules ON public.tenants_modules
	USING btree
	(
	  tenant ASC NULLS LAST,
	  module ASC NULLS LAST
	);
-- ddl-end --

-- object: uidx_permissions_modules | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_permissions_modules CASCADE;
CREATE UNIQUE INDEX uidx_permissions_modules ON public.module_permissions
	USING btree
	(
	  module ASC NULLS LAST,
	  id ASC NULLS LAST
	);
-- ddl-end --

-- object: public.fn_assign_permission_to_tenant_group | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_assign_permission_to_tenant_group() CASCADE;
CREATE FUNCTION public.fn_assign_permission_to_tenant_group ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

DECLARE
	tenant_root_tenant_group	UUID;
BEGIN
	tenant_root_tenant_group := NULL;
	SELECT
		id
	FROM
		tenant_groups
	WHERE
		tenant = NEW.tenant AND
		parent IS NULL
	INTO
		tenant_root_tenant_group;

	IF tenant_root_tenant_group IS NULL
	THEN
		RETURN NEW;
	END IF;

	INSERT INTO tenant_group_permissions(
		tenant,
		tenant_group,
		module,
		permission
	)
	SELECT
		NEW.tenant,
		tenant_root_tenant_group,
		module,
		id
	FROM
		permissions
	WHERE
		module = NEW.module;

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_assign_permission_to_tenant_group() OWNER TO postgres;
-- ddl-end --

-- object: trigger_assign_permission_to_tenant_group | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_assign_permission_to_tenant_group ON public.tenants_modules  ON public.tenants_modules CASCADE;
CREATE TRIGGER trigger_assign_permission_to_tenant_group
	AFTER INSERT OR UPDATE
	ON public.tenants_modules
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_assign_permission_to_tenant_group();
-- ddl-end --

-- object: uidx_group_permissions | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_group_permissions CASCADE;
CREATE UNIQUE INDEX uidx_group_permissions ON public.tenant_group_permissions
	USING btree
	(
	  tenant_group ASC NULLS LAST,
	  permission ASC NULLS LAST
	);
-- ddl-end --

-- object: public.fn_assign_permission_to_tenants | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_assign_permission_to_tenants() CASCADE;
CREATE FUNCTION public.fn_assign_permission_to_tenants ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$
BEGIN
	INSERT INTO tenant_group_permissions (
		tenant,
		tenant_group,
		module,
		permission
	)
	SELECT
		A.tenant,
		B.id,
		A.module,
		NEW.id
	FROM
		tenants_modules A
		INNER JOIN tenant_groups B ON (A.tenant = B.tenant AND B.parent IS NULL)
	WHERE
		module = NEW.module;

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_assign_permission_to_tenants() OWNER TO postgres;
-- ddl-end --

-- object: trigger_assign_permission_to_tenants | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_assign_permission_to_tenants ON public.module_permissions  ON public.module_permissions CASCADE;
CREATE TRIGGER trigger_assign_permission_to_tenants
	AFTER INSERT 
	ON public.module_permissions
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_assign_permission_to_tenants();
-- ddl-end --

-- object: uidx_tenant_user_groups | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_tenant_user_groups CASCADE;
CREATE UNIQUE INDEX uidx_tenant_user_groups ON public.tenants_users_groups
	USING btree
	(
	  tenant ASC NULLS LAST,
	  tenant_group ASC NULLS LAST,
	  login ASC NULLS LAST
	);
-- ddl-end --

-- object: public.fn_remove_descendant_group_from_tenant_user | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_remove_descendant_group_from_tenant_user() CASCADE;
CREATE FUNCTION public.fn_remove_descendant_group_from_tenant_user ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$
BEGIN
	DELETE FROM
		tenants_users_groups
	WHERE
		tenant = NEW.tenant AND
		tenant_group IN (SELECT id FROM fn_get_group_descendants(NEW.tenant_group) WHERE level > 1) AND
		login = NEW.login;

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_remove_descendant_group_from_tenant_user() OWNER TO postgres;
-- ddl-end --

-- object: trigger_remove_descendant_group_from_tenant_user | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_remove_descendant_group_from_tenant_user ON public.tenants_users_groups  ON public.tenants_users_groups CASCADE;
CREATE TRIGGER trigger_remove_descendant_group_from_tenant_user
	AFTER INSERT OR UPDATE
	ON public.tenants_users_groups
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_remove_descendant_group_from_tenant_user();
-- ddl-end --

-- object: public.fn_check_group_permission_insert_is_valid | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_check_group_permission_insert_is_valid() CASCADE;
CREATE FUNCTION public.fn_check_group_permission_insert_is_valid ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$
DECLARE
	parent_tenant_group			UUID;
	does_parent_group_have_permission	INTEGER;
BEGIN
	parent_tenant_group := NULL;
	SELECT
		parent
	FROM
		tenant_groups
	WHERE
		id = NEW.tenant_group
	INTO
		parent_tenant_group;

	IF parent_tenant_group IS NULL
	THEN
		RETURN NEW;
	END IF;

	does_parent_group_have_permission := 0;
	SELECT
		count(id)
	FROM
		tenant_group_permissions
	WHERE
		tenant_group = parent_tenant_group AND
		permission = NEW.permission
	INTO
		does_parent_group_have_permission;

	IF does_parent_group_have_permission > 0
	THEN
		RETURN NEW;
	END IF;

	RAISE SQLSTATE '2F003' USING MESSAGE = 'Parent Group does not have this permission';
	RETURN NULL;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_check_group_permission_insert_is_valid() OWNER TO postgres;
-- ddl-end --

-- object: trigger_check_group_permission_insert_is_valid | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_check_group_permission_insert_is_valid ON public.tenant_group_permissions  ON public.tenant_group_permissions CASCADE;
CREATE TRIGGER trigger_check_group_permission_insert_is_valid
	BEFORE INSERT OR UPDATE
	ON public.tenant_group_permissions
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_check_group_permission_insert_is_valid();
-- ddl-end --

-- object: public.fn_check_tenant_user_group_upsert_is_valid | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_check_tenant_user_group_upsert_is_valid() CASCADE;
CREATE FUNCTION public.fn_check_tenant_user_group_upsert_is_valid ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$
DECLARE
	is_member_of_ancestor_group	INTEGER;
BEGIN
	is_member_of_ancestor_group := 0;
	SELECT
		count(id)
	FROM
		tenants_users_groups
	WHERE
		tenant = NEW.tenant AND
		tenant_group IN (SELECT id FROM fn_get_group_ancestors(NEW.tenant_group) WHERE level > 1) AND
		login = NEW.login
	INTO
		is_member_of_ancestor_group;

	IF is_member_of_ancestor_group = 0
	THEN
		RETURN NEW;
	END IF;

	RAISE SQLSTATE '2F003' USING MESSAGE = 'User is already a member of a Parent Group';
	RETURN NULL;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_check_tenant_user_group_upsert_is_valid() OWNER TO postgres;
-- ddl-end --

-- object: trigger_check_tenant_user_group_upsert_is_valid | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_check_tenant_user_group_upsert_is_valid ON public.tenants_users_groups  ON public.tenants_users_groups CASCADE;
CREATE TRIGGER trigger_check_tenant_user_group_upsert_is_valid
	BEFORE INSERT OR UPDATE
	ON public.tenants_users_groups
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_check_tenant_user_group_upsert_is_valid();
-- ddl-end --

-- object: public.media_type | type: TYPE --
-- DROP TYPE IF EXISTS public.media_type CASCADE;
CREATE TYPE public.media_type AS
 ENUM ('all','desktop','tablet','mobile','other');
-- ddl-end --
ALTER TYPE public.media_type OWNER TO postgres;
-- ddl-end --

-- object: public.fn_check_module_menu_upsert_is_valid | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_check_module_menu_upsert_is_valid() CASCADE;
CREATE FUNCTION public.fn_check_module_menu_upsert_is_valid ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$
DECLARE
	is_component		INTEGER;
	is_permission_ok		INTEGER;
	is_module_menu_in_tree	INTEGER;
BEGIN
	is_component := 0;
	SELECT
		count(id)
	FROM
		modules
	WHERE
		id = NEW.module AND
		type = 'component'
	INTO
		is_component;

	IF is_component <= 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Menus can be assigned only to Components';
		RETURN NULL;
	END IF;

	is_permission_ok := 0;
	SELECT
		count(id)
	FROM
		module_permissions
	WHERE
		module IN (SELECT id FROM fn_get_module_ancestors(NEW.module)) AND
		id = NEW.permission
	INTO
		is_permission_ok;

	IF is_permission_ok <= 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Menus must use Permissions defined by the Component or one of its parents';
		RETURN NULL;
	END IF;

	IF NEW.parent IS NULL
	THEN
		RETURN NEW;
	END IF;

	IF NEW.id = NEW.parent
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Menu cannot be its own parent';
		RETURN NULL;
	END IF;

	/* Check if the module is its own ancestor */
	is_module_in_tree := 0;
	SELECT
		COUNT(id)
	FROM
		fn_get_module_menu_ancestors(NEW.parent)
	WHERE
		id = NEW.id
	INTO
		is_module_menu_in_tree;

	IF is_module_menu_in_tree > 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Menu cannot be its own ancestor';
		RETURN NULL;
	END IF;

	/* Check if the module is its own descendant */
	is_module_menu_in_tree := 0;
	SELECT
		COUNT(id)
	FROM
		fn_get_module_menu_descendants(NEW.id)
	WHERE
		id = NEW.id AND
		level > 1
	INTO
		is_module_menu_in_tree;

	IF is_module_menu_in_tree > 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Menu cannot be its own descendant';
		RETURN NULL;
	END IF;

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_check_module_menu_upsert_is_valid() OWNER TO postgres;
-- ddl-end --

-- object: public.module_widgets | type: TABLE --
-- DROP TABLE IF EXISTS public.module_widgets CASCADE;
CREATE TABLE public.module_widgets(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	module uuid NOT NULL,
	permission uuid NOT NULL,
	ember_component text NOT NULL,
	display_name text NOT NULL,
	description text,
	media public.media_type[] NOT NULL DEFAULT '{all}',
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_module_widgets PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.module_widgets OWNER TO postgres;
-- ddl-end --

-- object: uidx_module_widgets | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_module_widgets CASCADE;
CREATE UNIQUE INDEX uidx_module_widgets ON public.module_widgets
	USING btree
	(
	  ember_component ASC NULLS LAST
	);
-- ddl-end --

-- object: public.fn_check_module_widget_upsert_is_valid | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_check_module_widget_upsert_is_valid() CASCADE;
CREATE FUNCTION public.fn_check_module_widget_upsert_is_valid ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$
DECLARE
	is_component	INTEGER;
	is_permission_ok	INTEGER;
BEGIN
	is_component := 0;
	SELECT
		count(id)
	FROM
		modules
	WHERE
		id = NEW.module AND
		type = 'component'
	INTO
		is_component;

	IF is_component <= 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Widgets can be assigned only to Components';
		RETURN NULL;
	END IF;

	is_permission_ok := 0;
	SELECT
		count(id)
	FROM
		module_permissions
	WHERE
		module IN (SELECT id FROM fn_get_module_ancestors(NEW.module)) AND
		id = NEW.permission
	INTO
		is_permission_ok;

	IF is_permission_ok <= 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Widgets must use Permissions defined by the Component or one of its parents';
		RETURN NULL;
	END IF;

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_check_module_widget_upsert_is_valid() OWNER TO postgres;
-- ddl-end --

-- object: public.fn_get_module_menu_ancestors | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_get_module_menu_ancestors(IN uuid) CASCADE;
CREATE FUNCTION public.fn_get_module_menu_ancestors (IN menuid uuid)
	RETURNS TABLE ( level integer,  id uuid,  parent uuid,  ember_route text)
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

BEGIN
	RETURN QUERY
	WITH RECURSIVE q AS (
		SELECT
			1 AS level,
			A.id,
			A.parent,
			A.ember_route
		FROM
			module_menus A
		WHERE
			A.id = menuid
		UNION ALL
		SELECT
			q.level + 1,
			B.id,
			B.parent,
			B.ember_route
		FROM
			q,
			module_menus B
		WHERE
			B.id = q.parent
	)
	SELECT DISTINCT
		q.level,
		q.id,
		q.parent,
		q.ember_route
	FROM
		q
	ORDER BY
		q.level,
		q.parent;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_get_module_menu_ancestors(IN uuid) OWNER TO postgres;
-- ddl-end --

-- object: public.fn_get_module_menu_descendants | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_get_module_menu_descendants() CASCADE;
CREATE FUNCTION public.fn_get_module_menu_descendants ()
	RETURNS TABLE ( level integer,  id uuid,  parent uuid,  ember_route text)
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

BEGIN
	RETURN QUERY
	WITH RECURSIVE q AS (
		SELECT
			1 AS level,
			A.id,
			A.parent,
			A.ember_route
		FROM
			module_menus A
		WHERE
			A.id = menuid
		UNION ALL
		SELECT
			q.level + 1,
			B.id,
			B.parent,
			B.ember_route
		FROM
			q,
			module_menus B
		WHERE
			B.parent = q.id
	)
	SELECT DISTINCT
		q.level,
		q.id,
		q.parent,
		q.ember_route
	FROM
		q
	ORDER BY
		q.level,
		q.parent;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_get_module_menu_descendants() OWNER TO postgres;
-- ddl-end --

-- object: public.module_menus | type: TABLE --
-- DROP TABLE IF EXISTS public.module_menus CASCADE;
CREATE TABLE public.module_menus(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	parent uuid,
	module uuid NOT NULL,
	permission uuid NOT NULL,
	category text NOT NULL DEFAULT 'Components',
	ember_route text NOT NULL,
	icon_class text NOT NULL,
	display_name text NOT NULL,
	description text,
	media public.media_type[] NOT NULL DEFAULT '{all}',
	tooltip text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_module_menus PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.module_menus OWNER TO postgres;
-- ddl-end --

-- object: public.module_templates | type: TABLE --
-- DROP TABLE IF EXISTS public.module_templates CASCADE;
CREATE TABLE public.module_templates(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	module uuid NOT NULL,
	permission uuid NOT NULL,
	name text NOT NULL,
	description text,
	media public.media_type[] NOT NULL DEFAULT '{all}',
	is_default boolean NOT NULL DEFAULT false::boolean,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
	configuration_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_module_templates PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.module_templates OWNER TO postgres;
-- ddl-end --

-- object: uidx_module_templates | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_module_templates CASCADE;
CREATE UNIQUE INDEX uidx_module_templates ON public.module_templates
	USING btree
	(
	  module ASC NULLS LAST,
	  name ASC NULLS LAST
	);
-- ddl-end --

-- object: public.fn_get_user_permissions | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_get_user_permissions(IN uuid) CASCADE;
CREATE FUNCTION public.fn_get_user_permissions (IN userid uuid)
	RETURNS TABLE ( tenant uuid,  permission uuid)
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$
BEGIN
	RETURN QUERY
	SELECT DISTINCT
		A.tenant,
		A.permission
	FROM
		tenant_group_permissions A
	WHERE
		A.tenant_group IN (SELECT tenant_group FROM tenants_users_groups WHERE login = userid);
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_get_user_permissions(IN uuid) OWNER TO postgres;
-- ddl-end --

-- object: public.fn_check_user_upsert_is_valid | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_check_user_upsert_is_valid() CASCADE;
CREATE FUNCTION public.fn_check_user_upsert_is_valid ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$
DECLARE
	is_valid_home_route INTEGER;
BEGIN
	IF NEW.home_route IS NULL
	THEN
		RETURN NEW;
	END IF;

	is_valid_home_route := 0;
	SELECT
		count(id)
	FROM
		module_menus
	WHERE
		id = NEW.home_route AND
		permission IN (SELECT DISTINCT permission FROM fn_get_user_permissions(NEW.id))
	INTO
		is_valid_home_route;

	IF is_valid_home_route <= 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'User does not have permissions for chosen Home Menu';
		RETURN NULL;
	END IF;

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_check_user_upsert_is_valid() OWNER TO postgres;
-- ddl-end --

-- object: public.module_template_positions | type: TABLE --
-- DROP TABLE IF EXISTS public.module_template_positions CASCADE;
CREATE TABLE public.module_template_positions(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	template uuid NOT NULL,
	name text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_template_positions PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.module_template_positions OWNER TO postgres;
-- ddl-end --

-- object: public.module_widget_module_template_positions | type: TABLE --
-- DROP TABLE IF EXISTS public.module_widget_module_template_positions CASCADE;
CREATE TABLE public.module_widget_module_template_positions(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	template_position uuid NOT NULL,
	module_widget uuid NOT NULL,
	display_order integer NOT NULL DEFAULT 1,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_widget_template_position PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.module_widget_module_template_positions OWNER TO postgres;
-- ddl-end --

-- object: public.fn_check_widget_template_position_upsert_is_valid | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_check_widget_template_position_upsert_is_valid() CASCADE;
CREATE FUNCTION public.fn_check_widget_template_position_upsert_is_valid ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$
DECLARE
	template_module 		UUID;
	template_module_parent	UUID;
	widget_module		UUID;
	is_child_component		INTEGER;
BEGIN
	template_module := NULL;
	template_module_parent := NULL;
	widget_module := NULL;
	is_child_component := 0;


	SELECT
		id,
		parent
	FROM
		modules
	WHERE
		id = (SELECT module FROM module_templates WHERE id = (SELECT template FROM module_template_positions WHERE id = NEW.template_position))
	INTO
		template_module,
		template_module_parent;

	SELECT
		module
	FROM
		module_widgets
	WHERE
		id = NEW.module_widget
	INTO
		widget_module;

	IF template_module_parent IS NOT NULL
	THEN
		SELECT
			count(A.id)
		FROM
			(SELECT id FROM fn_get_module_descendants(template_module_parent) WHERE level = 2) A
		WHERE
			A.id = widget_module
		INTO
			is_child_component;

		IF is_child_component > 0
		THEN
			RETURN NEW;
		END IF;
	END IF;

	is_child_component :- 0;
	SELECT
		count(A.id)
	FROM
		(SELECT id FROM fn_get_module_descendants(template_module) WHERE level <= 2) A
	WHERE
		A.id = widget_module
	INTO
		is_child_component;

	IF is_child_component <= 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Only widgets belonging to the same component or one of its children or a sibling can be assigned to a components template';
		RETURN NULL;
	END IF;

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_check_widget_template_position_upsert_is_valid() OWNER TO postgres;
-- ddl-end --

-- object: uidx_widget_template_position | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_widget_template_position CASCADE;
CREATE UNIQUE INDEX uidx_widget_template_position ON public.module_widget_module_template_positions
	USING btree
	(
	  template_position ASC NULLS LAST,
	  module_widget ASC NULLS LAST
	);
-- ddl-end --

-- object: trigger_check_widget_template_position_upsert_is_valid | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_check_widget_template_position_upsert_is_valid ON public.module_widget_module_template_positions  ON public.module_widget_module_template_positions CASCADE;
CREATE TRIGGER trigger_check_widget_template_position_upsert_is_valid
	BEFORE INSERT OR UPDATE
	ON public.module_widget_module_template_positions
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_check_widget_template_position_upsert_is_valid();
-- ddl-end --

-- object: trigger_check_module_widget_upsert_is_valid | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_check_module_widget_upsert_is_valid ON public.module_widgets  ON public.module_widgets CASCADE;
CREATE TRIGGER trigger_check_module_widget_upsert_is_valid
	BEFORE INSERT OR UPDATE
	ON public.module_widgets
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_check_module_widget_upsert_is_valid();
-- ddl-end --

-- object: trigger_check_user_upsert_is_valid | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_check_user_upsert_is_valid ON public.users  ON public.users CASCADE;
CREATE TRIGGER trigger_check_user_upsert_is_valid
	BEFORE INSERT OR UPDATE
	ON public.users
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_check_user_upsert_is_valid();
-- ddl-end --

-- object: public.fn_check_module_template_upsert_is_valid | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_check_module_template_upsert_is_valid() CASCADE;
CREATE FUNCTION public.fn_check_module_template_upsert_is_valid ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$
DECLARE
	is_component	INTEGER;
	is_permission_ok	INTEGER;
BEGIN
	is_component := 0;
	SELECT
		count(id)
	FROM
		modules
	WHERE
		id = NEW.module AND
		type = 'component'
	INTO
		is_component;

	IF is_component <= 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Templates can be assigned only to Components';
		RETURN NULL;
	END IF;

	is_permission_ok := 0;
	SELECT
		count(id)
	FROM
		module_permissions
	WHERE
		module IN (SELECT id FROM fn_get_module_ancestors(NEW.module)) AND
		id = NEW.permission
	INTO
		is_permission_ok;

	IF is_permission_ok <= 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Templates must use Permissions defined by the Component or one of its parents';
		RETURN NULL;
	END IF;

	RETURN NEW;

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_check_module_template_upsert_is_valid() OWNER TO postgres;
-- ddl-end --

-- object: trigger_check_module_template_upsert_is_valid | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_check_module_template_upsert_is_valid ON public.module_templates  ON public.module_templates CASCADE;
CREATE TRIGGER trigger_check_module_template_upsert_is_valid
	BEFORE INSERT OR UPDATE
	ON public.module_templates
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_check_module_template_upsert_is_valid();
-- ddl-end --

-- object: public.contact_type | type: TYPE --
-- DROP TYPE IF EXISTS public.contact_type CASCADE;
CREATE TYPE public.contact_type AS
 ENUM ('email','landline','mobile','other');
-- ddl-end --
ALTER TYPE public.contact_type OWNER TO postgres;
-- ddl-end --

-- object: public.user_contacts | type: TABLE --
-- DROP TABLE IF EXISTS public.user_contacts CASCADE;
CREATE TABLE public.user_contacts(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	login uuid NOT NULL,
	contact text NOT NULL,
	type public.contact_type NOT NULL DEFAULT 'other'::contact_type,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_contacts PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.user_contacts OWNER TO postgres;
-- ddl-end --

-- object: public.user_emergency_contacts | type: TABLE --
-- DROP TABLE IF EXISTS public.user_emergency_contacts CASCADE;
CREATE TABLE public.user_emergency_contacts(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	login uuid NOT NULL,
	contact uuid NOT NULL,
	relationship text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_user_emergency_contacts PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.user_emergency_contacts OWNER TO postgres;
-- ddl-end --

-- object: uidx_user_emergency_contacts | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_user_emergency_contacts CASCADE;
CREATE UNIQUE INDEX uidx_user_emergency_contacts ON public.user_emergency_contacts
	USING btree
	(
	  login ASC NULLS LAST,
	  contact ASC NULLS LAST
	);
-- ddl-end --

-- object: public.publish_status | type: TYPE --
-- DROP TYPE IF EXISTS public.publish_status CASCADE;
CREATE TYPE public.publish_status AS
 ENUM ('draft','published');
-- ddl-end --
ALTER TYPE public.publish_status OWNER TO postgres;
-- ddl-end --

-- object: public.pages | type: TABLE --
-- DROP TABLE IF EXISTS public.pages CASCADE;
CREATE TABLE public.pages(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	author uuid NOT NULL,
	title text NOT NULL,
	content text,
	status public.publish_status NOT NULL DEFAULT 'draft'::publish_status,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_pages PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.pages OWNER TO postgres;
-- ddl-end --

-- object: public.menu_type | type: TYPE --
-- DROP TYPE IF EXISTS public.menu_type CASCADE;
CREATE TYPE public.menu_type AS
 ENUM ('horizontal','vertical');
-- ddl-end --
ALTER TYPE public.menu_type OWNER TO postgres;
-- ddl-end --

-- object: public.menus | type: TABLE --
-- DROP TABLE IF EXISTS public.menus CASCADE;
CREATE TABLE public.menus(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	name text NOT NULL,
	type public.menu_type NOT NULL DEFAULT 'horizontal'::menu_type,
	status public.publish_status NOT NULL DEFAULT 'draft'::publish_status,
	module_widget uuid NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_menus PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.menus OWNER TO postgres;
-- ddl-end --

-- object: public.menu_items | type: TABLE --
-- DROP TABLE IF EXISTS public.menu_items CASCADE;
CREATE TABLE public.menu_items(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	menu uuid NOT NULL,
	parent uuid,
	module_menu uuid,
	icon_class text,
	display_name text,
	display_order integer NOT NULL DEFAULT 1,
	description text,
	tooltip text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_menu_items PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.menu_items OWNER TO postgres;
-- ddl-end --

-- object: public.fn_get_menu_item_ancestors | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_get_menu_item_ancestors(IN uuid) CASCADE;
CREATE FUNCTION public.fn_get_menu_item_ancestors (IN menuitemid uuid)
	RETURNS TABLE ( level integer,  id uuid,  parent uuid,  module_menu uuid,  icon_class text,  display_name text,  tooltip text)
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

BEGIN
	RETURN QUERY
	WITH RECURSIVE q AS (
		SELECT
			1 AS level,
			A.id,
			A.parent,
			A.module_menu,
			A.icon_class,
			A.display_name,
			A.tooltip
		FROM
			menu_items A
		WHERE
			A.id = menuitemid
		UNION ALL
		SELECT
			q.level + 1,
			B.id,
			B.parent,
			B.module_menu,
			B.icon_class,
			B.display_name,
			B.tooltip
		FROM
			q,
			menu_items B
		WHERE
			B.id = q.parent
	)
	SELECT DISTINCT
		q.level,
		q.id,
		q.parent,
		q.module_menu,
		q.icon_class,
		q.display_name,
		q.tooltip
	FROM
		q
	ORDER BY
		q.level,
		q.parent;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_get_menu_item_ancestors(IN uuid) OWNER TO postgres;
-- ddl-end --

-- object: public.fn_get_menu_item_descendants | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_get_menu_item_descendants(IN uuid) CASCADE;
CREATE FUNCTION public.fn_get_menu_item_descendants (IN menuitemid uuid)
	RETURNS TABLE ( level integer,  id uuid,  parent uuid,  module_menu uuid,  icon_class text,  display_name text,  tooltip text)
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

BEGIN
	RETURN QUERY
	WITH RECURSIVE q AS (
		SELECT
			1 AS level,
			A.id,
			A.parent,
			A.module_menu,
			A.icon_class,
			A.display_name,
			A.tooltip
		FROM
			menu_items A
		WHERE
			A.id = menuitemid
		UNION ALL
		SELECT
			q.level + 1,
			B.id,
			B.parent,
			B.module_menu,
			B.icon_class,
			B.display_name,
			B.tooltip
		FROM
			q,
			menu_items B
		WHERE
			B.parent = q.id
	)
	SELECT DISTINCT
		q.level,
		q.id,
		q.parent,
		q.module_menu,
		q.icon_class,
		q.display_name,
		q.tooltip
	FROM
		q
	ORDER BY
		q.level,
		q.parent;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_get_menu_item_descendants(IN uuid) OWNER TO postgres;
-- ddl-end --

-- object: public.fn_check_menu_item_upsert_is_valid | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_check_menu_item_upsert_is_valid() CASCADE;
CREATE FUNCTION public.fn_check_menu_item_upsert_is_valid ()
	RETURNS trigger
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$

DECLARE
	is_menu_item_in_tree	INTEGER;
BEGIN
	IF NEW.parent IS NULL
	THEN
		RETURN NEW;
	END IF;

	IF NEW.id = NEW.parent
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Menu Item cannot be its own parent';
		RETURN NULL;
	END IF;

	/* Check if the menu item is its own ancestor */
	is_menu_item_in_tree := 0;
	SELECT
		COUNT(id)
	FROM
		fn_get_menu_item_ancestors(NEW.parent)
	WHERE
		id = NEW.id
	INTO
		is_menu_item_in_tree;

	IF is_menu_item_in_tree > 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Menu Item cannot be its own ancestor';
		RETURN NULL;
	END IF;

	/* Check if the menu item is its own descendant */
	is_menu_item_in_tree := 0;
	SELECT
		COUNT(id)
	FROM
		fn_get_menu_item_descendants(NEW.id)
	WHERE
		id = NEW.id AND
		level > 1
	INTO
		is_menu_item_in_tree;

	IF is_menu_item_in_tree > 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Menu Item cannot be its own descendant';
		RETURN NULL;
	END IF;

	RETURN NEW;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_check_menu_item_upsert_is_valid() OWNER TO postgres;
-- ddl-end --

-- object: trigger_check_menu_item_upsert_is_valid | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_check_menu_item_upsert_is_valid ON public.menu_items  ON public.menu_items CASCADE;
CREATE TRIGGER trigger_check_menu_item_upsert_is_valid
	BEFORE INSERT OR UPDATE
	ON public.menu_items
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_check_menu_item_upsert_is_valid();
-- ddl-end --

-- object: trigger_check_module_menu_upsert_is_valid | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_check_module_menu_upsert_is_valid ON public.module_menus  ON public.module_menus CASCADE;
CREATE TRIGGER trigger_check_module_menu_upsert_is_valid
	BEFORE INSERT OR UPDATE
	ON public.module_menus
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_check_module_menu_upsert_is_valid();
-- ddl-end --

-- object: uidx_module_menus_module_route | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_module_menus_module_route CASCADE;
CREATE UNIQUE INDEX uidx_module_menus_module_route ON public.module_menus
	USING btree
	(
	  ember_route ASC NULLS LAST
	);
-- ddl-end --

-- object: uidx_module_menus_module_name | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_module_menus_module_name CASCADE;
CREATE UNIQUE INDEX uidx_module_menus_module_name ON public.module_menus
	USING btree
	(
	  module ASC NULLS LAST,
	  display_name ASC NULLS LAST
	);
-- ddl-end --

-- object: fk_modules_modules | type: CONSTRAINT --
-- ALTER TABLE public.modules DROP CONSTRAINT IF EXISTS fk_modules_modules CASCADE;
ALTER TABLE public.modules ADD CONSTRAINT fk_modules_modules FOREIGN KEY (parent)
REFERENCES public.modules (id) MATCH FULL
ON DELETE NO ACTION ON UPDATE NO ACTION;
-- ddl-end --

-- object: fk_tenant_parent | type: CONSTRAINT --
-- ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS fk_tenant_parent CASCADE;
ALTER TABLE public.tenants ADD CONSTRAINT fk_tenant_parent FOREIGN KEY (parent)
REFERENCES public.tenants (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_tenants_users_users | type: CONSTRAINT --
-- ALTER TABLE public.tenants_users DROP CONSTRAINT IF EXISTS fk_tenants_users_users CASCADE;
ALTER TABLE public.tenants_users ADD CONSTRAINT fk_tenants_users_users FOREIGN KEY (login)
REFERENCES public.users (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_tenants_users_tenants | type: CONSTRAINT --
-- ALTER TABLE public.tenants_users DROP CONSTRAINT IF EXISTS fk_tenants_users_tenants CASCADE;
ALTER TABLE public.tenants_users ADD CONSTRAINT fk_tenants_users_tenants FOREIGN KEY (tenant)
REFERENCES public.tenants (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_tenants_users_locations | type: CONSTRAINT --
-- ALTER TABLE public.tenants_users DROP CONSTRAINT IF EXISTS fk_tenants_users_locations CASCADE;
ALTER TABLE public.tenants_users ADD CONSTRAINT fk_tenants_users_locations FOREIGN KEY (tenant,location)
REFERENCES public.tenant_locations (tenant,id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_tenants_users_job_titles | type: CONSTRAINT --
-- ALTER TABLE public.tenants_users DROP CONSTRAINT IF EXISTS fk_tenants_users_job_titles CASCADE;
ALTER TABLE public.tenants_users ADD CONSTRAINT fk_tenants_users_job_titles FOREIGN KEY (tenant,job_title)
REFERENCES public.tenant_job_titles (id,tenant) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_locations_tenants | type: CONSTRAINT --
-- ALTER TABLE public.tenant_locations DROP CONSTRAINT IF EXISTS fk_locations_tenants CASCADE;
ALTER TABLE public.tenant_locations ADD CONSTRAINT fk_locations_tenants FOREIGN KEY (tenant)
REFERENCES public.tenants (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_job_titles_tenants | type: CONSTRAINT --
-- ALTER TABLE public.tenant_job_titles DROP CONSTRAINT IF EXISTS fk_job_titles_tenants CASCADE;
ALTER TABLE public.tenant_job_titles ADD CONSTRAINT fk_job_titles_tenants FOREIGN KEY (tenant)
REFERENCES public.tenants (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_group_tenant | type: CONSTRAINT --
-- ALTER TABLE public.tenant_groups DROP CONSTRAINT IF EXISTS fk_group_tenant CASCADE;
ALTER TABLE public.tenant_groups ADD CONSTRAINT fk_group_tenant FOREIGN KEY (tenant)
REFERENCES public.tenants (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_groups_groups | type: CONSTRAINT --
-- ALTER TABLE public.tenant_groups DROP CONSTRAINT IF EXISTS fk_groups_groups CASCADE;
ALTER TABLE public.tenant_groups ADD CONSTRAINT fk_groups_groups FOREIGN KEY (parent)
REFERENCES public.tenant_groups (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_tenant_user_groups_groups | type: CONSTRAINT --
-- ALTER TABLE public.tenants_users_groups DROP CONSTRAINT IF EXISTS fk_tenant_user_groups_groups CASCADE;
ALTER TABLE public.tenants_users_groups ADD CONSTRAINT fk_tenant_user_groups_groups FOREIGN KEY (tenant,tenant_group)
REFERENCES public.tenant_groups (tenant,id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_tenant_user_groups_tenant_users | type: CONSTRAINT --
-- ALTER TABLE public.tenants_users_groups DROP CONSTRAINT IF EXISTS fk_tenant_user_groups_tenant_users CASCADE;
ALTER TABLE public.tenants_users_groups ADD CONSTRAINT fk_tenant_user_groups_tenant_users FOREIGN KEY (tenant,login)
REFERENCES public.tenants_users (tenant,login) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_permissions_modules | type: CONSTRAINT --
-- ALTER TABLE public.module_permissions DROP CONSTRAINT IF EXISTS fk_permissions_modules CASCADE;
ALTER TABLE public.module_permissions ADD CONSTRAINT fk_permissions_modules FOREIGN KEY (module)
REFERENCES public.modules (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_social_logins_users | type: CONSTRAINT --
-- ALTER TABLE public.user_social_logins DROP CONSTRAINT IF EXISTS fk_social_logins_users CASCADE;
ALTER TABLE public.user_social_logins ADD CONSTRAINT fk_social_logins_users FOREIGN KEY (login)
REFERENCES public.users (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_group_permissions_groups | type: CONSTRAINT --
-- ALTER TABLE public.tenant_group_permissions DROP CONSTRAINT IF EXISTS fk_group_permissions_groups CASCADE;
ALTER TABLE public.tenant_group_permissions ADD CONSTRAINT fk_group_permissions_groups FOREIGN KEY (tenant,tenant_group)
REFERENCES public.tenant_groups (tenant,id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_group_permissions_permissions | type: CONSTRAINT --
-- ALTER TABLE public.tenant_group_permissions DROP CONSTRAINT IF EXISTS fk_group_permissions_permissions CASCADE;
ALTER TABLE public.tenant_group_permissions ADD CONSTRAINT fk_group_permissions_permissions FOREIGN KEY (module,permission)
REFERENCES public.module_permissions (module,id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_group_permissions_tenant_modules | type: CONSTRAINT --
-- ALTER TABLE public.tenant_group_permissions DROP CONSTRAINT IF EXISTS fk_group_permissions_tenant_modules CASCADE;
ALTER TABLE public.tenant_group_permissions ADD CONSTRAINT fk_group_permissions_tenant_modules FOREIGN KEY (tenant,module)
REFERENCES public.tenants_modules (tenant,module) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_tenant_modules_tenants | type: CONSTRAINT --
-- ALTER TABLE public.tenants_modules DROP CONSTRAINT IF EXISTS fk_tenant_modules_tenants CASCADE;
ALTER TABLE public.tenants_modules ADD CONSTRAINT fk_tenant_modules_tenants FOREIGN KEY (tenant)
REFERENCES public.tenants (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_tenant_modules_modules | type: CONSTRAINT --
-- ALTER TABLE public.tenants_modules DROP CONSTRAINT IF EXISTS fk_tenant_modules_modules CASCADE;
ALTER TABLE public.tenants_modules ADD CONSTRAINT fk_tenant_modules_modules FOREIGN KEY (module)
REFERENCES public.modules (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_module_menus_module_menus | type: CONSTRAINT --
-- ALTER TABLE public.module_menus DROP CONSTRAINT IF EXISTS fk_module_menus_module_menus CASCADE;
ALTER TABLE public.module_menus ADD CONSTRAINT fk_module_menus_module_menus FOREIGN KEY (parent)
REFERENCES public.module_menus (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_module_menus_modules | type: CONSTRAINT --
-- ALTER TABLE public.module_menus DROP CONSTRAINT IF EXISTS fk_module_menus_modules CASCADE;
ALTER TABLE public.module_menus ADD CONSTRAINT fk_module_menus_modules FOREIGN KEY (module)
REFERENCES public.modules (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_module_menus_permissions | type: CONSTRAINT --
-- ALTER TABLE public.module_menus DROP CONSTRAINT IF EXISTS fk_module_menus_permissions CASCADE;
ALTER TABLE public.module_menus ADD CONSTRAINT fk_module_menus_permissions FOREIGN KEY (permission)
REFERENCES public.module_permissions (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_module_widgets_modules | type: CONSTRAINT --
-- ALTER TABLE public.module_widgets DROP CONSTRAINT IF EXISTS fk_module_widgets_modules CASCADE;
ALTER TABLE public.module_widgets ADD CONSTRAINT fk_module_widgets_modules FOREIGN KEY (module)
REFERENCES public.modules (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_module_widgets_permissions | type: CONSTRAINT --
-- ALTER TABLE public.module_widgets DROP CONSTRAINT IF EXISTS fk_module_widgets_permissions CASCADE;
ALTER TABLE public.module_widgets ADD CONSTRAINT fk_module_widgets_permissions FOREIGN KEY (permission)
REFERENCES public.module_permissions (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_module_templates_modules | type: CONSTRAINT --
-- ALTER TABLE public.module_templates DROP CONSTRAINT IF EXISTS fk_module_templates_modules CASCADE;
ALTER TABLE public.module_templates ADD CONSTRAINT fk_module_templates_modules FOREIGN KEY (module)
REFERENCES public.modules (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_module_templates_permissions | type: CONSTRAINT --
-- ALTER TABLE public.module_templates DROP CONSTRAINT IF EXISTS fk_module_templates_permissions CASCADE;
ALTER TABLE public.module_templates ADD CONSTRAINT fk_module_templates_permissions FOREIGN KEY (permission)
REFERENCES public.module_permissions (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_template_positions_templates | type: CONSTRAINT --
-- ALTER TABLE public.module_template_positions DROP CONSTRAINT IF EXISTS fk_template_positions_templates CASCADE;
ALTER TABLE public.module_template_positions ADD CONSTRAINT fk_template_positions_templates FOREIGN KEY (template)
REFERENCES public.module_templates (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_widget_template_position_module_widget | type: CONSTRAINT --
-- ALTER TABLE public.module_widget_module_template_positions DROP CONSTRAINT IF EXISTS fk_widget_template_position_module_widget CASCADE;
ALTER TABLE public.module_widget_module_template_positions ADD CONSTRAINT fk_widget_template_position_module_widget FOREIGN KEY (module_widget)
REFERENCES public.module_widgets (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_widget_template_position_template_positions | type: CONSTRAINT --
-- ALTER TABLE public.module_widget_module_template_positions DROP CONSTRAINT IF EXISTS fk_widget_template_position_template_positions CASCADE;
ALTER TABLE public.module_widget_module_template_positions ADD CONSTRAINT fk_widget_template_position_template_positions FOREIGN KEY (template_position)
REFERENCES public.module_template_positions (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_contacts_users | type: CONSTRAINT --
-- ALTER TABLE public.user_contacts DROP CONSTRAINT IF EXISTS fk_contacts_users CASCADE;
ALTER TABLE public.user_contacts ADD CONSTRAINT fk_contacts_users FOREIGN KEY (login)
REFERENCES public.users (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_user_emergency_contacts_users | type: CONSTRAINT --
-- ALTER TABLE public.user_emergency_contacts DROP CONSTRAINT IF EXISTS fk_user_emergency_contacts_users CASCADE;
ALTER TABLE public.user_emergency_contacts ADD CONSTRAINT fk_user_emergency_contacts_users FOREIGN KEY (login)
REFERENCES public.users (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_user_emergency_contacts_contacts | type: CONSTRAINT --
-- ALTER TABLE public.user_emergency_contacts DROP CONSTRAINT IF EXISTS fk_user_emergency_contacts_contacts CASCADE;
ALTER TABLE public.user_emergency_contacts ADD CONSTRAINT fk_user_emergency_contacts_contacts FOREIGN KEY (contact)
REFERENCES public.users (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_pages_user | type: CONSTRAINT --
-- ALTER TABLE public.pages DROP CONSTRAINT IF EXISTS fk_pages_user CASCADE;
ALTER TABLE public.pages ADD CONSTRAINT fk_pages_user FOREIGN KEY (author)
REFERENCES public.users (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_menus_module_widgets | type: CONSTRAINT --
-- ALTER TABLE public.menus DROP CONSTRAINT IF EXISTS fk_menus_module_widgets CASCADE;
ALTER TABLE public.menus ADD CONSTRAINT fk_menus_module_widgets FOREIGN KEY (module_widget)
REFERENCES public.module_widgets (id) MATCH FULL
ON DELETE NO ACTION ON UPDATE NO ACTION;
-- ddl-end --

-- object: fk_menu_items_menus | type: CONSTRAINT --
-- ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS fk_menu_items_menus CASCADE;
ALTER TABLE public.menu_items ADD CONSTRAINT fk_menu_items_menus FOREIGN KEY (menu)
REFERENCES public.menus (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_menu_items_module_menus | type: CONSTRAINT --
-- ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS fk_menu_items_module_menus CASCADE;
ALTER TABLE public.menu_items ADD CONSTRAINT fk_menu_items_module_menus FOREIGN KEY (module_menu)
REFERENCES public.module_menus (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_menu_items_menu_items | type: CONSTRAINT --
-- ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS fk_menu_items_menu_items CASCADE;
ALTER TABLE public.menu_items ADD CONSTRAINT fk_menu_items_menu_items FOREIGN KEY (parent)
REFERENCES public.menu_items (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --


