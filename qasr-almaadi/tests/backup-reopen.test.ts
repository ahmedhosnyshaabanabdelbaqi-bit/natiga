import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initDb, one } from "../server/db.js";
import { backupDatabase, restoreDatabase } from "../scripts/backup-lib.js";

test("restored backups can be reopened by the application without stale server locks", { timeout: 60000 }, async () => {
  delete process.env.DATABASE_URL;
  const root = mkdtempSync(join(tmpdir(), "nicu-backup-reopen-"));
  const source = join(root, "source"), restored = join(root, "restored"), archive = join(root, "backup.enc");
  const db = await initDb(source);
  await db.query("CREATE TABLE backup_reopen_proof(id integer PRIMARY KEY, name text NOT NULL)");
  await db.query("INSERT INTO backup_reopen_proof VALUES(1,'synthetic restore proof')");
  await db.close();
  await backupDatabase(source, archive, "isolated-backup-reopen-passphrase");
  await restoreDatabase(archive, restored, "isolated-backup-reopen-passphrase");
  assert.equal(existsSync(join(source, ".server-lock")), false);
  assert.equal(existsSync(join(restored, ".server-lock")), false);
  const reopened = await initDb(restored);
  try {
    assert.equal((await one(reopened, "SELECT name FROM backup_reopen_proof WHERE id=1")).name, "synthetic restore proof");
  } finally {
    await reopened.close();
  }
});
