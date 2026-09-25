-- Reference seed bookkeeping: which (role, permission) pairs the seed has
-- granted or adopted, so permissions removed by an owner are never
-- re-granted by `npm run db:seed` (runs on every container start).
-- No backfill: the first run of the new seed adopts the current state.

-- CreateTable
CREATE TABLE "seeded_role_permissions" (
    "role_key" VARCHAR(64) NOT NULL,
    "permission_key" VARCHAR(100) NOT NULL,
    "seeded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seeded_role_permissions_pkey" PRIMARY KEY ("role_key","permission_key")
);
