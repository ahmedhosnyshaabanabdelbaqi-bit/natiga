/*
 * EV Car News — 360° viewer bridge (SKELETON).
 *
 * Message schema (version 1). All messages are JSON objects with a "type".
 *
 * App → viewer: the app calls
 *   window.evcarViewer.receive('<JSON string>')
 * via WebViewController.runJavaScript (the argument is a JSON-encoded string
 * literal, never interpolated code).
 *   {type:"init", version:1, mediaOrigin:"https://media.example",
 *    locale:"ar"|"en", strings:{loading, loadFailed, webglUnsupported},
 *    tour:{firstScene:"<id>", scenes:[{id, title, panorama:"<url>",
 *          preview?:"<url>", yaw, pitch, hfov, minPitch?, maxPitch?,
 *          hotspots:[{id, kind:"info"|"scene"|"spec"|"media", yaw, pitch,
 *                     text, targetSceneId?}]}]}}
 *   {type:"setScene", sceneId}
 *   {type:"resetView"}
 *   {type:"setOrientation", enabled:true|false}
 *   {type:"destroy"}
 *
 * Viewer → app: EvcarBridge.postMessage('<JSON string>') (JavaScriptChannel)
 *   {type:"ready"}                         bridge loaded, waiting for init
 *   {type:"sceneLoaded", sceneId}
 *   {type:"sceneChanged", sceneId}
 *   {type:"hotspotClicked", sceneId, hotspotId}
 *   {type:"orientation", state:"on"|"off"|"unavailable"|"denied"}
 *   {type:"error", code:"INVALID_MESSAGE"|"LOAD_FAILED"|"WEBGL_UNSUPPORTED"|"NOT_INITIALIZED", message}
 *
 * Rules: every URL must be https and on mediaOrigin; ids match
 * /^[A-Za-z0-9_-]{1,64}$/; numbers must be finite and in range; text is
 * plain text (rendered with textContent — HTML is never interpreted).
 *
 * TODO(tours feature): multires/cubemap sources, device-rendition choice,
 * scene preview → full-quality swap, hotspot focus handling for screen
 * readers, and the Dart side (TourViewerScreen) that owns this protocol.
 */
