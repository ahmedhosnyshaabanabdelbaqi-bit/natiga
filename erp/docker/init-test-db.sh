#!/bin/sh
# The test suite runs against PostgreSQL, not SQLite, because the schema relies
# on deferred constraint triggers, partial unique indexes and NUMERIC semantics.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE erp_test OWNER $POSTGRES_USER;
EOSQL
