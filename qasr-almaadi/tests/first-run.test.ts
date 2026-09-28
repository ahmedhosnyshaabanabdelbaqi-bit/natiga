import { test } from "node:test";
import assert from "node:assert/strict";
import { initDb, one } from "../server/db.js";
import { createApp } from "../server/app.js";
import { setupSystem } from "../server/setup.js";
import { verifyPassword } from "../server/security.js";

test("an empty installation reports setup required without a session 500 or demo accounts", async () => {
  delete process.env.DATABASE_URL;
  const db = await initDb(":memory:");
  const server = (await createApp(db)).listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/session`);
    assert.equal(response.status, 200);
    const session = await response.json();
    assert.equal(session.setup_required, true);
    assert.equal(session.user, null);
    assert.equal(session.training_accounts_visible, false);
    assert.equal(typeof session.hospital.name, "string");
    assert.equal((await one(db, "SELECT count(*)::int n FROM users")).n, 0);
    assert.equal((await one(db, "SELECT count(*)::int n FROM patients")).n, 0);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.close();
  }
});

test("explicit first-run setup creates one usable admin, no demo data, and cannot reset existing users", async () => {
  delete process.env.DATABASE_URL;
  const db = await initDb(":memory:");
  const password = "Isolated-test-setup-2026!";
  let server: ReturnType<Awaited<ReturnType<typeof createApp>>["listen"]> | undefined;
  try {
    await assert.rejects(setupSystem(db, { username: "admin", password: "short", hospitalName: "Test NICU" }), /password/);
    assert.equal((await one(db, "SELECT count(*)::int n FROM users")).n, 0);
    await setupSystem(db, { username: "AuditAdmin", password, hospitalName: "Test NICU" });
    assert.equal((await one(db, "SELECT count(*)::int n FROM users")).n, 1);
    for (const table of ["patients", "admissions", "beds", "payments"])
      assert.equal((await one(db, `SELECT count(*)::int n FROM ${table}`)).n, 0);
    await assert.rejects(setupSystem(db, { username: "other", password: "Different-setup-password!", hospitalName: "Other" }), /already has users/);
    const user = await one(db, "SELECT * FROM users WHERE username='auditadmin'");
    assert.ok(verifyPassword(password, user.password_hash));
    assert.equal((await one(db, "SELECT data FROM settings WHERE id='hospital'")).data.name, "Test NICU");
    server = (await createApp(db)).listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    const session = await (await fetch(base + "/api/session")).json();
    assert.equal(session.setup_required, false);
    const login = await fetch(base + "/api/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ username: "AuditAdmin", password }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    for (const route of ["dashboard", "patients", "beds", "users", "billing", "inventory", "security"]) {
      const response = await fetch(base + "/api/" + route, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200, `${route}: ${await response.text()}`);
    }
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await db.close();
  }
});
