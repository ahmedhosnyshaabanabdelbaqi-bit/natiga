/*
 * EV Car News — isolated 360° viewer bridge, protocol version 2.
 * Dart side: lib/features/tours/domain/viewer_protocol.dart (keep in sync).
 *
 * App → viewer: window.evcarViewer.receive('<JSON string>'), called with a
 * JSON string literal by WebViewController.runJavaScript (never code).
 *   {type:"init", v:2, mediaOrigin, allowInsecure, locale, strings:{loading,
 *    loadFailed, webglUnsupported}, firstSceneId, scenes:[{id, title,
 *    view:{yaw,pitch,hfov,minHfov,maxHfov,minPitch,maxPitch,northOffset},
 *    multires:{basePath,path,fallbackPath,extension,tileResolution,maxLevel,
 *    cubeResolution}|null, hotspots:[{id, kind:"info"|"scene",
 *    icon:"info"|"scene"|"image"|"video"|"spec", yaw, pitch, label}]}]}
 *   {type:"image", sceneId, quality:"preview"|"full", mime, seq, total, data}
 *       base64 chunks of a panorama file downloaded by the app
 *   {type:"show", sceneId, yaw|null, pitch|null}
 *   {type:"useMultires", sceneId}
 *   {type:"resetView"} {type:"zoom", direction:"in"|"out"}
 *   {type:"look", yawDelta, pitch}           motion control (native sensors)
 *   {type:"pause"} {type:"resume"} {type:"destroy"}
 *
 * Viewer → app: EvcarBridge.postMessage('<JSON string>')
 *   {type:"ready", v:2, webgl, maxTextureSize}
 *   {type:"needImages", sceneId}
 *   {type:"sceneShown", sceneId, quality:"preview"|"full"|"multires"}
 *   {type:"hotspot", sceneId, hotspotId}
 *   {type:"multiresFailed", sceneId}
 *   {type:"error", code, sceneId, message}
 *     code: INVALID_MESSAGE | LOAD_FAILED | WEBGL_UNSUPPORTED |
 *           NOT_INITIALIZED | IMAGE_REJECTED | TOO_LARGE
 *
 * Security: no network access except multires tiles on mediaOrigin (a
 * second CSP added on init narrows img-src to blob:/data:/mediaOrigin);
 * every message is validated and unknown ones are ignored with an error
 * reply; hotspot labels are plain text set with textContent; the page can
 * never navigate (the app's NavigationDelegate blocks it).
 */
