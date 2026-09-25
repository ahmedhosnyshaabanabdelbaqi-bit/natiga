/*
 * Headless check of assets/panorama/viewer.js (message validation, CSP
 * tightening, textContent-only hotspots) using jsdom and a stub of the
 * Pannellum API. It does NOT test WebGL rendering — that needs a device or a
 * real browser (see docs/decisions/mobile.md).
 *
 * Run from mobile/ (jsdom is not a project dependency):
 *   npm i --prefix /tmp/viewer-check jsdom@30.1.1
 *   NODE_PATH=/tmp/viewer-check/node_modules node tool/viewer_bridge_check.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..', 'assets', 'panorama');
const html = fs.readFileSync(path.join(root, 'viewer.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'viewer.js'), 'utf8');

function setup() {
  // Scripts are injected manually so the real pannellum.js is not needed.
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
    runScripts: 'outside-only',
    url: 'file:///android_asset/flutter_assets/assets/panorama/viewer.html',
  });
  const w = dom.window;
  const posted = [];
  w.EvcarBridge = { postMessage: (s) => posted.push(JSON.parse(s)) };
  const calls = { configs: [], loadScene: [], orientation: [], destroyed: 0 };
  const handlers = {};
  w.pannellum = {
    viewer(id, config) {
      calls.configs.push(config);
      return {
        on: (ev, fn) => (handlers[ev] = fn),
        getScene: () => config.default.firstScene,
        getConfig: () => ({ pitch: 1, yaw: 2, hfov: 90 }),
        setPitch() {},
        setYaw() {},
        setHfov() {},
        loadScene: (s) => calls.loadScene.push(s),
        isOrientationSupported: () => false,
        startOrientation: () => calls.orientation.push('start'),
        stopOrientation: () => calls.orientation.push('stop'),
        destroy: () => calls.destroyed++,
      };
    },
  };
  w.eval(js);
  return { w, posted, calls, handlers, send: (m) => w.evcarViewer.receive(JSON.stringify(m)) };
}

const tour = {
  firstScene: 'driver',
  scenes: [
    {
      id: 'driver',
      title: 'Driver seat',
      panorama: 'https://media.evcar.news/t/1/driver_4096.jpg',
      preview: 'https://media.evcar.news/t/1/driver_preview.jpg',
      yaw: 10,
      pitch: -5,
      hfov: 100,
      hotspots: [
        { id: 'screen', kind: 'info', yaw: 0, pitch: -10, text: '<img src=x onerror=alert(1)>Screen 15.6"' },
        { id: 'to-rear', kind: 'scene', yaw: 180, pitch: 0, text: 'Rear seats', targetSceneId: 'rear' },
        { id: 'bad id!', kind: 'info', yaw: 0, pitch: 0, text: 'dropped' },
        { id: 'weird', kind: 'script', yaw: 0, pitch: 0, text: 'dropped' },
      ],
    },
    { id: 'rear', title: 'Rear', panorama: 'https://media.evcar.news/t/1/rear_4096.jpg', yaw: 999, pitch: -999 },
  ],
};

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}

check('announces ready and exposes a frozen API', () => {
  const { w, posted } = setup();
  assert.deepStrictEqual(posted, [{ type: 'ready' }]);
  assert.ok(Object.isFrozen(w.evcarViewer));
  assert.throws(() => {
    w.evcarViewer = null; // non-writable: page content cannot replace the bridge
  }, TypeError);
  assert.ok(w.evcarViewer && typeof w.evcarViewer.receive === 'function');
});

check('rejects malformed messages and commands before init', () => {
  const { w, posted, send } = setup();
  w.evcarViewer.receive('not json');
  send({ nope: 1 });
  send({ type: 'setScene', sceneId: 'rear' });
  send({ type: 'launchMissiles' });
  const codes = posted.slice(1).map((m) => m.code);
  assert.deepStrictEqual(codes, ['INVALID_MESSAGE', 'INVALID_MESSAGE', 'NOT_INITIALIZED', 'INVALID_MESSAGE']);
});

check('rejects non-https / foreign-origin media and bad versions', () => {
  for (const bad of [
    { mediaOrigin: 'http://media.evcar.news' },
    { mediaOrigin: 'https://media.evcar.news', tour: { scenes: [{ id: 'a', panorama: 'https://evil.test/a.jpg' }] } },
    { mediaOrigin: 'https://media.evcar.news', tour: { scenes: [{ id: 'a', panorama: 'javascript:alert(1)' }] } },
    { version: 2 },
  ]) {
    const { posted, calls, send } = setup();
    send(Object.assign({ type: 'init', version: 1, mediaOrigin: 'https://media.evcar.news', tour }, bad));
    assert.strictEqual(calls.configs.length, 0, JSON.stringify(bad));
    assert.strictEqual(posted[posted.length - 1].code, 'INVALID_MESSAGE');
  }
});

check('valid init builds a clamped config, tightens CSP, and filters hotspots', () => {
  const { w, calls, send } = setup();
  send({ type: 'init', version: 1, mediaOrigin: 'https://media.evcar.news', locale: 'ar', strings: { loading: 'جارٍ التحميل' }, tour });
  assert.strictEqual(calls.configs.length, 1);
  const cfg = calls.configs[0];
  assert.strictEqual(cfg.default.firstScene, 'driver');
  assert.strictEqual(cfg.default.escapeHTML, true);
  assert.strictEqual(cfg.default.showFullscreenCtrl, false);
  assert.strictEqual(cfg.default.strings.loadingLabel, 'جارٍ التحميل');
  assert.strictEqual(cfg.scenes.rear.yaw, 180);
  assert.strictEqual(cfg.scenes.rear.pitch, -90);
  const hs = cfg.scenes.driver.hotSpots;
  assert.deepStrictEqual(Array.from(hs, (h) => h.id), ['screen', 'to-rear']); // node-realm array
  assert.strictEqual(hs[1].type, 'scene');
  assert.strictEqual(hs[1].sceneId, 'rear');
  const metas = [...w.document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')].map((m) => m.content);
  assert.strictEqual(metas.length, 2);
  assert.ok(metas[1].includes('img-src') && metas[1].includes('https://media.evcar.news'));
  assert.strictEqual(w.document.documentElement.lang, 'ar');
});

check('hotspot text is rendered as text, never parsed as HTML; clicks are reported', () => {
  const { w, posted, calls, send } = setup();
  send({ type: 'init', version: 1, mediaOrigin: 'https://media.evcar.news', tour });
  const hs = calls.configs[0].scenes.driver.hotSpots[0];
  const div = w.document.createElement('div');
  hs.createTooltipFunc(div, hs.createTooltipArgs);
  assert.strictEqual(div.querySelector('img'), null);
  assert.strictEqual(div.querySelector('.evcar-tooltip').textContent, '<img src=x onerror=alert(1)>Screen 15.6"');
  assert.strictEqual(div.getAttribute('role'), 'button');
  hs.clickHandlerFunc();
  assert.deepStrictEqual(posted[posted.length - 1], { type: 'hotspotClicked', sceneId: 'driver', hotspotId: 'screen' });
});

check('scene changes, orientation and destroy', () => {
  const { posted, calls, handlers, send } = setup();
  send({ type: 'init', version: 1, mediaOrigin: 'https://media.evcar.news', tour });
  send({ type: 'setScene', sceneId: 'rear' });
  assert.deepStrictEqual(calls.loadScene, ['rear']);
  handlers.scenechange('rear');
  assert.deepStrictEqual(posted[posted.length - 1], { type: 'sceneChanged', sceneId: 'rear' });
  send({ type: 'setOrientation', enabled: true });
  assert.deepStrictEqual(posted[posted.length - 1], { type: 'orientation', state: 'unavailable' });
  handlers.error('404');
  assert.strictEqual(posted[posted.length - 1].code, 'LOAD_FAILED');
  send({ type: 'destroy' });
  assert.strictEqual(calls.destroyed, 1);
  assert.ok(calls.orientation.includes('stop'));
});

check('mediaOrigin cannot be changed after the first init', () => {
  const { posted, send } = setup();
  send({ type: 'init', version: 1, mediaOrigin: 'https://media.evcar.news', tour });
  send({ type: 'init', version: 1, mediaOrigin: 'https://other.test', tour });
  assert.strictEqual(posted[posted.length - 1].message, 'mediaOrigin cannot change');
});

console.log(`\n${passed} checks passed`);
