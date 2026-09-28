import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { signUpdate, validateUpdate, safeReleasePath, UpdateError } from "../scripts/update-package.js";

const keys = generateKeyPairSync("ed25519");
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
const release = { version: "1.1.1", sequence: 16, schema: 21 };
const current = { version: "1.1.0", sequence: 15, schema: 21 };
function files() {
  return Object.entries({
    "package.json": JSON.stringify({ name: "qasr-almaadi-nicu", version: release.version }),
    "package-lock.json": JSON.stringify({ name: "qasr-almaadi-nicu", version: release.version, lockfileVersion: 3, packages: { "": { version: release.version } } }),
    "server/index.ts": "export {};",
    "server/app.ts": "export {};",
    "server/db.ts": "export {};",
    "server/security.ts": "export {};",
    "server/migrations/021_test.sql": "SELECT 1;",
    "dist/index.html": "<!doctype html><title>Test</title>",
  }).map(([path, content]) => ({ path, content: Buffer.from(content).toString("base64") }));
}
const error = (code: string) => (value: unknown) => value instanceof UpdateError && value.code === code;

test("signed updates accept a valid newer release and reject tampering and other signing keys", () => {
  const value = signUpdate(files(), release, "Audit fixture", keys.privateKey);
  assert.equal(validateUpdate(value, publicKey, current).files.size, 8);
  const modified = structuredClone(value);
  modified.files[2].content = Buffer.from("Modified contents").toString("base64");
  assert.throws(() => validateUpdate(modified, publicKey, current), error("UPDATE_HASH"));
  const forged = structuredClone(value);
  forged.manifest.notes = "Forged manifest";
  assert.throws(() => validateUpdate(forged, publicKey, current), error("UPDATE_SIGNATURE"));
  const otherKey = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
  assert.throws(() => validateUpdate(value, otherKey, current), error("UPDATE_SIGNATURE"));
});

test("updates reject traversal, private paths, duplicate file names and version rollback", () => {
  for (const path of ["../server/index.ts", "server/../../data.json", "/server/app.ts", "server\\app.ts", "data/patients.json", ".env", "public/NUL.js", "server/.hidden.json"])
    assert.equal(safeReleasePath(path), false, path);
  const badPath = signUpdate([...files(), { path: "../outside.js", content: "" }], release, "", keys.privateKey);
  assert.throws(() => validateUpdate(badPath, publicKey, current), error("UPDATE_PATH"));
  const duplicate = signUpdate([...files(), { path: "server/APP.ts", content: "" }], release, "", keys.privateKey);
  assert.throws(() => validateUpdate(duplicate, publicKey, current), error("UPDATE_PATH"));
  for (const next of [{ ...release, version: "1.0.9" }, { ...release, sequence: 15 }, { ...release, schema: 20 }])
    assert.throws(() => validateUpdate(signUpdate(files(), next, "", keys.privateKey), publicKey, current), error("UPDATE_VERSION"));
});
