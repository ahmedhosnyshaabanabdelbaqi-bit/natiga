-- Refresh-token families: every rotated refresh-token hash of a session is
-- kept (until the session is purged) so that presenting ANY older token is
-- detected as reuse, not only the immediately previous one.

-- CreateTable
CREATE TABLE "refresh_token_history" (
    "token_hash" CHAR(64) NOT NULL,
    "session_id" UUID NOT NULL,
    "rotated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_history_pkey" PRIMARY KEY ("token_hash")
);

-- CreateIndex
CREATE INDEX "refresh_token_history_session_id_idx" ON "refresh_token_history"("session_id");

-- AddForeignKey
ALTER TABLE "refresh_token_history" ADD CONSTRAINT "refresh_token_history_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "user_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing sessions: the only rotated hash known so far is the previous one.
INSERT INTO "refresh_token_history" ("token_hash", "session_id", "rotated_at")
SELECT "previous_refresh_token_hash", "id", COALESCE("last_rotated_at", "created_at")
FROM "user_sessions"
WHERE "previous_refresh_token_hash" IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE "refresh_token_history"
  ADD CONSTRAINT "refresh_token_history_hash_hex" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
