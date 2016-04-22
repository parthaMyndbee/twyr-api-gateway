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

-- object: public.modules | type: TABLE --
-- DROP TABLE IF EXISTS public.modules CASCADE;
CREATE TABLE public.modules(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	parent_id uuid,
	type public.module_type NOT NULL DEFAULT 'component',
	name text NOT NULL,
	display_name text NOT NULL,
	description text NOT NULL DEFAULT 'Another Twyr Module',
	configuration jsonb NOT NULL DEFAULT '{}'::json,
	enabled boolean NOT NULL DEFAULT true::boolean,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_modules PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.modules OWNER TO postgres;
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

-- object: trigger_check_module_upsert_is_valid | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_check_module_upsert_is_valid ON public.modules  ON public.modules CASCADE;
CREATE TRIGGER trigger_check_module_upsert_is_valid
	BEFORE INSERT OR UPDATE
	ON public.modules
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_check_module_upsert_is_valid();
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

-- object: trigger_notify_config_change | type: TRIGGER --
-- DROP TRIGGER IF EXISTS trigger_notify_config_change ON public.modules  ON public.modules CASCADE;
CREATE TRIGGER trigger_notify_config_change
	AFTER UPDATE
	ON public.modules
	FOR EACH ROW
	EXECUTE PROCEDURE public.fn_notify_config_change();
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

-- object: uidx_permissions | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_permissions CASCADE;
CREATE UNIQUE INDEX uidx_permissions ON public.permissions
	USING btree
	(
	  module_id ASC NULLS LAST,
	  name ASC NULLS LAST
	);
-- ddl-end --

-- object: public.tenant_type | type: TYPE --
-- DROP TYPE IF EXISTS public.tenant_type CASCADE;
CREATE TYPE public.tenant_type AS
 ENUM ('department','suborganization');
-- ddl-end --
ALTER TYPE public.tenant_type OWNER TO postgres;
-- ddl-end --

-- object: public.tenants | type: TABLE --
-- DROP TABLE IF EXISTS public.tenants CASCADE;
CREATE TABLE public.tenants(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	parent_id uuid,
	type public.tenant_type NOT NULL DEFAULT 'suborganization'::tenant_type,
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

-- object: public.group_permissions | type: TABLE --
-- DROP TABLE IF EXISTS public.group_permissions CASCADE;
CREATE TABLE public.group_permissions(
	id uuid NOT NULL DEFAULT uuid_generate_v4(),
	group_id uuid NOT NULL,
	permission_id uuid NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT pk_group_permissions PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.group_permissions OWNER TO postgres;
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
			tenant B
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

-- object: fk_modules_modules | type: CONSTRAINT --
-- ALTER TABLE public.modules DROP CONSTRAINT IF EXISTS fk_modules_modules CASCADE;
ALTER TABLE public.modules ADD CONSTRAINT fk_modules_modules FOREIGN KEY (parent_id)
REFERENCES public.modules (id) MATCH FULL
ON DELETE NO ACTION ON UPDATE NO ACTION;
-- ddl-end --

-- object: fk_permissions_modules | type: CONSTRAINT --
-- ALTER TABLE public.permissions DROP CONSTRAINT IF EXISTS fk_permissions_modules CASCADE;
ALTER TABLE public.permissions ADD CONSTRAINT fk_permissions_modules FOREIGN KEY (module_id)
REFERENCES public.modules (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
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
ON DELETE NO ACTION ON UPDATE NO ACTION;
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
REFERENCES public.job_titles (tenant_id,id) MATCH FULL
ON DELETE NO ACTION ON UPDATE NO ACTION;
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
REFERENCES public.groups (id,tenant_id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_tenant_user_groups_tenant_users | type: CONSTRAINT --
-- ALTER TABLE public.tenant_user_groups DROP CONSTRAINT IF EXISTS fk_tenant_user_groups_tenant_users CASCADE;
ALTER TABLE public.tenant_user_groups ADD CONSTRAINT fk_tenant_user_groups_tenant_users FOREIGN KEY (tenant_id,user_id)
REFERENCES public.tenants_users (tenant_id,user_id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_group_permissions_groups | type: CONSTRAINT --
-- ALTER TABLE public.group_permissions DROP CONSTRAINT IF EXISTS fk_group_permissions_groups CASCADE;
ALTER TABLE public.group_permissions ADD CONSTRAINT fk_group_permissions_groups FOREIGN KEY (group_id)
REFERENCES public.groups (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --

-- object: fk_group_permissions_permissions | type: CONSTRAINT --
-- ALTER TABLE public.group_permissions DROP CONSTRAINT IF EXISTS fk_group_permissions_permissions CASCADE;
ALTER TABLE public.group_permissions ADD CONSTRAINT fk_group_permissions_permissions FOREIGN KEY (permission_id)
REFERENCES public.permissions (id) MATCH FULL
ON DELETE CASCADE ON UPDATE CASCADE;
-- ddl-end --


