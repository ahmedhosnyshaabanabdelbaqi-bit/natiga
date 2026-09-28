/*
 * Real-browser check of the bundled 360° viewer (assets/panorama/viewer.html
 * + viewer.js + vendored Pannellum) — the part `flutter test` cannot run.
 *
 * Drives the page exactly like the app does (same JSON protocol, images as
 * base64 chunks) in headless Chromium with software WebGL, using SYNTHETIC
 * grid panoramas generated in the browser and labelled "TEST ONLY — NOT A
 * CAR INTERIOR" (no real imagery). Checks: handshake, preview → full swap,
 * hotspot DOM is text only, tap → message, drag/zoom/look/reset, scene
 * switch, kept images on revisit, validation of hostile messages, frozen
 * bridge, multires fallback, CSP blocking other origins, no network use.
 *
 * Run (Node 22 + Playwright; not part of `flutter test`):
 *   node test/features/tours/browser/viewer_browser_check.mjs [screenshotDir]
 * Env: PLAYWRIGHT_MODULE (default /opt/node22/lib/node_modules/playwright),
 *      CHROMIUM_PATH (default: Playwright's bundled Chromium).
 * Exit code 1 when a check fails.
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(HERE, '../../../..');
const tour = JSON.parse(fs.readFileSync(`${MOBILE}/test/features/tours/fixtures/tour_detail_en.json`)).data;
const out = process.argv[2] || fs.mkdtempSync('/tmp/viewer-check-');

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
// Synthetic 2:1 grid panoramas (TEST ONLY), JPEG bytes.
const gen = await browser.newPage();
async function synthetic(width, hue, label) {
  const b64 = await gen.evaluate(({ width, hue, label }) => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = width / 2;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, `hsl(${hue},80%,55%)`);
    grad.addColorStop(1, `hsl(${hue},60%,15%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    for (let d = 0; d <= 360; d += 15) { const x = (d / 360) * c.width; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
    for (let d = 0; d <= 180; d += 15) { const y = (d / 180) * c.height; g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
    g.fillStyle = '#fff';
    g.font = `bold ${Math.round(width / 40)}px sans-serif`;
    g.textAlign = 'center';
    for (const x of [0.25, 0.5, 0.75]) g.fillText(label, x * c.width, c.height / 2);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  }, { width, hue, label });
  return Buffer.from(b64, 'base64');
}
const images = {
  preview0: await synthetic(1024, 220, 'TEST ONLY — NOT A CAR INTERIOR (preview)'),
  full0: await synthetic(2048, 220, 'TEST ONLY — NOT A CAR INTERIOR'),
  full1: await synthetic(2048, 150, 'TEST ONLY — SECOND SCENE'),
};
await gen.close();

const page = await browser.newPage({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 1 });
const consoleMsgs = [];
page.on('console', (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => consoleMsgs.push(`[pageerror] ${e.message}`));
const requests = [];
page.on('request', (r) => requests.push(r.url()));
await page.addInitScript(() => {
  window.__msgs = [];
  window.EvcarBridge = { postMessage: (s) => window.__msgs.push(JSON.parse(s)) };
});
await page.goto(`file://${MOBILE}/assets/panorama/viewer.html`);
const msgs = () => page.evaluate(() => window.__msgs);
async function waitFor(pred, what, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const m = (await msgs()).find(pred);
    if (m) return m;
    await page.waitForTimeout(100);
  }
  throw new Error('timeout waiting for ' + what + '\n' + JSON.stringify(await msgs()) + '\n' + consoleMsgs.join('\n'));
}
const send = (obj) => page.evaluate((s) => window.evcarViewer.receive(s), JSON.stringify(obj));
const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); };

const ready = await waitFor((m) => m.type === 'ready', 'ready');
ok('ready v2 + webgl', ready.v === 2 && ready.webgl === true, `maxTextureSize=${ready.maxTextureSize}`);

// Invalid before init.
await send({ type: 'show', sceneId: 'x' });
ok('command before init rejected', (await msgs()).some((m) => m.type === 'error' && m.code === 'NOT_INITIALIZED'));

const init = {
  type: 'init', v: 2, mediaOrigin: tour.mediaOrigin, allowInsecure: true, locale: 'ar',
  strings: { loading: 'جارٍ التحميل…', loadFailed: 'تعذّر التحميل', webglUnsupported: 'WebGL غير متاح' },
  firstSceneId: tour.initialSceneId,
  scenes: tour.scenes.map((s) => ({
    id: s.id, title: s.title, view: s.view, multires: null,
    hotspots: s.hotspots.map((h) => ({ id: h.id, kind: h.type === 'scene_link' ? 'scene' : 'info', icon: h.type === 'scene_link' ? 'scene' : (h.type === 'spec_link' ? 'spec' : 'info'), yaw: h.yaw, pitch: h.pitch, label: h.title })),
  })),
};
// Hostile label must stay text.
init.scenes[0].hotspots[0].label = '<img src=x onerror=alert(1)>Info';
await send(init);
const need = await waitFor((m) => m.type === 'needImages', 'needImages');
ok('needImages for first scene', need.sceneId === tour.initialSceneId);

async function sendImage(sceneId, quality, bytes) {
  const chunk = 192 * 1024;
  const total = Math.ceil(bytes.length / chunk);
  for (let i = 0; i < total; i++) {
    await send({ type: 'image', sceneId, quality, mime: 'image/jpeg', seq: i, total, data: bytes.subarray(i * chunk, (i + 1) * chunk).toString('base64') });
  }
}
const s0 = tour.scenes[0], s1 = tour.scenes[1];
const t0 = Date.now();
await sendImage(s0.id, 'preview', images.preview0);
await waitFor((m) => m.type === 'sceneShown' && m.quality === 'preview', 'preview shown');
ok('preview shown', true, `${Date.now() - t0} ms`);
await page.screenshot({ path: `${out}/1-preview.png` });
await sendImage(s0.id, 'full', images.full0);
await waitFor((m) => m.type === 'sceneShown' && m.quality === 'full' && m.sceneId === s0.id, 'full shown');
ok('full quality swapped in', true, `${Date.now() - t0} ms`);
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/2-full.png` });

// Hotspot DOM: text only.
const hs = await page.evaluate(() => [...document.querySelectorAll('.evcar-hotspot')].map((d) => ({ label: d.getAttribute('aria-label'), imgs: d.querySelectorAll('img').length })));
ok('hotspots rendered', hs.length === 3, JSON.stringify(hs));
ok('hostile label not parsed as HTML', hs.every((h) => h.imgs === 0) && hs.some((h) => h.label.startsWith('<img')));
ok('no alert/injected img', (await page.evaluate(() => document.querySelectorAll('img[src="x"]').length)) === 0);

// Tap a hotspot (visible one at yaw 0 pitch -15).
const box = await page.evaluate(() => { const d = [...document.querySelectorAll('.evcar-hotspot')].find((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().top > 0 && e.getBoundingClientRect().top < innerHeight); if (!d) return null; const r = d.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
if (box) { await page.mouse.click(box.x, box.y); }
const tapped = await waitFor((m) => m.type === 'hotspot', 'hotspot', 3000).catch(() => null);
ok('hotspot tap posts message', !!tapped, JSON.stringify(tapped));

// Drag (look around) and controls.
await page.mouse.move(200, 400); await page.mouse.down(); await page.mouse.move(80, 350, { steps: 8 }); await page.mouse.up();
await send({ type: 'zoom', direction: 'in' });
await send({ type: 'look', yawDelta: 10, pitch: 5 });
await send({ type: 'resetView' });
await page.waitForTimeout(700);
ok('controls accepted without errors', !(await msgs()).some((m) => m.type === 'error' && m.code !== 'NOT_INITIALIZED'));

// Scene switch → rear.
await send({ type: 'show', sceneId: s1.id, yaw: 0, pitch: 0 });
await waitFor((m) => m.type === 'needImages' && m.sceneId === s1.id, 'needImages rear');
await sendImage(s1.id, 'full', images.full1);
await waitFor((m) => m.type === 'sceneShown' && m.sceneId === s1.id, 'rear shown');
ok('scene switch to rear', true);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/3-rear.png` });
// Back to driver: blobs kept → no needImages.
const n0 = (await msgs()).length;
await send({ type: 'show', sceneId: s0.id });
await waitFor((m) => m.type === 'sceneShown' && m.sceneId === s0.id && m.quality === 'full', 'driver again');
const again = (await msgs()).slice(n0).some((m) => m.type === 'needImages');
ok('revisit uses kept image', !again);

// Validation.
const errBefore = (await msgs()).filter((m) => m.type === 'error').length;
for (const bad of ['not json', '[]', JSON.stringify({ type: 'nope' }), JSON.stringify({ type: 'show', sceneId: '../x' }), JSON.stringify({ type: 'image', sceneId: s0.id, quality: 'full', mime: 'text/html', seq: 0, total: 1, data: 'PGgxPg==' }), JSON.stringify({ type: 'image', sceneId: s0.id, quality: 'full', mime: 'image/jpeg', seq: 0, total: 1, data: 'PGgxPg==' }), JSON.stringify({ type: 'init', v: 2 })]) {
  await page.evaluate((s) => window.evcarViewer.receive(s), bad);
}
const errs = (await msgs()).filter((m) => m.type === 'error').slice(errBefore);
ok('7 invalid messages → 7 error replies', errs.length === 7, errs.map((e) => e.code).join(','));
ok('viewer still alive', (await page.evaluate(() => typeof window.evcarViewer.receive)) === 'function');
ok('evcarViewer frozen', await page.evaluate(() => { try { window.evcarViewer = null; } catch (e) {} return typeof window.evcarViewer.receive === 'function'; }));

// Multires on a path without tiles → multiresFailed (probe), no crash.
await page.evaluate(() => { window.__msgs.length = 0; });
// reinit not allowed; test useMultires on scene without config
await send({ type: 'useMultires', sceneId: s0.id });
ok('useMultires without tiles → multiresFailed', !!(await waitFor((m) => m.type === 'multiresFailed', 'multiresFailed', 3000).catch(() => null)));

// CSP: try loading a remote image/script from page context → blocked.
const blocked = await page.evaluate(() => new Promise((res) => { const i = new Image(); i.onload = () => res('loaded'); i.onerror = () => res('blocked'); i.src = 'https://example.com/x.png'; setTimeout(() => res('timeout'), 3000); }));
ok('CSP blocks other origins', blocked === 'blocked', blocked);
const netOut = requests.filter((u) => !u.startsWith('file:') && !u.startsWith('blob:') && !u.startsWith('data:'));
ok('no network requests except blocked probe', netOut.every((u) => u.startsWith('https://example.com') || u.startsWith('http://localhost:3108')), JSON.stringify(netOut));

await send({ type: 'destroy' });
fs.writeFileSync(`${out}/console.txt`, consoleMsgs.join('\n'));
console.log(results.join('\n'));
console.log(`screenshots + console log: ${out}`);
await browser.close();
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
