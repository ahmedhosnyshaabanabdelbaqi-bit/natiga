// Bundles the Express/PGlite server for the Electron shell into electron/server.mjs.
// PGlite and pg stay external: PGlite loads its WASM/data files from node_modules at runtime.
import { build } from "esbuild";
import { cp, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "electron");

await build({
  entryPoints: [path.join(root, "server/desktop.ts")],
  outfile: path.join(out, "server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["@electric-sql/pglite", "pg", "pg-native"],
  // Some bundled CommonJS dependencies (express) call require() at runtime.
  banner: {
    js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);',
  },
  logLevel: "info",
});

// db.ts resolves ./migrations and ../migration-overrides relative to the bundle.
for (const dir of ["migrations", "migration-overrides"]) {
  await rm(path.join(out, dir), { recursive: true, force: true });
  await mkdir(path.join(out, dir), { recursive: true });
  await cp(path.join(root, "server", dir), path.join(out, dir), { recursive: true });
}
console.log("Desktop server bundle ready:", path.join(out, "server.mjs"));
