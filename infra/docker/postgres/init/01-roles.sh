#!/bin/sh
# Runs once, when the PostgreSQL data volume is first initialised.
# Creates the DML-only application role (docs/architecture/04-database.md §2).
# The POSTGRES_USER (schema owner) runs migrations. The app never connects as the owner.
set -eu

: "${POSTGRES_APP_USER:?POSTGRES_APP_USER is required}"
: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="$POSTGRES_APP_USER" -v app_password="$POSTGRES_APP_PASSWORD" \
  -v owner="$POSTGRES_USER" -v db="$POSTGRES_DB" <<'SQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

ALTER ROLE :"app_user" SET statement_timeout = '15s';
ALTER ROLE :"app_user" SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE :"app_user" SET lock_timeout = '3s';

REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO :"app_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"app_user";

-- Tables and sequences created later by the owner (migrations) are usable by the app.
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
SQL

echo "Created application role ${POSTGRES_APP_USER}"
