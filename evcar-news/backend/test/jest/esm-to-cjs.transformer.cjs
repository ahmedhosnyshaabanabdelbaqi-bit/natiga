/**
 * Jest transformer for ESM-only dependencies.
 *
 * NestJS 12 (and a few other deps such as file-type, uuid) ship ESM only.
 * Node 22 can `require()` ESM natively, so the compiled app runs fine, but the
 * Jest 30 module runtime only supports require(esm) on Node >= 24.9. This
 * transformer converts ESM files (detected exactly like Node does: `.mjs`, or
 * the nearest package.json has "type": "module") to CommonJS using the
 * TypeScript compiler that is already a dev dependency. CommonJS files are
 * returned untouched. See docs/decisions/backend-core.md.
 */
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const TRANSFORMER_VERSION = '2';
const FILE_URL = 'require("node:url").pathToFileURL(__filename).href';

/** Rewrites ESM-only `import.meta` usages into their CommonJS equivalents. */
function rewriteImportMeta(code) {
  if (!code.includes('import.meta')) return code;
  return code
    .replace(
      /\b(?:const|let|var)\s+require\s*=\s*(?:\(0,\s*)?(?:[\w$]+\.)?createRequire\)?\(\s*import\.meta\.url\s*\)\s*;?/g,
      '',
    )
    .replace(/(?:\(0,\s*)?(?:[\w$]+\.)?createRequire\)?\(\s*import\.meta\.url\s*\)/g, 'require')
    .replace(/import\.meta\.url/g, FILE_URL)
    .replace(/import\.meta\.dirname/g, '__dirname')
    .replace(/import\.meta\.filename/g, '__filename')
    .replace(
      /import\.meta/g,
      `({ url: ${FILE_URL}, dirname: __dirname, filename: __filename })`,
    );
}
const typeCache = new Map();

function nearestPackageIsModule(dir) {
  const visited = [];
  let current = dir;
  let result = false;
  for (;;) {
    if (typeCache.has(current)) {
      result = typeCache.get(current);
      break;
    }
    visited.push(current);
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        result = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).type === 'module';
      } catch {
        result = false;
      }
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  for (const d of visited) typeCache.set(d, result);
  return result;
}

function isEsm(filename) {
  if (filename.endsWith('.mjs')) return true;
  if (filename.endsWith('.cjs')) return false;
  return nearestPackageIsModule(path.dirname(filename));
}

module.exports = {
  canInstrument: false,
  getCacheKey(sourceText, sourcePath) {
    return crypto
      .createHash('sha256')
      .update(TRANSFORMER_VERSION)
      .update('\0')
      .update(ts.version)
      .update('\0')
      .update(sourcePath)
      .update('\0')
      .update(sourceText)
      .digest('hex');
  },
  process(sourceText, sourcePath) {
    if (!isEsm(sourcePath)) return { code: sourceText };
    const out = ts.transpileModule(sourceText, {
      fileName: sourcePath.replace(/\.mjs$/, '.js'),
      reportDiagnostics: false,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        allowJs: true,
        sourceMap: false,
      },
    });
    return { code: rewriteImportMeta(out.outputText) };
  },
};
