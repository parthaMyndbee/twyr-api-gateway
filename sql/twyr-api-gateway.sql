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
 ENUM ('component','middleware','service','template');
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
	CONSTRAINT pk_modules PRIMARY KEY (id)

);
-- ddl-end --
ALTER TABLE public.modules OWNER TO postgres;
-- ddl-end --

-- object: uidx_parent_name | type: INDEX --
-- DROP INDEX IF EXISTS public.uidx_parent_name CASCADE;
CREATE UNIQUE INDEX uidx_parent_name ON public.modules
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
		RAISE SQLSTATE '2F003' USING MESSAGE = 'Component cannot be its own descendant';
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

-- object: fk_modules_modules | type: CONSTRAINT --
-- ALTER TABLE public.modules DROP CONSTRAINT IF EXISTS fk_modules_modules CASCADE;
ALTER TABLE public.modules ADD CONSTRAINT fk_modules_modules FOREIGN KEY (parent_id)
REFERENCES public.modules (id) MATCH FULL
ON DELETE NO ACTION ON UPDATE NO ACTION;
-- ddl-end --


