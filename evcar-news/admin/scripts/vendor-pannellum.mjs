// Copies the self-hosted Pannellum viewer (npm package "pannellum") into
// public/vendor/pannellum/ so the tour editor can load it from our own origin
// (no CDN). Re-run after bumping the pannellum version:
//   npm run vendor:pannellum
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', 'pannellum');
const outDir = join(root, 'public', 'vendor', 'pannellum');

if (!existsSync(pkgDir)) {
  console.error('pannellum is not installed. Run `npm install` first.');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const files = [
  ['build/pannellum.js', 'pannellum.js'],
  ['build/pannellum.css', 'pannellum.css'],
  ['COPYING', 'LICENSE'],
];

mkdirSync(outDir, { recursive: true });
for (const [from, to] of files) {
  const src = join(pkgDir, from);
  if (!existsSync(src)) {
    console.error(`Missing ${from} in pannellum@${pkg.version}`);
    process.exit(1);
  }
  copyFileSync(src, join(outDir, to));
}
writeFileSync(
  join(outDir, 'VERSION.json'),
  JSON.stringify({ name: 'pannellum', version: pkg.version, license: pkg.license }, null, 2) + '\n',
);
console.log(`Vendored pannellum@${pkg.version} into public/vendor/pannellum/`);
