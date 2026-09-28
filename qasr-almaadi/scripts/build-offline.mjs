import {createHash} from "node:crypto";
import {readFile, readdir, writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const staticFiles = ["index.html", "icon.svg", "hospital-logo.png", "manifest.webmanifest", "manifest.en.webmanifest"];
async function assets(directory, prefix) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) await assets(path.join(directory, entry.name), relative);
    else if (/\.(?:js|css|woff2?|svg|png|jpe?g|webp|ico)$/i.test(entry.name)) staticFiles.push(relative);
  }
}
await assets(path.join(dist, "assets"), "assets");
staticFiles.sort();
if (staticFiles.some((file) => file.includes("..") || file.startsWith("/") || /^(?:api|auth|print|uploads|attachments)\//.test(file))) throw new Error("Unsafe offline asset path");
const template = await readFile(path.join(root, "public/sw.js"), "utf8");
const hash = createHash("sha256").update(template);
for (const file of staticFiles) hash.update(file).update(await readFile(path.join(dist, file)));
const version = hash.digest("hex").slice(0, 20);
const worker = template
  .replace('const BUILD_VERSION = "__OFFLINE_VERSION__";', `const BUILD_VERSION = ${JSON.stringify(version)};`)
  .replace("const PRECACHE_URLS = /* __OFFLINE_PRECACHE__ */ [];", `const PRECACHE_URLS = ${JSON.stringify(staticFiles.map((file) => "/" + file), null, 2)};`);
if (worker.includes("/* __OFFLINE_PRECACHE__ */")) throw new Error("Offline worker template replacement failed");
await writeFile(path.join(dist, "sw.js"), worker);
console.log(`Offline shell ${version}: ${staticFiles.length} public assets; API, sessions and patient records excluded.`);
