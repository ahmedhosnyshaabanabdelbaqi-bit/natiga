#!/bin/bash
# EV Car News — PostgreSQL first-start initialisation.
#
# The official image runs /docker-entrypoint-initdb.d/* ONCE, when the data
# volume is empty. This directory replaces the postgis image's own init script
# (which would also install postgis_topology and the tiger geocoder, unused here).
#
# - creates the extensions the migrations use (postgis needs a superuser),
# - creates the unprivileged application role (no superuser, no createdb) and
#   makes it the owner of the application database.
#
# `evcar up` re-applies the same statements idempotently (deploy/lib/db-bootstrap.sql),
# so a changed APP_DB_PASSWORD is picked up without re-initialising the volume.
# Works whether the image executes or sources this file (no `set -u` on purpose).
set -e

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${APP_DB_USER:?APP_DB_USER is required}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"

# The values are read with \getenv inside psql (PostgreSQL >= 15): the password
# is never part of a command line (`ps` on the host shows container processes).
psql -X -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
\getenv app_user APP_DB_USER
\getenv app_password APP_DB_PASSWORD
\getenv db_name POSTGRES_DB
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE ROLE :"app_user" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'app_password';
ALTER DATABASE :"db_name" OWNER TO :"app_user";
REVOKE CONNECT, TEMPORARY ON DATABASE :"db_name" FROM PUBLIC;
EOSQL

echo "[evcar-init] database ${POSTGRES_DB} owned by ${APP_DB_USER}; extensions ready"
