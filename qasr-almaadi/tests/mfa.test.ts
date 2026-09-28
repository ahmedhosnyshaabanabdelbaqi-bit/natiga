import { test } from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../server/db.js";
import { createApp } from "../server/app.js";

test("additional verification is retired from login and account security", async () => {
  delete process.env.DATABASE_URL;
  const db = await initDb(":memory:");
  const app = await createApp(db, { seed: true });
  await db.query("UPDATE users SET mfa_enabled=true,mfa_secret='OLD',mfa_pending='OLD' WHERE id='admin'");
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const login = await fetch(base + "/api/login", { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "Training@2026" }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const security = await fetch(base + "/api/security", { headers: { Cookie: cookie } }).then((r) => r.json());
    assert.equal(security.additional_verification, false);
    assert.equal("mfa_enabled" in security, false);
    const retired = await fetch(base + "/api/security/mfa/setup", { method: "POST", headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json" }, body: "{}" });
    assert.equal(retired.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db.close();
  }
});
