#!/bin/sh
# Container entrypoint: optionally apply migrations and the idempotent
# reference seed before starting the given command (default: the API).
#   RUN_MIGRATIONS=true   → prisma migrate deploy
#   RUN_REFERENCE_SEED=true → node dist/cli/seed.js (roles, markets, settings...)
# Demo data is NEVER seeded here.
set -eu
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "[entrypoint] prisma migrate deploy"
  node node_modules/prisma/build/index.js migrate deploy
fi
if [ "${RUN_REFERENCE_SEED:-false}" = "true" ]; then
  echo "[entrypoint] reference seed"
  node dist/cli/seed.js
fi
exec "$@"
