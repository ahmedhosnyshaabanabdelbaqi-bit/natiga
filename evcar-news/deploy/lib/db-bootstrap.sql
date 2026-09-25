-- EV Car News — idempotent database bootstrap, run by `evcar up` as the
-- PostgreSQL superuser inside the postgres container (unix socket):
--   psql -d postgres -f -      (SQL on stdin)
-- The role name, its password and the database name are read from the
-- container environment (APP_DB_USER, APP_DB_PASSWORD, POSTGRES_DB) with
-- \getenv (psql >= 15), so the password never appears on a command line
-- (`ps` on the host lists the processes of every container).
-- Safe to run on every start; it never drops or rewrites data.

\set ON_ERROR_STOP 1
\getenv app_user APP_DB_USER
\getenv app_password APP_DB_PASSWORD
\getenv db_name POSTGRES_DB
\if :{?app_user}
\else
  DO $$ BEGIN RAISE EXCEPTION 'APP_DB_USER is not set in the postgres container'; END $$;
\endif
\if :{?app_password}
\else
  DO $$ BEGIN RAISE EXCEPTION 'APP_DB_PASSWORD is not set in the postgres container'; END $$;
\endif
\if :{?db_name}
\else
  DO $$ BEGIN RAISE EXCEPTION 'POSTGRES_DB is not set in the postgres container'; END $$;
\endif

SELECT format('CREATE ROLE %I WITH LOGIN', :'app_user')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec

ALTER ROLE :"app_user" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'app_password';

SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'app_user')
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name') \gexec

ALTER DATABASE :"db_name" OWNER TO :"app_user";
REVOKE CONNECT, TEMPORARY ON DATABASE :"db_name" FROM PUBLIC;

\connect :"db_name"
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS btree_gist;
