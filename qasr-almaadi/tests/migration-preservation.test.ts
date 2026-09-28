import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { initDb, one } from "../server/db.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { collectRelease } from "../scripts/update-package.js";

test("preserving data retains migration 016 bytes required by the signed updater", async () => {
  const historical = await readFile(new URL("../server/migrations/016_live_empty_system.sql", import.meta.url));
  assert.equal(createHash("sha256").update(historical).digest("hex"), "087fe5fe3aca5b482716d6133f4bb6b47f2d3749e0c285782e7898e3582e6865");
  const packaged = collectRelease(fileURLToPath(new URL("../", import.meta.url)));
  const replacement = packaged.find(file => file.path === "server/migration-overrides/016_preserve_existing_data.sql");
  assert.ok(replacement, "the safe migration must travel with the signed release");
  assert.equal(Buffer.from(replacement.content, "base64").toString(), await readFile(new URL("../server/migration-overrides/016_preserve_existing_data.sql", import.meta.url), "utf8"));
});

test("upgrading schema 15 preserves clinical, financial, staff and audit records", async () => {
  delete process.env.DATABASE_URL;
  const directory = join(await mkdtemp(join(tmpdir(), "child-upgrade-")), "db");
  const old = await PGlite.create(directory);
  const migrations = new URL("../server/migrations/", import.meta.url);
  try {
    for (const file of (await readdir(migrations)).filter(f => Number(f.split("_")[0]) <= 15).sort()) {
      for (const statement of (await readFile(new URL(file, migrations), "utf8")).split(";").map(s => s.trim()).filter(Boolean)) await old.query(statement);
      await old.query("INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING", [Number(file.split("_")[0])]);
    }
    await old.exec(`
      INSERT INTO roles VALUES('doctor','[]');
      INSERT INTO users(id,name,username,password_hash,role) VALUES('clinician','Existing doctor','doctor-existing','unchanged','doctor');
      INSERT INTO settings VALUES('hospital','{"name":"Existing hospital","training":false}');
      INSERT INTO patients(id,mrn,name,sex,birth_at) VALUES('patient','OLD-001','Existing infant','female','2026-09-01');
      INSERT INTO beds(id,name,room,status,care_level) VALUES('bed','Bed 1','Room 1','occupied','intensive');
      INSERT INTO admissions(id,admission_no,patient_id,bed_id,doctor_id) VALUES('admission','ADM-001','patient','bed','clinician');
      INSERT INTO vitals(id,admission_id,measured_at,weight,actor_id) VALUES('vital','admission',now(),2100,'clinician');
      INSERT INTO payments(id,receipt_no,admission_id,amount,method,money_account_id,actor_id) VALUES('payment','RC-001','admission',125,'cash','cash','clinician');
      INSERT INTO hr_employees(id,employee_no,name,device_pin,user_id) VALUES('employee','E-001','Existing doctor','123','clinician');
      INSERT INTO audit(id,actor_id,action,entity,patient_id) VALUES('audit','clinician','create','patient','patient');
      INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('existing-session','clinician',now()+interval '1 day');
      INSERT INTO chat_messages(id,conversation_id,sender_id,text) VALUES('message','department','clinician','Existing handover');
      INSERT INTO money_accounts(id,name,kind,bank_name,opening_balance) VALUES('bank','Existing bank','bank','Bank',250);
      UPDATE money_accounts SET opening_balance=500 WHERE id='cash';
      SELECT setval('purchase_order_number',80);
    `);
  } finally {
    await old.close();
  }
  const db = await initDb(directory);
  try {
    for (const table of ["patients", "beds", "admissions", "vitals", "payments", "hr_employees", "audit", "sessions", "chat_messages"]) {
      assert.equal((await one(db, `SELECT count(*)::int n FROM ${table}`)).n, 1, `${table} must survive an upgrade`);
    }
    assert.equal((await one(db, "SELECT password_hash FROM users WHERE id='clinician'")).password_hash, "unchanged");
    assert.equal(Number((await one(db, "SELECT opening_balance FROM money_accounts WHERE id='cash'")).opening_balance), 500);
    assert.equal(Number((await one(db, "SELECT opening_balance FROM money_accounts WHERE id='bank'")).opening_balance), 250);
    assert.equal(Number((await one(db, "SELECT nextval('purchase_order_number') n")).n), 81);
    assert.equal((await one(db, "SELECT data FROM settings WHERE id='hospital'")).data.name, "Existing hospital");
    const latestVersion = Math.max(...(await readdir(migrations)).filter(file => /^\d+.*\.sql$/.test(file)).map(file => Number(file.split('_')[0])));
    assert.equal((await one(db, "SELECT max(version) version FROM schema_migrations")).version, latestVersion);
    assert.ok((await one(db, "SELECT barcode_no FROM patients WHERE id='patient'")).barcode_no);
  } finally {
    await db.close();
  }
  const reopened = await initDb(directory);
  try { assert.equal((await one(reopened, "SELECT count(*)::int n FROM patients")).n, 1); }
  finally { await reopened.close(); }
});
