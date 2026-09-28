import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { collectRelease, signUpdate, validateUpdate } from './update-package.js';

// Secret material is read from a protected file, never from a command argument.
const [source, sequenceText, output] = process.argv.slice(2);
if (!source || !sequenceText || !output || !process.env.UPDATE_SIGNING_KEY_FILE) throw Error('Usage: UPDATE_SIGNING_KEY_FILE=<protected PEM path> tsx scripts/build-update.ts <built app directory> <release sequence> <new output.nicu-update>');
const appDir = resolve(source), files = collectRelease(appDir);
const pkg = JSON.parse(readFileSync(resolve(appDir, 'package.json'), 'utf8'));
const schema = Math.max(...files.map(file => Number(/^server\/migrations\/(\d+)_.*\.sql$/.exec(file.path)?.[1] || 0)));
const privateKey = createPrivateKey(readFileSync(process.env.UPDATE_SIGNING_KEY_FILE));
if (privateKey.asymmetricKeyType !== 'ed25519') throw Error('An Ed25519 release signing key is required.');
const value = signUpdate(files, { version: pkg.version, sequence: Number(sequenceText), schema }, process.env.UPDATE_RELEASE_NOTES || '', privateKey);
const checked = validateUpdate(value, createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString());
writeFileSync(resolve(output), JSON.stringify(value), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ version: checked.manifest.version, sequence: checked.manifest.sequence, files: files.length, content_bytes: checked.bytes, manifest_sha256: checked.digest, output: resolve(output) }));