(function () {
  'use strict';

  var VERSION = 2;
  var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  var B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
  var MAX_RAW = 400000;
  var MAX_TEXT = 200;
  var MAX_SCENES = 32;
  var MAX_HOTSPOTS = 64;
  var MAX_CHUNKS = 256;
  var MAX_IMAGE_BYTES = 40 * 1024 * 1024;
  var KEEP_SCENES = 3; // scenes whose image blobs stay in memory
  var MIMES = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1 };
  var ICONS = { info: 1, scene: 1, image: 1, video: 1, spec: 1 };

  var viewer = null;
  var initialized = false;
  var mediaOrigin = null;
  var strings = { loading: '', loadFailed: '', webglUnsupported: '' };
  var scenes = {}; // id -> scene state
  var recent = []; // scene ids, most recent last
  var currentId = null;
  var pendingView = null; // {yaw, pitch} for the next scene switch
  var shownKey = null; // pannellum scene key on screen ("<id>~<quality>")
  var loadingKey = null;
  var paused = false;

  // ---------------------------------------------------------------- helpers

  function post(msg) {
    try {
      if (window.EvcarBridge && typeof window.EvcarBridge.postMessage === 'function') {
        window.EvcarBridge.postMessage(JSON.stringify(msg));
      }
    } catch (e) {
      /* the bridge is the only output channel */
    }
  }

  function fail(code, message, sceneId) {
    post({
      type: 'error',
      code: code,
      sceneId: sceneId && ID_RE.test(sceneId) ? sceneId : null,
      message: String(message || '').slice(0, 300),
    });
  }

  function setStatus(text) {
    var el = document.getElementById('status');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  }

  function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function num(v, min, max, fallback) {
    if (typeof v !== 'number' || !isFinite(v)) return fallback;
    return Math.min(max, Math.max(min, v));
  }

  function optNum(v, min, max) {
    return typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;
  }

  function text(v) {
    return typeof v === 'string' ? v.slice(0, MAX_TEXT) : '';
  }

  function validOrigin(v, allowInsecure) {
    if (typeof v !== 'string') return null;
    try {
      var u = new URL(v);
      var okScheme = u.protocol === 'https:' || (allowInsecure === true && u.protocol === 'http:');
      if (!okScheme || u.username || u.password) return null;
      return u.origin;
    } catch (e) {
      return null;
    }
  }

  function onMediaOrigin(v) {
    if (typeof v !== 'string' || !mediaOrigin) return null;
    try {
      var u = new URL(v);
      if (u.origin !== mediaOrigin || u.username || u.password) return null;
      return u.href.replace(/\/+$/, '');
    } catch (e) {
      return null;
    }
  }

  function webglInfo() {
    try {
      var canvas = document.createElement('canvas');
      var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { webgl: false, maxTextureSize: null };
      var max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return { webgl: true, maxTextureSize: typeof max === 'number' ? max : null };
    } catch (e) {
      return { webgl: false, maxTextureSize: null };
    }
  }

  /* Narrows the page CSP to the media origin (policies intersect). */
  function restrictToMediaOrigin(origin) {
    var meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = "img-src blob: data: " + (origin || "'none'") + '; connect-src blob:';
    document.head.appendChild(meta);
  }

  function signatureOk(bytes, mime) {
    if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (mime === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (mime === 'image/webp') {
      return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45;
    }
    return false;
  }

  // --------------------------------------------------------------- hotspots

  function hotspotDom(div, args) {
    // args = {id, label, kind, icon}; plain text only.
    div.classList.add('evcar-hotspot');
    div.classList.add('evcar-icon-' + args.icon);
    if (args.kind === 'scene') div.classList.add('scene');
    div.setAttribute('role', 'button');
    div.setAttribute('tabindex', '0');
    div.setAttribute('aria-label', args.label);
    var glyph = document.createElement('span');
    glyph.className = 'evcar-glyph';
    glyph.setAttribute('aria-hidden', 'true');
    div.appendChild(glyph);
    if (args.kind === 'scene' && args.label) {
      var tip = document.createElement('span');
      tip.className = 'evcar-label';
      tip.setAttribute('dir', 'auto');
      tip.textContent = args.label;
      div.appendChild(tip);
    }
    // Pannellum handles "click"; taps are also caught with pointer events
    // (a tap = short press that did not move), de-duplicated.
    var down = null;
    var lastFire = 0;
    function fire() {
      var now = Date.now();
      if (now - lastFire < 500) return;
      lastFire = now;
      post({ type: 'hotspot', sceneId: currentId, hotspotId: args.id });
    }
    div.addEventListener('pointerdown', function (e) {
      down = { x: e.clientX, y: e.clientY, t: Date.now() };
    });
    div.addEventListener('pointerup', function (e) {
      if (!down) return;
      var moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
      var quick = Date.now() - down.t < 600;
      down = null;
      if (moved < 12 && quick) fire();
    });
    div.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') fire();
    });
    div._evcarFire = fire;
  }

  function buildHotspot(raw) {
    if (!isObject(raw) || !ID_RE.test(raw.id)) return null;
    if (raw.kind !== 'info' && raw.kind !== 'scene') return null;
    var icon = ICONS[raw.icon] ? raw.icon : 'info';
    return {
      id: raw.id,
      kind: raw.kind,
      icon: icon,
      yaw: num(raw.yaw, -360, 360, 0),
      pitch: num(raw.pitch, -90, 90, 0),
      label: text(raw.label),
    };
  }

  function pannellumHotspots(scene) {
    var list = [];
    for (var i = 0; i < scene.hotspots.length; i++) {
      var h = scene.hotspots[i];
      list.push({
        id: h.id,
        type: 'info',
        pitch: h.pitch,
        yaw: h.yaw,
        cssClass: 'evcar-hotspot-root',
        createTooltipFunc: hotspotDom,
        createTooltipArgs: { id: h.id, label: h.label, kind: h.kind, icon: h.icon },
        clickHandlerFunc: function (e) {
          var el = e && e.currentTarget;
          if (el && typeof el._evcarFire === 'function') el._evcarFire();
        },
      });
    }
    return list;
  }

  // ----------------------------------------------------------------- scenes

  function parseScene(raw) {
    if (!isObject(raw) || !ID_RE.test(raw.id)) return null;
    var v = isObject(raw.view) ? raw.view : {};
    var hotspots = [];
    var rawHs = Array.isArray(raw.hotspots) ? raw.hotspots.slice(0, MAX_HOTSPOTS) : [];
    for (var i = 0; i < rawHs.length; i++) {
      var hs = buildHotspot(rawHs[i]);
      if (hs) hotspots.push(hs);
    }
    var multires = null;
    if (raw.multires != null) {
      var m = raw.multires;
      var base = isObject(m) ? onMediaOrigin(m.basePath) : null;
      var pathRe = /^[A-Za-z0-9_/%.-]{1,64}$/;
      if (
        !base ||
        !pathRe.test(m.path) ||
        !pathRe.test(m.fallbackPath) ||
        !/^(jpg|png|webp)$/.test(m.extension) ||
        typeof m.tileResolution !== 'number' ||
        typeof m.maxLevel !== 'number' ||
        typeof m.cubeResolution !== 'number'
      ) {
        return null;
      }
      multires = {
        basePath: base,
        path: m.path,
        fallbackPath: m.fallbackPath,
        extension: m.extension,
        tileResolution: num(m.tileResolution, 64, 2048, 512),
        maxLevel: num(m.maxLevel, 1, 10, 1),
        cubeResolution: num(m.cubeResolution, 64, 16384, 1024),
      };
    }
    return {
      id: raw.id,
      title: text(raw.title),
      view: {
        yaw: num(v.yaw, -360, 360, 0),
        pitch: num(v.pitch, -90, 90, 0),
        hfov: num(v.hfov, 30, 120, 100),
        minHfov: optNum(v.minHfov, 20, 120),
        maxHfov: optNum(v.maxHfov, 30, 130),
        minPitch: optNum(v.minPitch, -90, 90),
        maxPitch: optNum(v.maxPitch, -90, 90),
        northOffset: optNum(v.northOffset, -360, 360),
      },
      hotspots: hotspots,
      multires: multires,
      multiresState: multires ? 'unknown' : 'none', // unknown | probing | ok | failed | none
      wantMultires: false,
      blobs: { preview: null, full: null },
      pending: { preview: null, full: null },
    };
  }

  function touch(id) {
    var i = recent.indexOf(id);
    if (i >= 0) recent.splice(i, 1);
    recent.push(id);
    while (recent.length > KEEP_SCENES) {
      var old = recent.shift();
      if (old === currentId) {
        recent.push(old);
        continue;
      }
      releaseBlobs(scenes[old]);
    }
  }

  function releaseBlobs(scene) {
    if (!scene) return;
    ['preview', 'full'].forEach(function (q) {
      if (scene.blobs[q]) URL.revokeObjectURL(scene.blobs[q]);
      scene.blobs[q] = null;
      scene.pending[q] = null;
    });
  }

  function bestQuality(scene) {
    if (scene.multiresState === 'ok' && scene.wantMultires) return 'multires';
    if (scene.blobs.full) return 'full';
    if (scene.blobs.preview) return 'preview';
    return null;
  }

  function sceneConfig(scene, quality, view) {
    var cfg = {
      title: scene.title,
      hfov: view.hfov,
      yaw: view.yaw,
      pitch: view.pitch,
      hotSpots: pannellumHotspots(scene),
    };
    var v = scene.view;
    if (v.minHfov !== undefined) cfg.minHfov = v.minHfov;
    if (v.maxHfov !== undefined) cfg.maxHfov = v.maxHfov;
    if (v.minPitch !== undefined) cfg.minPitch = v.minPitch;
    if (v.maxPitch !== undefined) cfg.maxPitch = v.maxPitch;
    if (v.northOffset !== undefined) cfg.northOffset = v.northOffset;
    if (quality === 'multires') {
      cfg.type = 'multires';
      cfg.multiRes = scene.multires;
    } else {
      cfg.type = 'equirectangular';
      cfg.panorama = scene.blobs[quality];
    }
    return cfg;
  }

  function defaults() {
    return {
      autoLoad: true,
      showControls: false,
      showFullscreenCtrl: false,
      showZoomCtrl: false,
      keyboardZoom: true,
      mouseZoom: true,
      draggable: true,
      compass: false,
      orientationOnByDefault: false,
      escapeHTML: true,
      crossOrigin: 'anonymous',
      sceneFadeDuration: 300,
      strings: {
        loadingLabel: strings.loading,
        loadButtonLabel: strings.loading,
        genericWebGLError: strings.webglUnsupported,
        textureSizeError: strings.loadFailed,
        fileAccessError: strings.loadFailed,
        malformedURLError: strings.loadFailed,
        iOS8WebGLError: strings.webglUnsupported,
        noPanoramaError: strings.loadFailed,
      },
    };
  }

  /* Shows the best image available for the current scene. */
  function display() {
    var scene = scenes[currentId];
    if (!scene) return;
    var quality = bestQuality(scene);
    if (!quality) {
      setStatus(strings.loading);
      post({ type: 'needImages', sceneId: scene.id });
      return;
    }
    var key = scene.id + '~' + quality;
    if (key === shownKey || key === loadingKey) return;
    var sameScene = shownKey && shownKey.split('~')[0] === scene.id;
    var view;
    if (sameScene && viewer) {
      // Quality upgrade: keep the user's current direction and zoom.
      view = { yaw: viewer.getYaw(), pitch: viewer.getPitch(), hfov: viewer.getHfov() };
    } else {
      var target = pendingView || {};
      pendingView = null;
      view = {
        yaw: typeof target.yaw === 'number' ? target.yaw : scene.view.yaw,
        pitch: typeof target.pitch === 'number' ? target.pitch : scene.view.pitch,
        hfov: scene.view.hfov,
      };
    }
    var cfg = sceneConfig(scene, quality, view);
    loadingKey = key;
    if (!viewer) {
      var base = defaults();
      base.firstScene = key;
      var all = {};
      all[key] = cfg;
      viewer = window.pannellum.viewer('panorama', { default: base, scenes: all });
      viewer.on('load', onLoaded);
      viewer.on('error', function (message) {
        var failedKey = loadingKey;
        loadingKey = null;
        setStatus(strings.loadFailed);
        fail('LOAD_FAILED', message, failedKey ? failedKey.split('~')[0] : currentId);
      });
    } else {
      viewer.addScene(key, cfg);
      viewer.loadScene(key, view.pitch, view.yaw, view.hfov);
    }
  }

  function onLoaded() {
    var key = viewer ? viewer.getScene() : null;
    if (!key) return;
    var parts = key.split('~');
    var old = shownKey;
    shownKey = key;
    if (loadingKey === key) loadingKey = null;
    setStatus('');
    post({ type: 'sceneShown', sceneId: parts[0], quality: parts[1] });
    if (old && old !== key) viewer.removeScene(old);
    // A better quality may have arrived while this one was loading.
    if (parts[0] === currentId) display();
  }

  // ---------------------------------------------------------------- images

  function handleImage(msg) {
    var scene = scenes[msg.sceneId];
    if (!scene) return fail('INVALID_MESSAGE', 'Unknown scene', msg.sceneId);
    var q = msg.quality;
    if (q !== 'preview' && q !== 'full') return fail('INVALID_MESSAGE', 'Bad quality', scene.id);
    if (!MIMES[msg.mime]) return fail('IMAGE_REJECTED', 'Type not accepted', scene.id);
    var total = msg.total;
    var seq = msg.seq;
    if (typeof total !== 'number' || total < 1 || total > MAX_CHUNKS || Math.floor(total) !== total) {
      return fail('TOO_LARGE', 'Too many chunks', scene.id);
    }
    if (typeof msg.data !== 'string' || msg.data.length > MAX_RAW || !B64_RE.test(msg.data)) {
      scene.pending[q] = null;
      return fail('INVALID_MESSAGE', 'Bad chunk', scene.id);
    }
    var p = scene.pending[q];
    if (seq === 0) {
      p = scene.pending[q] = { mime: msg.mime, total: total, parts: [], bytes: 0 };
    }
    if (!p || seq !== p.parts.length || total !== p.total || msg.mime !== p.mime) {
      scene.pending[q] = null;
      return fail('INVALID_MESSAGE', 'Chunk out of order', scene.id);
    }
    var bin;
    try {
      bin = atob(msg.data);
    } catch (e) {
      scene.pending[q] = null;
      return fail('INVALID_MESSAGE', 'Bad base64', scene.id);
    }
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    p.bytes += bytes.length;
    if (p.bytes > MAX_IMAGE_BYTES) {
      scene.pending[q] = null;
      return fail('TOO_LARGE', 'Image too large', scene.id);
    }
    p.parts.push(bytes);
    if (p.parts.length < p.total) return undefined;

    scene.pending[q] = null;
    if (!signatureOk(p.parts[0], p.mime)) return fail('IMAGE_REJECTED', 'Signature mismatch', scene.id);
    var blob = new Blob(p.parts, { type: p.mime });
    if (scene.blobs[q]) URL.revokeObjectURL(scene.blobs[q]);
    scene.blobs[q] = URL.createObjectURL(blob);
    touch(scene.id);
    if (scene.id === currentId) display();
    return undefined;
  }

  /* Checks that tiles load (network + CORS) before switching to them. */
  function probeMultires(scene) {
    if (scene.multiresState === 'probing' || scene.multiresState === 'ok') {
      if (scene.multiresState === 'ok' && scene.id === currentId) display();
      return;
    }
    scene.multiresState = 'probing';
    var m = scene.multires;
    var img = new Image();
    img.crossOrigin = 'anonymous';
    var done = false;
    var timer = setTimeout(function () {
      finish(false);
    }, 15000);
    function finish(ok) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      scene.multiresState = ok ? 'ok' : 'failed';
      if (ok) {
        if (scene.id === currentId) display();
      } else {
        post({ type: 'multiresFailed', sceneId: scene.id });
      }
    }
    img.onload = function () {
      finish(img.naturalWidth > 0);
    };
    img.onerror = function () {
      finish(false);
    };
    img.src = m.basePath + m.fallbackPath.replace('%s', 'f') + '.' + m.extension;
  }

  // -------------------------------------------------------------- commands

  function handleInit(msg) {
    if (msg.v !== VERSION) return fail('INVALID_MESSAGE', 'Unsupported version');
    if (initialized) return fail('INVALID_MESSAGE', 'Already initialized');
    var origin = null;
    if (msg.mediaOrigin != null) {
      origin = validOrigin(msg.mediaOrigin, msg.allowInsecure);
      if (!origin) return fail('INVALID_MESSAGE', 'Invalid mediaOrigin');
    }
    if (!Array.isArray(msg.scenes) || msg.scenes.length === 0 || msg.scenes.length > MAX_SCENES) {
      return fail('INVALID_MESSAGE', 'Invalid scenes');
    }
    mediaOrigin = origin;
    var parsed = {};
    for (var i = 0; i < msg.scenes.length; i++) {
      var s = parseScene(msg.scenes[i]);
      if (!s || parsed[s.id]) return fail('INVALID_MESSAGE', 'Invalid scene');
      parsed[s.id] = s;
    }
    if (!ID_RE.test(msg.firstSceneId) || !parsed[msg.firstSceneId]) return fail('INVALID_MESSAGE', 'Invalid first scene');
    if (isObject(msg.strings)) {
      strings.loading = text(msg.strings.loading);
      strings.loadFailed = text(msg.strings.loadFailed);
      strings.webglUnsupported = text(msg.strings.webglUnsupported);
    }
    if (typeof window.pannellum === 'undefined') return fail('LOAD_FAILED', 'Viewer library missing');
    restrictToMediaOrigin(origin);
    document.documentElement.lang = msg.locale === 'ar' ? 'ar' : 'en';
    // The page stays LTR: Pannellum positions hotspots from the left edge.
    // Labels use dir="auto" so Arabic text still renders right-to-left.
    scenes = parsed;
    initialized = true;
    currentId = msg.firstSceneId;
    touch(currentId);
    display();
    return undefined;
  }

  function handleShow(msg) {
    var scene = scenes[msg.sceneId];
    if (!scene) return fail('INVALID_MESSAGE', 'Unknown scene', msg.sceneId);
    var yaw = msg.yaw == null ? undefined : optNum(msg.yaw, -360, 360);
    var pitch = msg.pitch == null ? undefined : optNum(msg.pitch, -90, 90);
    if (scene.id === currentId && shownKey && shownKey.split('~')[0] === scene.id) {
      if (viewer && (yaw !== undefined || pitch !== undefined)) {
        if (pitch !== undefined) viewer.setPitch(pitch, 600);
        if (yaw !== undefined) viewer.setYaw(yaw, 600);
      }
      return undefined;
    }
    currentId = scene.id;
    pendingView = { yaw: yaw, pitch: pitch };
    touch(scene.id);
    display();
    return undefined;
  }

  function withViewer(fn) {
    if (!initialized) return fail('NOT_INITIALIZED', 'init first');
    if (!viewer || !shownKey) return undefined; // nothing on screen yet
    fn();
    return undefined;
  }

  function receive(raw) {
    if (typeof raw !== 'string' || raw.length > MAX_RAW + 1000) return fail('INVALID_MESSAGE', 'Not a message');
    var msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      msg = null;
    }
    if (!isObject(msg) || typeof msg.type !== 'string') return fail('INVALID_MESSAGE', 'Not a message');
    if (msg.type !== 'init' && msg.type !== 'destroy' && !initialized) return fail('NOT_INITIALIZED', 'init first');

    switch (msg.type) {
      case 'init':
        return handleInit(msg);
      case 'image':
        return handleImage(msg);
      case 'show':
        return handleShow(msg);
      case 'useMultires': {
        var scene = scenes[msg.sceneId];
        if (!scene) return fail('INVALID_MESSAGE', 'Unknown scene', msg.sceneId);
        if (!scene.multires) return post({ type: 'multiresFailed', sceneId: scene.id });
        scene.wantMultires = true;
        probeMultires(scene);
        return undefined;
      }
      case 'resetView':
        return withViewer(function () {
          var v = scenes[currentId].view;
          viewer.setPitch(v.pitch, 500);
          viewer.setYaw(v.yaw, 500);
          viewer.setHfov(v.hfov, 500);
        });
      case 'zoom':
        if (msg.direction !== 'in' && msg.direction !== 'out') return fail('INVALID_MESSAGE', 'Bad direction');
        return withViewer(function () {
          var step = msg.direction === 'in' ? -15 : 15;
          viewer.setHfov(viewer.getHfov() + step, 250);
        });
      case 'look':
        if (paused) return undefined;
        if (typeof msg.yawDelta !== 'number' || !isFinite(msg.yawDelta) || typeof msg.pitch !== 'number' || !isFinite(msg.pitch)) {
          return fail('INVALID_MESSAGE', 'Bad look');
        }
        return withViewer(function () {
          viewer.setYaw(viewer.getYaw() + num(msg.yawDelta, -90, 90, 0), false);
          viewer.setPitch(num(msg.pitch, -90, 90, 0), false);
        });
      case 'pause':
        paused = true;
        if (viewer && typeof viewer.stopMovement === 'function') viewer.stopMovement();
        return undefined;
      case 'resume':
        paused = false;
        return undefined;
      case 'destroy':
        destroy();
        return undefined;
      default:
        return fail('INVALID_MESSAGE', 'Unknown type');
    }
  }

  function destroy() {
    if (viewer) {
      try {
        viewer.destroy();
      } catch (e) {
        /* already gone */
      }
      viewer = null;
    }
    Object.keys(scenes).forEach(function (id) {
      releaseBlobs(scenes[id]);
    });
    shownKey = null;
    loadingKey = null;
  }

  // Only `receive` is exposed; frozen so page content cannot replace it.
  Object.defineProperty(window, 'evcarViewer', {
    value: Object.freeze({ receive: receive, schemaVersion: VERSION }),
    writable: false,
    configurable: false,
  });

  document.addEventListener('visibilitychange', function () {
    paused = document.hidden;
  });

  var gl = webglInfo();
  if (!gl.webgl) setStatus(strings.webglUnsupported);
  post({ type: 'ready', v: VERSION, webgl: gl.webgl, maxTextureSize: gl.maxTextureSize });
})();
