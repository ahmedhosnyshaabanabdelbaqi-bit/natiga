import { test } from "node:test";
import assert from "node:assert/strict";
import { initDb, one } from "../server/db.js";
import { createApp } from "../server/app.js";

test("purchasing can open its dashboard without clinical or financial access", async () => {
  delete process.env.DATABASE_URL;
  const db = await initDb(":memory:");
  const server = (await createApp(db, { seed: true })).listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const login = await fetch(base + "/api/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ username: "purchasing", password: "Training@2026" }) });
    assert.equal(login.status, 200);
    const headers = { Cookie: login.headers.get("set-cookie")!.split(";")[0] };
    const response = await fetch(base + "/api/dashboard", { headers });
    assert.equal(response.status, 200);
    const dashboard = await response.json();
    assert.equal(dashboard.stats.stock_items, (await one(db, "SELECT count(*)::int n FROM inventory")).n);
    assert.equal(typeof dashboard.stats.pending_purchases, "number");
    assert.deepEqual(dashboard.patients, []);
    assert.deepEqual(dashboard.tasks, []);
    assert.deepEqual(dashboard.occupancy, []);
    assert.equal(dashboard.trends, null);
    for (const key of ["revenue", "received", "outstanding", "maintenance_expenses", "net_revenue", "pending_labs"])
      assert.equal(key in dashboard.stats, false);
    for (const route of ["patients", "billing", "treasury"])
      assert.equal((await fetch(base + "/api/" + route, { headers })).status, 403);
    for (const route of ["inventory", "purchase-orders", "stock-requests"])
      assert.equal((await fetch(base + "/api/" + route, { headers })).status, 200);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.close();
  }
});
