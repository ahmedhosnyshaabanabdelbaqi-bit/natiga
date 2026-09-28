import fs from "node:fs";
import assert from "node:assert/strict";

const origin = "https://child.egsystem.net";
const password = fs.readFileSync("output/PRIVATE-HOST-ACCESS.txt", "utf8").match(/^Initial password: (.+)$/m)?.[1];
if (!password) throw Error("Access file missing");
async function session(role) {
  const login = await fetch(origin + "/api/login", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ username: role, password }),
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(login.status, 200, role + " login");
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const get = async (path) => {
    const response = await fetch(origin + "/api" + path, {
      headers: { Origin: origin, Cookie: cookie, "Accept-Language": "en" },
      signal: AbortSignal.timeout(20000),
    });
    const body = await response.json();
    assert.equal(response.status, 200, role + " " + path + " " + JSON.stringify(body));
    return body;
  };
  return { me: await get("/session"), get };
}

const reception = await session("reception");
assert.ok(reception.me.user.permissions.includes("purchase.request"));
assert.ok(!reception.me.user.permissions.includes("purchase.approve"));
const catalog = await reception.get("/purchase-orders/catalog");
assert.ok(catalog.every((item) => Object.keys(item).sort().join(",") === "id,name,sku,unit"));
const receptionOrders = await reception.get("/purchase-orders");
assert.ok(receptionOrders.every((order) =>
  !["total_amount", "money_account_id", "payment_method", "account_name"].some((key) => key in order) &&
  order.lines.every((line) => !["unit_cost", "received_quantity", "inventory_id"].some((key) => key in line))
));

const accountant = await session("accountant");
assert.ok(accountant.me.user.permissions.includes("purchase.approve"));
const report = await accountant.get("/reports");
for (const key of ["purchase_expenses", "maintenance_expenses", "net_revenue"]) assert.ok(key in report.billing);

const admin = await session("admin");
const security = await admin.get("/security");
assert.equal(security.additional_verification, false);

console.log(JSON.stringify({
  status: "PASS",
  release: (await fetch(origin + "/api/health").then((response) => response.json())).release,
  checks: [
    "Reception purchase request permission without approval",
    "Reception catalog and orders contain no prices or financial accounts",
    "Accounts can approve and receives purchase and maintenance expense reporting",
    "Additional verification disabled",
  ],
}));
