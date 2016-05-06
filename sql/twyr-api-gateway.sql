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
		INSERT INTO tenant_modules (
			tenant_id,
			module_id
		)
		SELECT 
			id,
			NEW.id
		FROM
			tenants
		WHERE
			parent_id IS NULL;
	END IF;

	IF NEW.admin_only = false
	THEN
		INSERT INTO tenant_modules (
			tenant_id,
			module_id
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
	RETURNS TABLE ( level integer,  id uuid,  parent_id uuid,  name text,  type public.module_type)
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
			A.parent_id,
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
			B.parent_id,
			B.name,
			B.type
		FROM
			q,
			modules B
		WHERE
			B.id = q.parent_id
	)
	SELECT DISTINCT
		q.level,
		q.id,
		q.parent_id,
		q.name,
		q.type
	FROM
		q
	ORDER BY
		q.level,
		q.parent_id;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_get_module_ancestors(IN uuid) OWNER TO postgres;
-- ddl-end --

-- object: public.fn_get_module_descendants | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_get_module_descendants(IN uuid) CASCADE;
CREATE FUNCTION public.fn_get_module_descendants (IN moduleid uuid)
	RETURNS TABLE ( level integer,  id uuid,  parent_id uuid,  name text,  type public.module_type,  enabled boolean)
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
			A.parent_id,
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
			B.parent_id,
			B.name,
			B.type,
			fn_is_module_enabled(B.id) AS enabled
		FROM
			q,
			modules B
		WHERE
			B.parent_id = q.id
	)
	SELECT DISTINCT
		q.level,
		q.id,
		q.parent_id,
		q.name,
		q.type,
		q.enabled
	FROM
		q
	ORDER BY
		q.level,
		q.parent_id;
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



	IF NEW.parent_id IS NULL
	THEN
		RETURN NEW;
	END IF;

	IF NEW.id = NEW.parent_id
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Module cannot be its own parent';
		RETURN NULL;
	END IF;

	/* Check if the module is its own ancestor */
	is_module_in_tree := 0;
	SELECT
		COUNT(id)
	FROM
		fn_get_module_ancestors(NEW.parent_id)
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
	parent_id uuid,
	type public.module_type NOT NULL DEFAULT 'component',
	name text NOT NULL,
	display_name text NOT NULL,
	description text NOT NULL DEFAULT 'Another Twyr Module',
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
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
	parent_id uuid,
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
	profile_image_id uuid,
	gender public.gender NOT NULL DEFAULT 'male'::gender,
	home_module_menu_id uuid,
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
	  parent_id ASC NULLS LAST,
	  name ASC NULLS LAST
	);
-- ddl-end --

-- object: public.tenants_users | type: TABLE --
-- DROP TABLE IF EXISTS public.tenants_users CASCADE;
CREATE TABLE public.tenants_users(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	tenant_id uuid NOT NULL,
	user_id uuid NOT NULL,
	job_title_id uuid,
	location_id uuid,
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
	  tenant_id ASC NULLS LAST,
	  user_id ASC NULLS LAST
	);
-- ddl-end --

