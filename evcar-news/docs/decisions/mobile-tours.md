# Mobile — 360° interior tours (mobile-tours) — decisions

Area: `mobile/lib/features/tours/**`, `mobile/assets/panorama/**`,
`mobile/lib/l10n/parts/tours_{ar,en}.arb`, `mobile/test/features/tours/**`.
REQUIREMENTS §8 (main feature), §19 (isolation, storage limits, sensors),
ARCHITECTURE §6. Backend contract: `docs/decisions/backend-tours.md` §1
(checked against a live backend running the demo seed, §7). Date:
2026-09-25. No new dependency, no router change.

## 1. Screens

| Route | Class | What it does |
|---|---|---|
| `/cars/:slug/tour/:tourId` | `TourViewerScreen` | Full-bleed dark viewer: isolated WebView + native chrome (back, title, current seat, about, demo / reference notices, binding pills), quality status + progress, seat switcher, zoom −/+, reset view, motion toggle, points-of-interest list, full screen, credit line. |
| `/tours` | `ToursScreen` | Every published tour of the selected market (infinite list, pull-to-refresh, skeleton, offline copy notice, empty state with "browse cars"). |

States: loading (dark skeleton → "جارٍ تحميل العرض 360°…" overlay), 404 /
nothing viewable → **"الجولة غير متاحة لهذه الفئة"** + "افتح معرض الصور"
(replaces the route with `/cars/:slug/gallery`), offline (retry + gallery),
generic error, viewer failures (no WebGL, images too large for the device,
load failure with retry), web preview (honest message + a still image
labelled "معاينة ثابتة (ليست الجولة 360°)" — never presented as a tour).
Permission-denied does not apply: motion sensors need no runtime permission
on Android, and raw gyro/accelerometer on iOS need none either; when the
sensors do not deliver data the toggle reports "unavailable" and dragging
keeps working.

Always shown: trim, model year, market, interior colour (swatch **and**
name), drive side (pills; hidden in landscape, always in "About"); the demo
label (server `demoLabel`, fallback "تجريبي — ليست مقصورة سيارة حقيقية") on
the list card, the viewer top bar and in full screen; the reference-trim
note ("مصوّرة في فئة قريبة" + photographed trim + editor's difference
note); a market-mismatch note in "About" when `marketMatch=false`; the
scene credit line and, in "About", every credit with licence type and
https licence / source links.

Hotspots open **native bottom sheets** (plain `Text`, never HTML):
info (title + body), detail image (tap → full-screen `photo_view` zoom with
credit), video (licensed link opened outside the app, only
`www.youtube-nocookie.com` / `player.vimeo.com` https embeds or files on the
tour's media origin), spec (label + value with unit, "غير متوفر" for
null, reliability badge, "كل المواصفات" → `/variants/:slug`), scene link
(jumps to the target seat and direction, no sheet). Screen readers get the
same hotspots through the "نقاط الاهتمام" list (WebView content is not
reliably reachable by TalkBack/VoiceOver).

## 2. Architecture

```
domain/tour_models.dart        TourCard, TourDetail, TourScene, Hotspot… (hand-written, defensive)
domain/rendition_policy.dart   DeviceDisplayProfile + chooseRendition (pure)
domain/viewer_protocol.dart    ViewerCommand / parseViewerEvent / image chunks (pure)
data/tours_repository.dart     GET /tours, /tours/featured, /tours/:id?maxWidth= (cached)
data/panorama_cache.dart       byte-limited LRU file cache + PanoramaLoader
application/tour_viewer_controller.dart  handshake, progressive loading, scenes, hotspots, motion, pause
application/motion_look.dart   sensors → yaw/pitch (pure filter + MotionSource)
application/panorama_surface.dart        interface for the WebView (fake in tests)
application/tours_providers.dart         toursListProvider, featuredToursProvider, tourDetailProvider
presentation/widgets/webview_panorama_surface.dart  real WebView + panoramaSurfaceFactoryProvider
```

The controller never touches the WebView directly, so everything except
the page itself is unit/widget tested with `FakePanoramaSurface`.

## 3. Isolation & message protocol (v2)

* `webview_flutter` loads the bundled `assets/panorama/viewer.html`
  (`loadFlutterAsset`); Pannellum 2.5.7 is vendored (MIT, `COPYING`).