(function () {
  'use strict';

  var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  var MAX_TEXT = 500;
  var MAX_SCENES = 32;
  var MAX_HOTSPOTS = 64;

  var viewer = null;
  var mediaOrigin = null;
  var strings = { loading: '', loadFailed: '', webglUnsupported: '' };

  function post(msg) {
    try {
      if (window.EvcarBridge && typeof window.EvcarBridge.postMessage === 'function') {
        window.EvcarBridge.postMessage(JSON.stringify(msg));
      }
    } catch (e) {
      /* The bridge is the only output channel; nothing else to do. */
    }
  }

  function fail(code, message) {
    post({ type: 'error', code: code, message: String(message || '').slice(0, MAX_TEXT) });
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

  function text(v) {
    return typeof v === 'string' ? v.slice(0, MAX_TEXT) : '';
  }

  function validOrigin(v) {
    if (typeof v !== 'string') return null;
    try {
      var u = new URL(v);
      if (u.protocol !== 'https:' || u.username || u.password) return null;
      return u.origin;
    } catch (e) {
      return null;
    }
  }

  function mediaUrl(v) {
    if (typeof v !== 'string' || !mediaOrigin) return null;
    try {
      var u = new URL(v);
      if (u.protocol !== 'https:' || u.origin !== mediaOrigin) return null;
      return u.href;
    } catch (e) {
      return null;
    }
  }

  /* Tightens the CSP to the media origin (policies intersect). */
  function restrictToMediaOrigin(origin) {
    var meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = "img-src 'self' data: blob: " + origin + '; connect-src ' + origin;
    document.head.appendChild(meta);
  }

  function hotspotTooltip(div, args) {
    // args = {text, kind}; plain text only.
    div.classList.add('evcar-hotspot');
    if (args.kind === 'scene') div.classList.add('scene');
    div.setAttribute('role', 'button');
    div.setAttribute('tabindex', '0');
    div.setAttribute('aria-label', args.text);
    var tip = document.createElement('span');
    tip.className = 'evcar-tooltip';
    tip.textContent = args.text;
    div.appendChild(tip);
  }

  function buildHotspot(sceneId, h) {
    if (!isObject(h) || !ID_RE.test(h.id)) return null;
    var kind = ['info', 'scene', 'spec', 'media'].indexOf(h.kind) >= 0 ? h.kind : null;
    if (!kind) return null;
    var hs = {
      id: h.id,
      pitch: num(h.pitch, -90, 90, 0),
      yaw: num(h.yaw, -180, 180, 0),
      cssClass: 'evcar-hotspot-root',
      createTooltipFunc: hotspotTooltip,
      createTooltipArgs: { text: text(h.text), kind: kind },
      clickHandlerFunc: function () {
        post({ type: 'hotspotClicked', sceneId: sceneId, hotspotId: h.id });
      },
    };
    if (kind === 'scene') {
      if (!ID_RE.test(h.targetSceneId)) return null;
      hs.type = 'scene';
      hs.sceneId = h.targetSceneId;
    } else {
      hs.type = 'info';
    }
    return hs;
  }

  function buildConfig(tour) {
    if (!isObject(tour) || !Array.isArray(tour.scenes)) return null;
    if (tour.scenes.length === 0 || tour.scenes.length > MAX_SCENES) return null;
    var scenes = {};
    for (var i = 0; i < tour.scenes.length; i++) {
      var s = tour.scenes[i];
      if (!isObject(s) || !ID_RE.test(s.id)) return null;
      var panorama = mediaUrl(s.panorama);
      if (!panorama) return null;
      var preview = s.preview == null ? undefined : mediaUrl(s.preview);
      if (preview === null) return null;
      var hotspots = [];
      var raw = Array.isArray(s.hotspots) ? s.hotspots.slice(0, MAX_HOTSPOTS) : [];
      for (var j = 0; j < raw.length; j++) {
        var hs = buildHotspot(s.id, raw[j]);
        if (hs) hotspots.push(hs);
      }
      scenes[s.id] = {
        type: 'equirectangular',
        title: text(s.title),
        panorama: panorama,
        preview: preview,
        yaw: num(s.yaw, -180, 180, 0),
        pitch: num(s.pitch, -90, 90, 0),
        hfov: num(s.hfov, 30, 120, 100),
        minPitch: num(s.minPitch, -90, 90, -90),
        maxPitch: num(s.maxPitch, -90, 90, 90),
        hotSpots: hotspots,
      };
    }
    var first = ID_RE.test(tour.firstScene) && scenes[tour.firstScene] ? tour.firstScene : tour.scenes[0].id;
    return {
      default: {
        firstScene: first,
        autoLoad: true,
        showFullscreenCtrl: false,
        showControls: true,
        orientationOnByDefault: false,
        escapeHTML: true, // defence in depth; our tooltips use textContent anyway
        crossOrigin: 'anonymous',
        sceneFadeDuration: 400,
        strings: {
          loadingLabel: strings.loading,
          genericWebGLError: strings.webglUnsupported,
          fileAccessError: strings.loadFailed,
          malformedURLError: strings.loadFailed,
        },
      },
      scenes: scenes,
    };
  }

  function destroy() {
    if (viewer) {
      try {
        viewer.stopOrientation();
      } catch (e) {
        /* orientation may not have been started */
      }
      viewer.destroy();
      viewer = null;
    }
  }

  function handleInit(msg) {
    if (viewer) destroy();
    if (msg.version !== 1) return fail('INVALID_MESSAGE', 'Unsupported version');
    var origin = validOrigin(msg.mediaOrigin);
    if (!origin) return fail('INVALID_MESSAGE', 'Invalid mediaOrigin');
    if (!mediaOrigin) {
      mediaOrigin = origin;
      restrictToMediaOrigin(origin);
    } else if (mediaOrigin !== origin) {
      return fail('INVALID_MESSAGE', 'mediaOrigin cannot change');
    }
    if (isObject(msg.strings)) {
      strings.loading = text(msg.strings.loading);
      strings.loadFailed = text(msg.strings.loadFailed);
      strings.webglUnsupported = text(msg.strings.webglUnsupported);
    }
    document.documentElement.lang = msg.locale === 'ar' ? 'ar' : 'en';
    var config = buildConfig(msg.tour);
    if (!config) return fail('INVALID_MESSAGE', 'Invalid tour');
    if (typeof window.pannellum === 'undefined') return fail('LOAD_FAILED', 'Viewer library missing');

    viewer = window.pannellum.viewer('panorama', config);
    viewer.on('load', function () {
      setStatus('');
      post({ type: 'sceneLoaded', sceneId: viewer.getScene() });
    });
    viewer.on('scenechange', function (id) {
      post({ type: 'sceneChanged', sceneId: id });
    });
    viewer.on('error', function (message) {
      setStatus(strings.loadFailed);
      fail('LOAD_FAILED', message);
    });
    return undefined;
  }

  function receive(raw) {
    var msg;
    try {
      msg = typeof raw === 'string' ? JSON.parse(raw) : null;
    } catch (e) {
      msg = null;
    }
    if (!isObject(msg) || typeof msg.type !== 'string') return fail('INVALID_MESSAGE', 'Not a message');

    switch (msg.type) {
      case 'init':
        return handleInit(msg);
      case 'setScene':
        if (!viewer) return fail('NOT_INITIALIZED', 'init first');
        if (!ID_RE.test(msg.sceneId)) return fail('INVALID_MESSAGE', 'Invalid sceneId');
        viewer.loadScene(msg.sceneId);
        return undefined;
      case 'resetView': {
        if (!viewer) return fail('NOT_INITIALIZED', 'init first');
        var cfg = viewer.getConfig();
        viewer.setPitch(cfg.pitch || 0);
        viewer.setYaw(cfg.yaw || 0);
        viewer.setHfov(cfg.hfov || 100);
        return undefined;
      }
      case 'setOrientation':
        if (!viewer) return fail('NOT_INITIALIZED', 'init first');
        if (msg.enabled === true) {
          if (!viewer.isOrientationSupported()) return post({ type: 'orientation', state: 'unavailable' });
          viewer.startOrientation();
          return post({ type: 'orientation', state: 'on' });
        }
        viewer.stopOrientation();
        return post({ type: 'orientation', state: 'off' });
      case 'destroy':
        destroy();
        return undefined;
      default:
        return fail('INVALID_MESSAGE', 'Unknown type');
    }
  }

  // Only `receive` is exposed; the object is frozen so page content cannot
  // replace it.
  Object.defineProperty(window, 'evcarViewer', {
    value: Object.freeze({ receive: receive, schemaVersion: 1 }),
    writable: false,
    configurable: false,
  });

  // Stop sensors when the page is hidden (app backgrounded / screen left).
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && viewer) {
      try {
        viewer.stopOrientation();
        post({ type: 'orientation', state: 'off' });
      } catch (e) {
        /* ignore */
      }
    }
  });

  post({ type: 'ready' });
})();
