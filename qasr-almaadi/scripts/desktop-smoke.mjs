// Smoke test for the desktop bundle: first-run setup, login, static UI, reports assets,
// close + reopen of the same data directory (what a real restart does).
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
execFileSync(process.execPath, ["scripts/build-desktop.mjs"], { stdio: "inherit" });
const engine = await import(pathToFileURL(path.join(root, "electron/server.mjs")).href);

const dir = mkdtempSync(path.join(tmpdir(), "qasr-smoke-"));
const password = "Smoke-Test-Password-2026";
try {
  let db = await engine.initDb(dir);
  assert.equal(await engine.hasUsers(db), false, "fresh install must ask for setup");
  await engine.setupSystem(db, { username: "admin", password, hospitalName: "قصر المعادي" });
  assert.equal(await engine.hasUsers(db), true);
  let server = await engine.serve(db, { staticDir: path.join(root, "dist"), port: 4380 });
  const base = `http://127.0.0.1:${server.port}`;

  const home = await fetch(base + "/");
  assert.equal(home.status, 200);
  assert.match(await home.text(), /<div id="root">/);
  assert.equal((await fetch(base + "/some/client/route")).status, 200, "SPA fallback");
  const anon = await (await fetch(base + "/api/session")).json();
  assert.ok(!anon.user, "anonymous session has no user");

  const login = await fetch(base + "/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password }),
  });
  assert.equal(login.status, 200, "login");
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("nicu_session="), "session cookie issued");
  assert.doesNotMatch(login.headers.get("set-cookie"), /Secure/i, "cookie must work over http://127.0.0.1");
  const me = await fetch(base + "/api/session", { headers: { cookie } });
  assert.equal((await me.json()).user?.username, "admin", "session accepted");
  const font = await fetch(base + "/api/print-font?subset=arabic", { headers: { cookie } });
  assert.equal(font.status, 200, "bundled print font is reachable");

  const other = await engine.serve(db, { staticDir: path.join(root, "dist"), port: server.port });
  assert.notEqual(other.port, server.port, "busy port falls back to the next free one");
  await other.close();

  await server.close();
  await db.close();

  // Restart on the same data: no setup prompt and the admin still exists.
  db = await engine.initDb(dir);
  assert.equal(await engine.hasUsers(db), true, "data survives a restart");
  await db.close();
  console.log("desktop smoke test: OK");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