* **Navigation**: `NavigationDelegate.onNavigationRequest` allows only the
  bundled page itself (`file:` URL ending in
  `flutter_assets/assets/panorama/viewer.html`, no query/fragment) —
  `isAllowedViewerNavigation`, unit tested with https, javascript:, data:,
  intent:, about:blank, other files.
* **CSP**: baseline `default-src 'none'; script-src 'self' file:; style-src
  'self' file:; img-src 'self' file: data: blob: https:; connect-src blob:;
  object/frame/worker/media 'none'` (`file:` because some WebViews do not
  match `'self'` for `file://` pages). On `init` the page appends a second
  policy `img-src blob: data: <mediaOrigin>; connect-src blob:` — policies
  intersect, so it can only tighten. Verified in Chromium: an image from
  another origin is blocked.
* **Images never come from the network inside the WebView** for
  single-image panoramas: the app downloads them (Dio, no auth headers,
  https — http only in debug builds for a local backend — and only from the
  tour's `mediaOrigin`), checks the size (≤ 40 MiB) and the file signature
  (JPEG/PNG/WebP), stores them in the cache (§5) and streams the bytes as
  base64 chunks (192 KiB raw each) over `runJavaScript`. The page checks
  every chunk (order, count ≤ 256, base64 alphabet, total ≤ 40 MiB, MIME
  allow-list, signature) and turns them into a `blob:` URL. This also means
  no CORS dependency (the dev backend's `/media` sends no
  `Access-Control-Allow-Origin`, which would break WebGL textures).
  Only **multires tiles** are fetched by the WebView (from `mediaOrigin`).
* **App → page**: `window.evcarViewer.receive(<one JSON string literal>)`
  (`jsReceiveCall`: `jsonEncode` twice, U+2028/2029 escaped — never
  interpolated code). `evcarViewer` is a frozen, non-configurable property.
  Commands: `init`, `image`, `show`, `useMultires`, `resetView`, `zoom`,
  `look`, `pause`, `resume`, `destroy` (schema at the top of `viewer.js`).
* **Page → app**: JSON on the `EvcarBridge` JavaScriptChannel:
  `ready{v,webgl,maxTextureSize}`, `needImages{sceneId}`,
  `sceneShown{sceneId,quality}`, `hotspot{sceneId,hotspotId}`,
  `multiresFailed{sceneId}`, `error{code,sceneId,message}`.
  `parseViewerEvent` accepts only known types with **exactly** the allowed
  keys, ids matching `^[A-Za-z0-9_-]{1,64}$` that exist in the tour (a
  hotspot id must belong to that scene), enums, bounded numbers, messages
  ≤ 2 KiB; everything else is ignored. The page answers invalid commands
  with `error INVALID_MESSAGE` and keeps running.
* Hotspot markers in the page are built with `textContent` /
  `aria-label` only (a label `<img src=x onerror=…>` stays text — verified
  in Chromium); glyphs are CSS-drawn (no icon font, no remote resources).
  The page stays LTR (Pannellum positions from the left); labels use
  `dir="auto"` so Arabic renders correctly.

## 4. Progressive loading & rendition choice (`chooseRendition`)

* `DeviceDisplayProfile`: physical long side of the window; `lowMemory`
  when < 1280 px (no memory-class API without a new plugin);
  `maxTextureSize` reported by the page (WebGL) on `ready`.
* Single equirectangular image cap: 2048 on low-end screens, else **4096**;
  never above `2 × MAX_TEXTURE_SIZE` (Pannellum's limit). **8192 is never
  loaded as one image** (128 MB of texture); more detail comes only from
  multires tiles, which stream the visible part.
* The request `maxWidth` = that cap (API range 512..16384), so the API
  itself leaves out wider renditions.
* Per scene: **preview (~1024×512) first**, then the smallest rendition ≥
  `min(long side × 3.6, cap)` (≈ sharp at the default 100° field of view)
  among those ≤ cap; if the scene has tiles, the device is not low-end and
  wants more pixels than that rendition → `useMultires` (the page probes
  one fallback tile with CORS first; on failure → `multiresFailed` → the
  app sends the rendition). Quality swaps keep the user's direction and
  zoom (`loadScene` with the current yaw/pitch/hfov).
* UI: "معاينة" pill while the preview is on screen, "جارٍ تحميل الجودة
  العالية… 45٪" with a progress bar, "عالية الدقة" when done; a failed HD
  download keeps the preview with a retry button.

## 5. Device storage limit

`FilePanoramaCache` in `<cache database dir>/panorama_cache/`: **150 MiB**
(`kPanoramaCacheMaxBytes`), least-recently-viewed files evicted first (file
mtime touched on every read), writes via `.part` + rename, stale `.part`
files removed. Web preview / no database → 48 MiB in-memory LRU. Multires
tiles are left to the WebView's HTTP cache (system-managed limit). Tour
JSON is cached through the app's `JsonCache` (offline re-viewing works for
tours already opened). `panoramaCacheProvider.clear()` is available for a
future "clear 360° cache" setting (settings feature).

## 6. Motion control, sensors and lifecycle

* Optional toggle "انظر حولك بتحريك الهاتف". Implemented **natively**
  with `sensors_plus` (gyroscope + accelerometer at game rate) instead of
  Pannellum's DeviceOrientation mode: iOS only grants DeviceOrientation to
  a user gesture inside the page, and native streams can be stopped
  reliably. `MotionLookFilter`: pitch absolute from low-passed gravity
  (upright = 0°, screen down = +90°), yaw relative by integrating the
  rotation about the gravity axis (works in portrait and landscape without
  knowing the screen rotation; drag keeps working). ~30 `look` commands/s.
  No gyroscope events within 2 s → "غير متاح على هذا الجهاز".
* **Stopped** when the viewer is not visible (`VisibilityDetector`,
  another route on top), when the app is not `resumed`
  (`WidgetsBindingObserver`), on dispose; the page also gets `pause`
  (stops movement, ignores `look`) and pauses itself on
  `visibilitychange`. Pannellum renders only while something moves, so
  a paused, still view costs no GPU time.
* Full screen: immersive sticky system UI, chrome hidden except an exit
  button (and the demo pill for demo tours); back leaves full screen
  first; restored on dispose. Landscape works everywhere (orientation is
  not locked).

## 7. Verification (2026-09-25)

* Backend on own DB `evcar_mtours` (migrate deploy + reference + demo
  seed, `ts-node src/main.ts` on :3108): `GET /tours`, `/tours/featured`,
  `/tours/:id?maxWidth=4096` in ar/en and a 404 captured into
  `test/features/tours/fixtures/*.json` (demo data only). Shapes match the
  contract.
* **Real browser engine** — `node test/features/tours/browser/viewer_browser_check.mjs`
  (headless Chromium 1194 with SwiftShader WebGL, Pannellum + viewer.js,
  synthetic "TEST ONLY — NOT A CAR INTERIOR" grids generated in the page):
  18/18 checks PASS — ready v2 (WebGL, maxTextureSize 8192), commands
  before init refused, needImages → preview on screen in ~130–200 ms, full
  quality swapped in ~500–600 ms, 3 hotspots rendered as text only (hostile
  label not parsed), tap → `hotspot` message, drag / zoom / look / reset
  without errors, seat switch, revisit uses kept image, 7 hostile messages
  → 7 error replies and the viewer keeps running, frozen bridge, multires
  probe failure → `multiresFailed`, CSP blocks another origin, no network
  requests. (This found and fixed a real bug: with `dir=rtl` on the page,
  Pannellum placed hotspots off-screen — the page now stays LTR.)
* `flutter analyze` (feature + tests): no issues. Tests in
  `test/features/tours/`: `tours_domain_test.dart` (models from captured
  responses, rendition policy, protocol validation, JS literal escaping,
  chunk round trip, navigation allow-list, video allow-list, caches &
  loader, motion filter), `tour_viewer_controller_test.dart` (handshake,
  progressive loading order, seat switch, scene links, forged hotspot ids,
  no WebGL, load failure + retry, HD failure keeps preview, multires +
  fallback, motion on/pause/resume/unavailable, look commands),
  `tours_screens_test.dart` (list, empty, 200 % text ar/en, 404 →
  unavailable + gallery, maxWidth sent, controls / binding / demo label /
  seats / credit, seat switch, info + spec sheets, points list → scene
  link, about sheet, no WebGL, web preview, dispose on leave),
  `viewer_assets_test.dart` (CSP, no remote resources, banned DOM APIs,
  protocol message names in sync). **52 tests, all pass** in the shared
  tree. Full `flutter test` in a scratch copy of `mobile/` with the
  compare feature at its committed state (it was mid-edit in the shared
  tree): **379 passed, 7 skipped, 0 failed**; `flutter analyze`: no issues.
  In the shared tree at the end of this run, `test/app/routes_test.dart`
  and `shell_navigation_test.dart` still fail on `/compare/pick` and
  `/compare/s/…`: the compare feature has replaced those placeholders and
  has not updated these tests yet (not a tours issue).
* `test/app/routes_test.dart`: the two tour routes moved from "placeholder"
  to "implemented" (they are no longer placeholders).

### Manual test steps on a device (not possible here: no Android SDK)

1. Run the backend with the demo seed; start the app with
   `--dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1` (debug build:
   http media allowed). Set the `interiorTours` feature flag on.
2. Cars → "Demo EV One" → 360° card, or `/tours` → the demo tour.
   Expect: dark viewer, "Demo — not a real car interior" label, preview
   within a second, then "HD"; the drag hint disappears after 5 s.
3. Drag in every direction, look straight up/down, pinch zoom, zoom
   buttons, "Reset view" returns to the initial direction.
4. Rotate to landscape; tap "Full screen" (system bars hidden), rotate
   back, Back leaves full screen first.
5. Motion toggle: move the phone left/right/up/down — the view follows;
   switch app / lock the screen / open "About" route then come back —
   motion stops while hidden and resumes; toggle off stops sensors.
6. Tap the "i" hotspot → native sheet with text; the battery hotspot →
   spec "60 kWh" (demo) + "See all specifications"; the seat arrow → rear
   seats; seat chips switch between the two images.
7. Airplane mode, reopen the same tour → cached tour + images still show;
   open another tour → offline state. Kill the backend → "The 360° view
   couldn't be loaded" with retry + gallery. Open a non-existent tour id →
   "Tour not available for this trim" + photo gallery.
8. TalkBack/VoiceOver: controls are labelled 48 dp buttons; "Points of
   interest" lists all hotspots; the seat switcher announces the selected
   seat.
9. With tiles (a panorama processed by the media worker and a media origin
   sending `Access-Control-Allow-Origin: *`): on a large phone the quality
   pill reaches "HD" through tiles; block the tile host → it falls back to
   the rendition.

## 8. Not done / limits

* **No APK / device run here** (no Android SDK): the WebView path itself
  (loadFlutterAsset, JavaScriptChannel, file:// CSP handling on Android
  System WebView and WKWebView, sensor axes on real phones) is verified
  only through the Chromium run above and the manual steps.
* Multires success path not exercised end-to-end: the demo panoramas have
  no tiles (no worker in the seed) and the backend's local `/media` sends
  no CORS header. The fallback path (probe failure → rendition) is tested.
* Uploaded (`kind: file`) hotspot videos open in the external browser/app
  — there is no in-app video player dependency.
* No "clear 360° cache" button (settings area; API ready, §5).
* Memory class of the device is not known (no plugin); the low-end rule is
  screen-size based.

## 9. Notes for other teams

* **Home**: `featuredToursProvider` (`application/tours_providers.dart`)
  → `CachedResult<List<TourCard>>`; card widget `TourListCard(card:, width:)`
  (`presentation/widgets/tour_card.dart`) and `tourLocation(card)` for the
  route (`/cars/<modelSlug>/tour/<id>`).
* **Cars**: the car page already opens `AppRoutes.tour(carSlug, tourId)`;
  the viewer accepts id or slug and uses `carSlug` for the gallery link.
* **Backend / integrator**: (1) serve public media with
  `Access-Control-Allow-Origin: *` (local `/media` route and the S3/CDN
  CORS rules) or multires tiles can never load in the app (it falls back
  to renditions); (2) run the media processing for the demo panoramas so
  the demo tour has tiles; (3) production media must be https (release
  builds refuse http media).
* **Settings**: may call `ref.read(panoramaCacheProvider).clear()` and
  show `sizeBytes()` for a "360° images on this device" entry.
* `mobile/README.md` still describes the viewer as a skeleton (not my
  area) — point it to this file.
