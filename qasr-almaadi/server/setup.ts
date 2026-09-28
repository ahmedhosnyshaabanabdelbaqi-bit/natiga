import type { Database } from "./db.js";
import { one } from "./db.js";
import { defaultRoles, hashPassword } from "./security.js";

export const defaultHospital = {
  name: "نظام إدارة المستشفى",
  address: "",
  phone: "",
  logo: "",
  reservation_hours: 4,
  timezone: "Africa/Cairo",
  currency: "EGP",
  mode: "live",
};

// Explicit offline setup only. Never create demo patients or reset an account.
export async function setupSystem(
  db: Database,
  options: { username: string; password: string; hospitalName: string },
) {
  const username = options.username.trim().toLowerCase();
  const hospitalName = options.hospitalName.trim();
  if (!/^[a-z0-9_.-]{3,64}$/.test(username))
    throw new Error("Administrator username must be 3–64 letters, digits, dots, underscores or hyphens.");
  if (options.password.length < 16 || options.password.length > 256 || options.password !== options.password.trim())
    throw new Error("Provide an administrator password of 16–256 characters without surrounding whitespace.");
  if (!hospitalName || hospitalName.length > 160)
    throw new Error("Provide a hospital name of 1–160 characters.");
  return db.transaction(async tx => {
    await tx.query("LOCK TABLE users IN EXCLUSIVE MODE");
    if (await one(tx, "SELECT id FROM users LIMIT 1"))
      throw new Error("Setup refused: this installation already has users. Existing accounts are never reset.");
    for (const [name, permissions] of Object.entries(defaultRoles))
      await tx.query("INSERT INTO roles(name,permissions) VALUES($1,$2) ON CONFLICT(name) DO NOTHING", [name, JSON.stringify(permissions)]);
    await tx.query("INSERT INTO settings(id,data) VALUES('hospital',$1) ON CONFLICT(id) DO NOTHING", [JSON.stringify({ ...defaultHospital, name: hospitalName })]);
    await tx.query("INSERT INTO users(id,name,username,password_hash,role) VALUES('admin',$1,$2,$3,'admin')", ["مسؤول النظام", username, hashPassword(options.password)]);
    return { username, hospital: hospitalName };
  });
}
