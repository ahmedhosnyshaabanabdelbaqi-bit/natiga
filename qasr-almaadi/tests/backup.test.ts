import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  encryptBackup,
  decryptBackup,
  backupDatabase,
  restoreDatabase,
  acquireDataLock,
} from "../scripts/backup-lib.js";

test("encrypted snapshot restores real PostgreSQL rows; tampering, wrong keys and overwrites are rejected", async () => {
  const root = mkdtempSync(join(tmpdir(), "qasr-backup-"));
  const source = join(root, "source"),
    restored = join(root, "restored"),
    file = join(root, "backup.enc");
  const pass = "isolated-test-passphrase-2026";
  const db = await PGlite.create(source);
  await db.exec(
    "CREATE TABLE proof(id integer PRIMARY KEY,name text NOT NULL)",
  );
  await db.query("INSERT INTO proof VALUES ($1,$2)", [1, "طفل تجريبي"]);
  await db.close();
  const release = acquireDataLock(source);
  await assert.rejects(() => backupDatabase(source, file, pass), /locked/);
  release();
  await backupDatabase(source, file, pass);
  assert.equal(readFileSync(file).includes(Buffer.from("طفل تجريبي")), false);
  await assert.rejects(() =>
    restoreDatabase(file, restored, "incorrect-passphrase"),
  );
  await restoreDatabase(file, restored, pass);
  const restoredDb = await PGlite.create(restored);
  assert.deepEqual((await restoredDb.query("SELECT * FROM proof")).rows, [
    { id: 1, name: "طفل تجريبي" },
  ]);
  await restoredDb.close();
  await assert.rejects(
    () => restoreDatabase(file, restored, pass),
    /NEW directory/,
  );
  const payload = encryptBackup(Buffer.from("patient data"), pass);
  payload[payload.length - 1] ^= 1;
  assert.throws(() => decryptBackup(payload, pass));
});