-- object: public.locations | type: TABLE --
-- DROP TABLE IF EXISTS public.locations CASCADE;
CREATE TABLE public.locations(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	tenant_id uuid NOT NULL,
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
ALTER TABLE public.locations OWNER TO postgres;
-- ddl-end --

-- object: uidx_locations | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_locations CASCADE;
CREATE UNIQUE INDEX uidx_locations ON public.locations
	USING btree
	(
	  tenant_id ASC NULLS LAST,
	  id ASC NULLS LAST
	);
-- ddl-end --

-- object: public.job_titles | type: TABLE --
-- DROP TABLE IF EXISTS public.job_titles CASCADE;
CREATE TABLE public.job_titles(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	tenant_id uuid NOT NULL,
	title text NOT NULL,
	description text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_job_titles PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.job_titles OWNER TO postgres;
-- ddl-end --

-- object: uidx_job_titles | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_job_titles CASCADE;
CREATE UNIQUE INDEX uidx_job_titles ON public.job_titles
	USING btree
	(
	  tenant_id ASC NULLS LAST,
	  id ASC NULLS LAST
	);
-- ddl-end --

-- object: public.groups | type: TABLE --
-- DROP TABLE IF EXISTS public.groups CASCADE;
CREATE TABLE public.groups(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	parent_id uuid,
	tenant_id uuid NOT NULL,
	name text NOT NULL,
	display_name text NOT NULL,
	description text,
	default_for_new_user boolean NOT NULL DEFAULT false::boolean,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT fk_groups PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.groups OWNER TO postgres;
-- ddl-end --

-- object: uidx_group_parent_name | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_group_parent_name CASCADE;
CREATE UNIQUE INDEX uidx_group_parent_name ON public.groups
	USING btree
	(
	  parent_id ASC NULLS LAST,
	  name ASC NULLS LAST
	);
-- ddl-end --

-- object: uidx_group_tenant | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_group_tenant CASCADE;
CREATE UNIQUE INDEX uidx_group_tenant ON public.groups
	USING btree
	(
	  tenant_id ASC NULLS LAST,
	  id ASC NULLS LAST
	);
-- ddl-end --

-- object: public.tenant_user_groups | type: TABLE --
-- DROP TABLE IF EXISTS public.tenant_user_groups CASCADE;
CREATE TABLE public.tenant_user_groups(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	tenant_id uuid NOT NULL,
	group_id uuid NOT NULL,
	user_id uuid NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_tenant_user_groups PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.tenant_user_groups OWNER TO postgres;
-- ddl-end --

-- object: public.permissions | type: TABLE --
-- DROP TABLE IF EXISTS public.permissions CASCADE;
CREATE TABLE public.permissions(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	module_id uuid NOT NULL,
	name text NOT NULL,
	display_name text NOT NULL,
	description text NOT NULL DEFAULT 'Another Random Permission'::text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_permissions PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.permissions OWNER TO postgres;
-- ddl-end --

-- object: public.fn_get_tenant_ancestors | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_get_tenant_ancestors(IN uuid) CASCADE;
CREATE FUNCTION public.fn_get_tenant_ancestors (IN tenantid uuid)
	RETURNS TABLE ( level integer,  id uuid,  parent_id uuid,  name text,  type public.tenant_type)
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
			A.parent_id,
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
			B.parent_id,
			B.name,
			B.type
		FROM
			q,
			tenants B
		WHERE
			B.id = q.parent_id
	)
	SELECT DISTINCT
		q.level,
		q.id,
		q.parent_id,
		q.name,
		q.type
	FROM
		q
	ORDER BY
		q.level,
		q.parent_id;
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
	RETURNS TABLE ( level integer,  id uuid,  parent_id uuid,  name text,  type public.tenant_type,  enabled boolean)
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
			A.parent_id,
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
			B.parent_id,
			B.name,
			B.type,
			fn_is_tenant_enabled(B.id) AS enabled
		FROM
			q,
			tenants B
		WHERE
			B.parent_id = q.id
	)
	SELECT DISTINCT
		q.level,
		q.id,
		q.parent_id,
		q.name,
		q.type,
		q.enabled
	FROM
		q
	ORDER BY
		q.level,
		q.parent_id;
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
	IF NEW.parent_id IS NULL
	THEN
		RETURN NEW;
	END IF;

	IF NEW.id = NEW.parent_id
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Tenant cannot be its own parent';
		RETURN NULL;
	END IF;

	/* Check if the tenant is its own ancestor */
	is_tenant_in_tree := 0;
	SELECT
		COUNT(id)
	FROM
		fn_get_tenant_ancestors(NEW.parent_id)
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
	RETURNS TABLE ( level integer,  id uuid,  parent_id uuid,  name text)
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
			A.parent_id,
			A.name
		FROM
			groups A
		WHERE
			A.id = groupid
		UNION ALL
		SELECT
			q.level + 1,
			B.id,
			B.parent_id,
			B.name
		FROM
			q,
			groups B
		WHERE
			B.id = q.parent_id
	)
	SELECT DISTINCT
		q.level,
		q.id,
		q.parent_id,
		q.name
	FROM
		q
	ORDER BY
		q.level,
		q.parent_id;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_get_group_ancestors(IN uuid) OWNER TO postgres;
-- ddl-end --

-- object: public.fn_get_group_descendants | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_get_group_descendants(IN uuid) CASCADE;
CREATE FUNCTION public.fn_get_group_descendants (IN groupid uuid)
	RETURNS TABLE ( level integer,  id uuid,  parent_id uuid,  name text)
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
			A.parent_id,
			A.name
		FROM
			groups A
		WHERE
			A.id = groupid
		UNION ALL
		SELECT
			q.level + 1,
			B.id,
			B.parent_id,
			B.name
		FROM
			q,
			groups B
		WHERE
			B.parent_id = q.id
	)
	SELECT DISTINCT
		q.level,
		q.id,
		q.parent_id,
		q.name
	FROM
		q
	ORDER BY
		q.level,
		q.parent_id;
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
	IF OLD.parent_id <> NEW.parent_id
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
-- DROP TRIGGER IF EXISTS trigger_check_group_update_is_valid ON public.groups  ON public.groups CASCADE;
CREATE TRIGGER trigger_check_group_update_is_valid
	BEFORE UPDATE
	ON public.groups
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
	default_group_id	UUID;
BEGIN
	default_group_id := NULL;
	SELECT
		id
	FROM
		groups
	WHERE
		tenant_id = NEW.tenant_id AND
		default_for_new_user = true
	INTO
		default_group_id;

	IF default_group_id IS NULL
	THEN
		RETURN NEW;
	END IF;

	INSERT INTO tenant_user_groups (
		tenant_id,
		group_id,
		user_id
	)
	VALUES (
		NEW.tenant_id,
		default_group_id,
		NEW.user_id
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
		group_permissions
	WHERE
		group_id IN (SELECT id FROM fn_get_group_descendants(OLD.group_id) WHERE level = 2) AND
		permission_id = OLD.permission_id;

	RETURN OLD;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_remove_group_permission_from_descendants() OWNER TO postgres;
-- ddl-end --

-- object: public.social_logins | type: TABLE --
-- DROP TABLE IF EXISTS public.social_logins CASCADE;
CREATE TABLE public.social_logins(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	user_id uuid NOT NULL,
	provider text NOT NULL,
	provider_id text NOT NULL,
	display_name text NOT NULL,
	social_data jsonb NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_social_logins PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.social_logins OWNER TO postgres;
-- ddl-end --

-- object: uidx_social_logins | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_social_logins CASCADE;
CREATE UNIQUE INDEX uidx_social_logins ON public.social_logins
	USING btree
	(
	  provider ASC NULLS LAST,
	  provider_id ASC NULLS LAST
	);
-- ddl-end --

-- object: public.group_permissions | type: TABLE --
-- DROP TABLE IF EXISTS public.group_permissions CASCADE;
CREATE TABLE public.group_permissions(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	tenant_id uuid NOT NULL,
	group_id uuid NOT NULL,
	module_id uuid NOT NULL,
	permission_id uuid NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_group_permissions PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.group_permissions OWNER TO postgres;
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
	INSERT INTO groups (
		parent_id,
		tenant_id,
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

	IF NEW.parent_id IS NOT NULL
	THEN
		INSERT INTO tenant_modules (
			tenant_id,
			module_id
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

	IF NEW.parent_id IS NULL
	THEN
		INSERT INTO tenant_modules (
			tenant_id,
			module_id
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
		id = NEW.module_id AND
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
-- DROP TRIGGER IF EXISTS trigger_check_permission_insert_is_valid ON public.permissions  ON public.permissions CASCADE;
CREATE TRIGGER trigger_check_permission_insert_is_valid
	BEFORE INSERT 
	ON public.permissions
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
	IF OLD.module_id <> NEW.module_id
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
-- DROP TRIGGER IF EXISTS trigger_check_permission_update_is_valid ON public.permissions  ON public.permissions CASCADE;
CREATE TRIGGER trigger_check_permission_update_is_valid
	BEFORE UPDATE
	ON public.permissions
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_check_permission_update_is_valid();
-- ddl-end --

-- object: public.tenant_modules | type: TABLE --
-- DROP TABLE IF EXISTS public.tenant_modules CASCADE;
CREATE TABLE public.tenant_modules(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	tenant_id uuid NOT NULL,
	module_id uuid NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_tenant_modules PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.tenant_modules OWNER TO postgres;
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
	component_parent_id	UUID;
	tenant_parent_id	UUID;
BEGIN
	is_component := 0;
	SELECT
		count(id)
	FROM
		modules
	WHERE
		id = NEW.module_id AND
		type = 'component'
	INTO
		is_component;

	IF is_component <= 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Only components can be mapped to tenants';
		RETURN NULL;
	END IF;

	component_parent_id := NULL;
	SELECT 
		parent_id
	FROM
		modules
	WHERE
		id = NEW.module_id
	INTO
		component_parent_id;

	IF component_parent_id IS NOT NULL
	THEN
		is_component := 0;
		SELECT
			count(id)
		FROM
			tenant_modules
		WHERE
			tenant_id = NEW.tenant_id AND
			module_id = component_parent_id
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
		id = NEW.module_id
	INTO
		is_admin_only;

	IF is_admin_only = false
	THEN
		RETURN NEW;
	END IF;

	tenant_parent_id := NULL;
	SELECT
		parent_id
	FROM
		tenants
	WHERE
		id = NEW.tenant_id
	INTO
		tenant_parent_id;

	IF tenant_parent_id IS NOT NULL
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
-- DROP TRIGGER IF EXISTS trigger_check_tenant_module_upsert_is_valid ON public.tenant_modules  ON public.tenant_modules CASCADE;
CREATE TRIGGER trigger_check_tenant_module_upsert_is_valid
	BEFORE INSERT OR UPDATE
	ON public.tenant_modules
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
	  parent_id ASC NULLS LAST,
	  name ASC NULLS LAST
	);
-- ddl-end --

-- object: uidx_permissions | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_permissions CASCADE;
CREATE UNIQUE INDEX uidx_permissions ON public.permissions
	USING btree
	(
	  module_id ASC NULLS LAST,
	  name ASC NULLS LAST
	);
-- ddl-end --

-- object: trigger_remove_group_permission_from_descendants | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_remove_group_permission_from_descendants ON public.group_permissions  ON public.group_permissions CASCADE;
CREATE TRIGGER trigger_remove_group_permission_from_descendants
	BEFORE DELETE 
	ON public.group_permissions
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_remove_group_permission_from_descendants();
-- ddl-end --

-- object: uidx_tenant_modules | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_tenant_modules CASCADE;
CREATE UNIQUE INDEX uidx_tenant_modules ON public.tenant_modules
	USING btree
	(
	  tenant_id ASC NULLS LAST,
	  module_id ASC NULLS LAST
	);
-- ddl-end --

-- object: uidx_permissions_modules | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_permissions_modules CASCADE;
CREATE UNIQUE INDEX uidx_permissions_modules ON public.permissions
	USING btree
	(
	  module_id ASC NULLS LAST,
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
	tenant_root_group_id	UUID;
BEGIN
	tenant_root_group_id := NULL;
	SELECT
		id
	FROM
		groups
	WHERE
		tenant_id = NEW.tenant_id AND
		parent_id IS NULL
	INTO
		tenant_root_group_id;

	IF tenant_root_group_id IS NULL
	THEN
		RETURN NEW;
	END IF;

	INSERT INTO group_permissions(
		tenant_id,
		group_id,
		module_id,
		permission_id
	)
	SELECT
		NEW.tenant_id,
		tenant_root_group_id,
		module_id,
		id
	FROM
		permissions
	WHERE
		module_id = NEW.module_id;

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_assign_permission_to_tenant_group() OWNER TO postgres;
-- ddl-end --

-- object: trigger_assign_permission_to_tenant_group | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_assign_permission_to_tenant_group ON public.tenant_modules  ON public.tenant_modules CASCADE;
CREATE TRIGGER trigger_assign_permission_to_tenant_group
	AFTER INSERT OR UPDATE
	ON public.tenant_modules
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_assign_permission_to_tenant_group();
-- ddl-end --

-- object: uidx_group_permissions | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_group_permissions CASCADE;
CREATE UNIQUE INDEX uidx_group_permissions ON public.group_permissions
	USING btree
	(
	  group_id ASC NULLS LAST,
	  permission_id ASC NULLS LAST
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
	INSERT INTO group_permissions (
		tenant_id,
		group_id,
		module_id,
		permission_id
	)
	SELECT
		A.tenant_id,
		B.id,
		A.module_id,
		NEW.id
	FROM
		tenant_modules A
		INNER JOIN groups B ON (A.tenant_id = B.tenant_id AND B.parent_id IS NULL)
	WHERE
		module_id = NEW.module_id;

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_assign_permission_to_tenants() OWNER TO postgres;
-- ddl-end --

-- object: trigger_assign_permission_to_tenants | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_assign_permission_to_tenants ON public.permissions  ON public.permissions CASCADE;
CREATE TRIGGER trigger_assign_permission_to_tenants
	AFTER INSERT 
	ON public.permissions
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_assign_permission_to_tenants();
-- ddl-end --

-- object: uidx_tenant_user_groups | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_tenant_user_groups CASCADE;
CREATE UNIQUE INDEX uidx_tenant_user_groups ON public.tenant_user_groups
	USING btree
	(
	  tenant_id ASC NULLS LAST,
	  group_id ASC NULLS LAST,
	  user_id ASC NULLS LAST
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
		tenant_user_groups
	WHERE
		tenant_id = NEW.tenant_id AND
		group_id IN (SELECT id FROM fn_get_group_descendants(NEW.group_id) WHERE level > 1) AND
		user_id = NEW.user_id;

	RETURN NEW;
END;
$$;
-- ddl-end --
ALTER FUNCTION public.fn_remove_descendant_group_from_tenant_user() OWNER TO postgres;
-- ddl-end --

-- object: trigger_remove_descendant_group_from_tenant_user | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_remove_descendant_group_from_tenant_user ON public.tenant_user_groups  ON public.tenant_user_groups CASCADE;
CREATE TRIGGER trigger_remove_descendant_group_from_tenant_user
	AFTER INSERT OR UPDATE
	ON public.tenant_user_groups
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
	parent_group_id			UUID;
	does_parent_group_have_permission	INTEGER;
BEGIN
	parent_group_id := NULL;
	SELECT
		parent_id
	FROM
		groups
	WHERE
		id = NEW.group_id
	INTO
		parent_group_id;

	IF parent_group_id IS NULL
	THEN
		RETURN NEW;
	END IF;

	does_parent_group_have_permission := 0;
	SELECT
		count(id)
	FROM
		group_permissions
	WHERE
		group_id = parent_group_id AND
		permission_id = NEW.permission_id
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
-- DROP TRIGGER IF EXISTS trigger_check_group_permission_insert_is_valid ON public.group_permissions  ON public.group_permissions CASCADE;
CREATE TRIGGER trigger_check_group_permission_insert_is_valid
	BEFORE INSERT OR UPDATE
	ON public.group_permissions
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
		tenant_user_groups
	WHERE
		tenant_id = NEW.tenant_id AND
		group_id IN (SELECT id FROM fn_get_group_ancestors(NEW.group_id) WHERE level > 1) AND
		user_id = NEW.user_id
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
-- DROP TRIGGER IF EXISTS trigger_check_tenant_user_group_upsert_is_valid ON public.tenant_user_groups  ON public.tenant_user_groups CASCADE;
CREATE TRIGGER trigger_check_tenant_user_group_upsert_is_valid
	BEFORE INSERT OR UPDATE
	ON public.tenant_user_groups
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_check_tenant_user_group_upsert_is_valid();
-- ddl-end --

-- object: public.module_menus | type: TABLE --
-- DROP TABLE IF EXISTS public.module_menus CASCADE;
CREATE TABLE public.module_menus(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	parent_id uuid,
	module_id uuid NOT NULL,
	permission_id uuid NOT NULL,
	ember_route text NOT NULL,
	icon_class text,
	display_name text NOT NULL,
	description text,
	tooltip text,
	is_default_home boolean NOT NULL DEFAULT false::boolean,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_module_menus PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.module_menus OWNER TO postgres;
-- ddl-end --

-- object: uidx_module_menus_module_route | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_module_menus_module_route CASCADE;
CREATE UNIQUE INDEX uidx_module_menus_module_route ON public.module_menus
	USING btree
	(
	  module_id ASC NULLS LAST,
	  ember_route ASC NULLS LAST
	);
-- ddl-end --

-- object: uidx_module_menus_module_name | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_module_menus_module_name CASCADE;
CREATE UNIQUE INDEX uidx_module_menus_module_name ON public.module_menus
	USING btree
	(
	  module_id ASC NULLS LAST,
	  display_name ASC NULLS LAST
	);
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
		id = NEW.module_id AND
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
		permissions
	WHERE
		module_id IN (SELECT id FROM fn_get_module_ancestors(NEW.module_id)) AND
		id = NEW.permission_id
	INTO
		is_permission_ok;

	IF is_permission_ok <= 0
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Menus must use Permissions defined by the Component or one of its parents';
		RETURN NULL;
	END IF;

	IF NEW.parent_id IS NULL
	THEN
		RETURN NEW;
	END IF;

	IF NEW.id = NEW.parent_id
	THEN
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Menu cannot be its own parent';
		RETURN NULL;
	END IF;

	/* Check if the module is its own ancestor */
	is_module_in_tree := 0;
	SELECT
		COUNT(id)
	FROM
		fn_get_module_menu_ancestors(NEW.parent_id)
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

-- object: trigger_check_module_menu_upsert_is_valid | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_check_module_menu_upsert_is_valid ON public.module_menus  ON public.module_menus CASCADE;
CREATE TRIGGER trigger_check_module_menu_upsert_is_valid
	BEFORE INSERT OR UPDATE
	ON public.module_menus
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_check_module_menu_upsert_is_valid();
-- ddl-end --

-- object: public.module_widgets | type: TABLE --
-- DROP TABLE IF EXISTS public.module_widgets CASCADE;
CREATE TABLE public.module_widgets(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	module_id uuid NOT NULL,
	permission_id uuid NOT NULL,
	ember_component text NOT NULL,
	display_name text NOT NULL,
	description text,
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
	  module_id ASC NULLS LAST,
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
		id = NEW.module_id AND
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
		permissions
	WHERE
		module_id IN (SELECT id FROM fn_get_module_ancestors(NEW.module_id)) AND
		id = NEW.permission_id
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
	RETURNS TABLE ( level integer,  id uuid,  parent_id uuid,  ember_route text)
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
			A.parent_id,
			A.ember_route
		FROM
			module_menus A
		WHERE
			A.id = menuid
		UNION ALL
		SELECT
			q.level + 1,
			B.id,
			B.parent_id,
			B.ember_route
		FROM
			q,
			module_menus B
		WHERE
			B.id = q.parent_id
	)
	SELECT DISTINCT
		q.level,
		q.id,
		q.parent_id,
		q.ember_route
	FROM
		q
	ORDER BY
		q.level,
		q.parent_id;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_get_module_menu_ancestors(IN uuid) OWNER TO postgres;
-- ddl-end --

-- object: public.fn_get_module_menu_descendants | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_get_module_menu_descendants() CASCADE;
CREATE FUNCTION public.fn_get_module_menu_descendants ()
	RETURNS TABLE ( level integer,  id uuid,  parent_id uuid,  ember_route text)
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
			A.parent_id,
			A.ember_route
		FROM
			module_menus A
		WHERE
			A.id = menuid
		UNION ALL
		SELECT
			q.level + 1,
			B.id,
			B.parent_id,
			B.ember_route
		FROM
			q,
			module_menus B
		WHERE
			B.parent_id = q.id
	)
	SELECT DISTINCT
		q.level,
		q.id,
		q.parent_id,
		q.ember_route
	FROM
		q
	ORDER BY
		q.level,
		q.parent_id;
END;

$$;
-- ddl-end --
ALTER FUNCTION public.fn_get_module_menu_descendants() OWNER TO postgres;
-- ddl-end --

-- object: public.template_media_type | type: TYPE --
-- DROP TYPE IF EXISTS public.template_media_type CASCADE;
CREATE TYPE public.template_media_type AS
 ENUM ('all','desktop','tablet','mobile','other');
-- ddl-end --
ALTER TYPE public.template_media_type OWNER TO postgres;
-- ddl-end --

-- object: public.template_user_type | type: TYPE --
-- DROP TYPE IF EXISTS public.template_user_type CASCADE;
CREATE TYPE public.template_user_type AS
 ENUM ('all','public','registered','other');
-- ddl-end --
ALTER TYPE public.template_user_type OWNER TO postgres;
-- ddl-end --

-- object: public.module_templates | type: TABLE --
-- DROP TABLE IF EXISTS public.module_templates CASCADE;
CREATE TABLE public.module_templates(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	module_id uuid NOT NULL,
	name text NOT NULL,
	description text,
	media_type public.template_media_type NOT NULL DEFAULT 'all'::template_media_type,
	user_type public.template_user_type NOT NULL DEFAULT 'all'::template_user_type,
	is_default boolean NOT NULL DEFAULT false::boolean,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
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
	  module_id ASC NULLS LAST,
	  name ASC NULLS LAST
	);
-- ddl-end --

-- object: public.fn_get_user_permissions | type: FUNCTION --
-- DROP FUNCTION IF EXISTS public.fn_get_user_permissions(IN uuid) CASCADE;
CREATE FUNCTION public.fn_get_user_permissions (IN userid uuid)
	RETURNS TABLE ( tenant_id uuid,  permission_id uuid)
	LANGUAGE plpgsql
	VOLATILE 
	CALLED ON NULL INPUT
	SECURITY INVOKER
	COST 1
	AS $$
BEGIN
	SELECT DISTINCT
		tenant_id,
		permission_id
	FROM
		group_permissions
	WHERE
		group_id IN (SELECT group_id FROM tenant_user_groups WHERE user_id = userid);
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
	is_valid_home_module_menu INTEGER;
BEGIN
	IF NEW.home_module_menu_id IS NULL
	THEN
		RETURN NEW;
	END IF;

	is_valid_home_module_menu := 0;
	SELECT
		count(id)
	FROM
		module_menus
	WHERE
		id = NEW.home_module_menu_id AND
		permission_id IN (SELECT DISTINCT permission_id FROM fn_get_user_permissions(NEW.id))
	INTO
		is_valid_home_module_menu;

	IF is_valid_home_module_menu <= 0
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

-- object: public.template_positions | type: TABLE --
-- DROP TABLE IF EXISTS public.template_positions CASCADE;
CREATE TABLE public.template_positions(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	template_id uuid NOT NULL,
	name text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_template_positions PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.template_positions OWNER TO postgres;
-- ddl-end --

-- object: public.widget_template_position | type: TABLE --
-- DROP TABLE IF EXISTS public.widget_template_position CASCADE;
CREATE TABLE public.widget_template_position(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	module_widget_id uuid NOT NULL,
	template_position_id uuid NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_widget_template_position PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.widget_template_position OWNER TO postgres;
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
	template_module_id 	UUID;
	widget_module_id	UUID;
	is_child_component	INTEGER;
BEGIN
	template_module_id := NULL;
	widget_module_id := NULL;
	is_child_component := 0;

	SELECT
		module_id
	FROM
		module_templates
	WHERE
		id = (SELECT template_id FROM template_positions WHERE id = NEW.template_position_id)
	INTO
		template_module_id;

	SELECT
		module_id
	FROM
		module_widgets
	WHERE
		id = NEW.module_widget_id
	INTO
		widget_module_id;

	SELECT
		count(A.id)
	FROM
		(SELECT id FROM fn_get_module_descendants(template_module_id) WHERE level <= 2) A
	WHERE
		A.id = widget_module_id
	INTO
		is_child_component;

	IF is_child_component <= 0
	THEN
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
CREATE UNIQUE INDEX uidx_widget_template_position ON public.widget_template_position
	USING btree
	(
	  module_widget_id ASC NULLS LAST,
	  template_position_id ASC NULLS LAST
	);
-- ddl-end --

-- object: trigger_check_widget_template_position_upsert_is_valid | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_check_widget_template_position_upsert_is_valid ON public.widget_template_position  ON public.widget_template_position CASCADE;
CREATE TRIGGER trigger_check_widget_template_position_upsert_is_valid
	BEFORE INSERT OR UPDATE
	ON public.widget_template_position
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_check_widget_template_position_upsert_is_valid();
-- ddl-end --

-- object: fk_modules_modules | type: CONSTRAINT --
-- ALTER TABLE public.modules DROP CONSTRAINT IF EXISTS fk_modules_modules CASCADE;
ALTER TABLE public.modules ADD CONSTRAINT fk_modules_modules FOREIGN KEY (parent_id)
REFERENCES public.modules (id) MATCH FULL
ON DELETE NO ACTION ON UPDATE NO ACTION;
-- ddl-end --

-- object: fk_tenant_parent | type: CONSTRAINT --
-- ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS fk_tenant_parent CASCADE;
ALTER TABLE public.tenants ADD CONSTRAINT fk_tenant_parent FOREIGN KEY (parent_id)
REFERENCES public.tenants (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_tenants_users_users | type: CONSTRAINT --
-- ALTER TABLE public.tenants_users DROP CONSTRAINT IF EXISTS fk_tenants_users_users CASCADE;
ALTER TABLE public.tenants_users ADD CONSTRAINT fk_tenants_users_users FOREIGN KEY (user_id)
REFERENCES public.users (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_tenants_users_tenants | type: CONSTRAINT --
-- ALTER TABLE public.tenants_users DROP CONSTRAINT IF EXISTS fk_tenants_users_tenants CASCADE;
ALTER TABLE public.tenants_users ADD CONSTRAINT fk_tenants_users_tenants FOREIGN KEY (tenant_id)
REFERENCES public.tenants (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_tenants_users_locations | type: CONSTRAINT --
-- ALTER TABLE public.tenants_users DROP CONSTRAINT IF EXISTS fk_tenants_users_locations CASCADE;
ALTER TABLE public.tenants_users ADD CONSTRAINT fk_tenants_users_locations FOREIGN KEY (tenant_id,location_id)
REFERENCES public.locations (tenant_id,id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_tenants_users_job_titles | type: CONSTRAINT --
-- ALTER TABLE public.tenants_users DROP CONSTRAINT IF EXISTS fk_tenants_users_job_titles CASCADE;
ALTER TABLE public.tenants_users ADD CONSTRAINT fk_tenants_users_job_titles FOREIGN KEY (tenant_id,job_title_id)
REFERENCES public.job_titles (id,tenant_id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_locations_tenants | type: CONSTRAINT --
-- ALTER TABLE public.locations DROP CONSTRAINT IF EXISTS fk_locations_tenants CASCADE;
ALTER TABLE public.locations ADD CONSTRAINT fk_locations_tenants FOREIGN KEY (tenant_id)
REFERENCES public.tenants (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_job_titles_tenants | type: CONSTRAINT --
-- ALTER TABLE public.job_titles DROP CONSTRAINT IF EXISTS fk_job_titles_tenants CASCADE;
ALTER TABLE public.job_titles ADD CONSTRAINT fk_job_titles_tenants FOREIGN KEY (tenant_id)
REFERENCES public.tenants (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_group_tenant | type: CONSTRAINT --
-- ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS fk_group_tenant CASCADE;
ALTER TABLE public.groups ADD CONSTRAINT fk_group_tenant FOREIGN KEY (tenant_id)
REFERENCES public.tenants (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_groups_groups | type: CONSTRAINT --
-- ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS fk_groups_groups CASCADE;
ALTER TABLE public.groups ADD CONSTRAINT fk_groups_groups FOREIGN KEY (parent_id)
REFERENCES public.groups (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_tenant_user_groups_groups | type: CONSTRAINT --
-- ALTER TABLE public.tenant_user_groups DROP CONSTRAINT IF EXISTS fk_tenant_user_groups_groups CASCADE;
ALTER TABLE public.tenant_user_groups ADD CONSTRAINT fk_tenant_user_groups_groups FOREIGN KEY (tenant_id,group_id)
REFERENCES public.groups (tenant_id,id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_tenant_user_groups_tenant_users | type: CONSTRAINT --
-- ALTER TABLE public.tenant_user_groups DROP CONSTRAINT IF EXISTS fk_tenant_user_groups_tenant_users CASCADE;
ALTER TABLE public.tenant_user_groups ADD CONSTRAINT fk_tenant_user_groups_tenant_users FOREIGN KEY (tenant_id,user_id)
REFERENCES public.tenants_users (tenant_id,user_id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_permissions_modules | type: CONSTRAINT --
-- ALTER TABLE public.permissions DROP CONSTRAINT IF EXISTS fk_permissions_modules CASCADE;
ALTER TABLE public.permissions ADD CONSTRAINT fk_permissions_modules FOREIGN KEY (module_id)
REFERENCES public.modules (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_social_logins_users | type: CONSTRAINT --
-- ALTER TABLE public.social_logins DROP CONSTRAINT IF EXISTS fk_social_logins_users CASCADE;
ALTER TABLE public.social_logins ADD CONSTRAINT fk_social_logins_users FOREIGN KEY (user_id)
REFERENCES public.users (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_group_permissions_groups | type: CONSTRAINT --
-- ALTER TABLE public.group_permissions DROP CONSTRAINT IF EXISTS fk_group_permissions_groups CASCADE;
ALTER TABLE public.group_permissions ADD CONSTRAINT fk_group_permissions_groups FOREIGN KEY (tenant_id,group_id)
REFERENCES public.groups (tenant_id,id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_group_permissions_permissions | type: CONSTRAINT --
-- ALTER TABLE public.group_permissions DROP CONSTRAINT IF EXISTS fk_group_permissions_permissions CASCADE;
ALTER TABLE public.group_permissions ADD CONSTRAINT fk_group_permissions_permissions FOREIGN KEY (module_id,permission_id)
REFERENCES public.permissions (module_id,id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_group_permissions_tenant_modules | type: CONSTRAINT --
-- ALTER TABLE public.group_permissions DROP CONSTRAINT IF EXISTS fk_group_permissions_tenant_modules CASCADE;
ALTER TABLE public.group_permissions ADD CONSTRAINT fk_group_permissions_tenant_modules FOREIGN KEY (tenant_id,module_id)
REFERENCES public.tenant_modules (tenant_id,module_id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_tenant_modules_tenants | type: CONSTRAINT --
-- ALTER TABLE public.tenant_modules DROP CONSTRAINT IF EXISTS fk_tenant_modules_tenants CASCADE;
ALTER TABLE public.tenant_modules ADD CONSTRAINT fk_tenant_modules_tenants FOREIGN KEY (tenant_id)
REFERENCES public.tenants (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_tenant_modules_modules | type: CONSTRAINT --
-- ALTER TABLE public.tenant_modules DROP CONSTRAINT IF EXISTS fk_tenant_modules_modules CASCADE;
ALTER TABLE public.tenant_modules ADD CONSTRAINT fk_tenant_modules_modules FOREIGN KEY (module_id)
REFERENCES public.modules (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_module_menus_module_menus | type: CONSTRAINT --
-- ALTER TABLE public.module_menus DROP CONSTRAINT IF EXISTS fk_module_menus_module_menus CASCADE;
ALTER TABLE public.module_menus ADD CONSTRAINT fk_module_menus_module_menus FOREIGN KEY (parent_id)
REFERENCES public.module_menus (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_module_menus_modules | type: CONSTRAINT --
-- ALTER TABLE public.module_menus DROP CONSTRAINT IF EXISTS fk_module_menus_modules CASCADE;
ALTER TABLE public.module_menus ADD CONSTRAINT fk_module_menus_modules FOREIGN KEY (module_id)
REFERENCES public.modules (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_module_menus_permissions | type: CONSTRAINT --
-- ALTER TABLE public.module_menus DROP CONSTRAINT IF EXISTS fk_module_menus_permissions CASCADE;
ALTER TABLE public.module_menus ADD CONSTRAINT fk_module_menus_permissions FOREIGN KEY (permission_id)
REFERENCES public.permissions (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_module_widgets_modules | type: CONSTRAINT --
-- ALTER TABLE public.module_widgets DROP CONSTRAINT IF EXISTS fk_module_widgets_modules CASCADE;
ALTER TABLE public.module_widgets ADD CONSTRAINT fk_module_widgets_modules FOREIGN KEY (module_id)
REFERENCES public.modules (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_module_widgets_permissions | type: CONSTRAINT --
-- ALTER TABLE public.module_widgets DROP CONSTRAINT IF EXISTS fk_module_widgets_permissions CASCADE;
ALTER TABLE public.module_widgets ADD CONSTRAINT fk_module_widgets_permissions FOREIGN KEY (permission_id)
REFERENCES public.permissions (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_module_templates_modules | type: CONSTRAINT --
-- ALTER TABLE public.module_templates DROP CONSTRAINT IF EXISTS fk_module_templates_modules CASCADE;
ALTER TABLE public.module_templates ADD CONSTRAINT fk_module_templates_modules FOREIGN KEY (module_id)
REFERENCES public.modules (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_template_positions_templates | type: CONSTRAINT --
-- ALTER TABLE public.template_positions DROP CONSTRAINT IF EXISTS fk_template_positions_templates CASCADE;
ALTER TABLE public.template_positions ADD CONSTRAINT fk_template_positions_templates FOREIGN KEY (template_id)
REFERENCES public.module_templates (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_widget_template_position_module_widget | type: CONSTRAINT --
-- ALTER TABLE public.widget_template_position DROP CONSTRAINT IF EXISTS fk_widget_template_position_module_widget CASCADE;
ALTER TABLE public.widget_template_position ADD CONSTRAINT fk_widget_template_position_module_widget FOREIGN KEY (module_widget_id)
REFERENCES public.module_widgets (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_widget_template_position_template_positions | type: CONSTRAINT --
-- ALTER TABLE public.widget_template_position DROP CONSTRAINT IF EXISTS fk_widget_template_position_template_positions CASCADE;
ALTER TABLE public.widget_template_position ADD CONSTRAINT fk_widget_template_position_template_positions FOREIGN KEY (template_position_id)
REFERENCES public.template_positions (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --


