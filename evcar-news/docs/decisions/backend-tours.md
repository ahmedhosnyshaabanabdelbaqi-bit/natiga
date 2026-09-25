# Media library & 360° interior tours (backend-tours) — decisions

Area: `backend/src/modules/media/**`, `backend/src/modules/tours/**`,
`backend/test/tours-*.e2e-spec.ts` (+ `test/tours-helpers.ts`).
REQUIREMENTS §8–9, ARCHITECTURE §4.8. Date: 2026-09-25. Status: **done &
tested** for the backend (admin screens deferred by the product owner; the
app's viewer is the mobile team's). No schema change, no new dependency.

## 1. Public API used by the app (contract)

All responses use the standard envelopes (`{data}` / `{data, meta}`),
`?lang=ar|en` and `?market=EG` (or `Accept-Language` / `X-Market`). Only
tours with `status = published`, not deleted, whose variant is public, and
whose files are all licensed (licence not expired) are ever returned. Missing
values are `null`, never 0. Cached 60 s (ETag / 304 supported).

### `GET /api/v1/tours?variantId=&modelYearId=&page=&pageSize=`
Published tours **in the request market**, exact tours first, then
editor-approved reference tours, newest first. Both filters optional.
→ `{ data: TourCard[], meta: {page, pageSize, total, totalPages} }`

### `GET /api/v1/tours/featured?limit=10` (1..20)
Home-page strip: published tours of the request market, real tours before
demo tours, newest first → `{ data: TourCard[], meta }` (one page).

### `GET /api/v1/tours/:idOrSlug?maxWidth=4096`
One published tour (any market; `marketMatch` says whether it is the request
market). `maxWidth` (512..16384, optional) = the largest panorama width the
device can display (max texture size / memory class): renditions wider than
it are left out (the smallest is always kept) and `recommendedRendition` is
the largest one ≤ `maxWidth` (default 4096). → `{ data: TourDetail }`;
404 `NOT_FOUND` for drafts / unknown ids.

```ts
TourCard = {
  id: uuid, slug: string, title: string | null,
  variantId: uuid, variantSlug: string, variantName: string,      // trim name
  carName: string,                                                  // "Brand Model Trim" (localized)
  brandName: string, modelName: string, modelSlug: string,
  modelYearId: uuid, modelYear: number,
  marketCode: string, driveSide: 'lhd' | 'rhd',
  interiorColorName: string, interiorColorHex: string | null,      // "#RRGGBB"
  seatScenes: { id: uuid, key: string, position: ScenePosition, title: string }[],
  sceneCount: number,
  isReferenceForSimilarTrim: boolean,   // imagery of a similar trim → show differenceNote prominently
  differenceNote: string | null,
  referenceVariantName: string | null,  // trim actually photographed
  previewUrl: string | null,            // fast low-res preview of the first scene
  isDemo: boolean, demoLabel: string | null,  // "Demo — not a real car interior" when isDemo
  publishedAt: string,                  // ISO-8601 UTC
}
ScenePosition = 'driver' | 'front_passenger' | 'rear' | 'third_row' | 'cargo' | 'other'

TourDetail = TourCard & {
  matchType: 'exact' | 'reference_similar_trim',
  description: string | null,
  updatedAt: string,
  marketMatch: boolean,
  mediaOrigin: string | null,   // origin of every media URL below (viewer allow-list)
  initialSceneId: uuid,
  scenes: TourScene[],          // ordered
  attributions: { text: string, licenseType: string, licenseUrl: string | null, sourceUrl: string | null }[],
}
TourScene = {
  id: uuid, key: string, position: ScenePosition, positionLabel: string, title: string, sortOrder: number,
  view: { yaw: number, pitch: number, hfov: number, minHfov: number | null, maxHfov: number | null,
          minPitch: number | null, maxPitch: number | null, northOffset: number | null },
  panorama: {
    assetId: uuid, projection: 'equirectangular' | 'cubemap', width: number | null, height: number | null,
    preview: { url, width, height } | null,                       // ~1024×512, low quality: show first
    renditions: { url, width, height, sizeBytes: number | null }[],   // ascending, ≤ maxWidth
    recommendedRendition: { url, width, height, sizeBytes } | null,
    multires: { basePath: string, path: string, fallbackPath: string, extension: 'jpg',
                tileResolution: number, maxLevel: number, cubeResolution: number } | null,
  },
  attribution: { credit: string | null, rightsHolder: string, licenseType: string,
                 licenseUrl: string | null, sourceUrl: string | null },
  hotspots: Hotspot[],
}
Hotspot = {
  id: uuid, type: 'info' | 'detail_image' | 'video' | 'spec_link' | 'scene_link',
  yaw: number, pitch: number, iconKey: string | null,
  title: string, body: string | null,            // PLAIN TEXT (never HTML) — render with textContent / Text()
  targetSceneId: uuid | null, targetYaw: number | null, targetPitch: number | null,   // scene_link
  image: { url, width, height, sizes: {url, width, height}[], alt: string | null, credit: string | null } | null, // detail_image
  video: { kind: 'file' | 'embed', url: string, provider: 'self' | 'youtube' | 'vimeo',
           mimeType: string | null, width: number | null, height: number | null,
           durationSeconds: number | null, credit: string | null } | null,               // video
  spec: { key: string, label: string, unit: string | null,
          value: number | string | boolean | null,   // null → "غير متوفر / Not available"
          reliability: string | null, variantSlug: string } | null,                      // spec_link
}
```

Pannellum multires: `basePath` is the absolute URL prefix of the tiles;
`path` / `fallbackPath` / `extension` / `tileResolution` / `maxLevel` /
`cubeResolution` are passed as-is (`type: 'multires'`). When `multires` is
null use `equirectangular` with `preview` first, then `recommendedRendition`.
Embed videos are only ever `https://www.youtube-nocookie.com/embed/<id>` or
`https://player.vimeo.com/video/<id>` (server-side allow-list).

The `seatScenes` / `previewUrl` / `isReferenceForSimilarTrim` /
`differenceNote` / `referenceVariantName` / `isDemo` fields have the same
meaning as the vehicles module's `TourCardDto` (car pages), which is a
subset of `TourCard`. In development the local storage driver serves media
over `http://<api>/media/...`; `mediaOrigin` reports that origin (the
viewer's https-only rule has to be relaxed in debug builds or the API run
behind https).

## 2. Admin API (for the deferred admin UI and scripts)

All under `/api/v1/admin`, permission-guarded server-side, audited
(AuditInterceptor + before/after annotations; chunk PATCHes are not audited
one by one — session start, completion, rejection and cancellation are).

| Route | Permission | Notes |
|---|---|---|
| `POST /media/uploads` `{filename, sizeBytes, mimeType, kind: image\|panorama\|video\|document, purpose?, sha256?, chunkSizeBytes?, licenseId?, previousVersionId?, creditText?, altTextAr?, altTextEn?}` | `media.upload` (+ `licenses.write` for `licenseId`) | 201 session; headers `Location`, `Upload-Offset: 0`, `Upload-Length`; 413 `UPLOAD_TOO_LARGE`, 415 declared type not accepted for the kind; rate limit `uploads` |
| `HEAD` / `GET /media/uploads/:id` | `media.upload` (own session; `media.manage` any) | `Upload-Offset` = `receivedBytes` to resume from |
| `PATCH /media/uploads/:id` body `application/offset+octet-stream`, header `Upload-Offset` | same | 204 + new `Upload-Offset`; 409 `UPLOAD_OFFSET_MISMATCH {expectedOffset}`; 410 `UPLOAD_SESSION_CLOSED`; 413 (chunk > `UPLOAD_CHUNK_MAX_BYTES` or past the declared length); 422 `UPLOAD_CHUNK_TOO_SMALL` (S3: non-final chunk < 5 MiB) |
| `POST /media/uploads/:id/complete` | same | 201 `MediaCompletion` (asset + `processingJob {queued, jobId, reason}` + `duplicateOf`); 409 `UPLOAD_INCOMPLETE`; 422 `MEDIA_REJECTED {assetId, problems[{code,message}]}`; idempotent after success |
| `DELETE /media/uploads/:id` | same | 204, frees the stored parts |
| `GET /media/assets?kind&status&q&licensed&licenseId&purpose&isDemo&includeDeleted` · `GET /media/assets/:id` · `GET /media/assets/:id/versions` | `media.read` | detail adds `originalUrl` (signed, 10 min), `usage`, full `validation` report |
| `PATCH /media/assets/:id` `{licenseId?, creditText?, altTextAr/En?, captionAr/En?}` | `media.upload` (+ `licenses.write` for `licenseId`) | a live file cannot lose its licence (422 `media_assets_in_use_chk`) |
| `POST` / `DELETE /media/assets/:id/visual-check` `{confirmed: true, acknowledgedWarnings[], note?}` | `tours.write` or `tours.publish` | panoramas only (422 `MEDIA_NOT_PANORAMA`), after processing (409 `MEDIA_NOT_READY`), every warning listed (422 `MEDIA_WARNINGS_NOT_ACKNOWLEDGED {unacknowledged}`) |
| `POST /media/assets/:id/reprocess` | `media.manage` | 202 `{queued, jobId}`; 503 `JOBS_UNAVAILABLE` without Redis |
| `DELETE /media/assets/:id` | `media.manage` | soft delete; 409 `IN_USE {counts}` while a tour / article / car / station uses it; stored files are kept |
| `POST /media/videos/embed` `{url, licenseId?, creditText?, altTextAr/En?}` | `media.upload` | YouTube / Vimeo only (§1), stored as the normalised embed URL |
| `GET /media/licenses?q&licenseType&expiringWithinDays` · `GET /media/licenses/:id` | `media.read` or `licenses.write` | `validity` valid / expired / not_yet_valid, `daysLeft`, `assetCount` |
| `POST` · `PATCH` · `DELETE /media/licenses[/:id]` | `licenses.write` | attribution text required when attribution is required; https URLs; dates ordered; 409 `IN_USE` when files use it |
| `GET /tours?variantId&modelYearId&marketCode&status&matchType&q&isDemo&includeDeleted` · `GET /tours/:id` · `GET /tours/:id/readiness` | `tours.read` | detail = tour + scenes (asset view incl. processing state / warnings / visual check) + hotspots (both texts) + `readiness {publishable, problems[], warnings[]}` |
| `POST /tours` · `PATCH /tours/:id` · `DELETE /tours/:id` | `tours.write` | binding fields locked while published (409 `TOUR_PUBLISHED_LOCKED`); reference edits reset the approval; only unpublished tours can be deleted (soft) |
| `POST /tours/:id/submit` | `tours.write` | draft → in_review |
| `POST /tours/:id/return` `{note}` · `/publish` · `/unpublish` · `/archive` | `tours.publish` | publish: 409 `TOUR_NOT_PUBLISHABLE {problems}`; transitions: 409 `TOUR_INVALID_TRANSITION` |
| `POST /tours/:id/approve-reference` | `tours.approve_reference` | reference tours with both difference notes |
| `POST /tours/:id/scenes` · `PATCH|DELETE /tours/:id/scenes/:sceneId` · `PUT /tours/:id/scenes/order {ids}` | `tours.write` | panorama asset only (a flat photo is never a scene); first scene becomes the initial one; on a published tour a new file must already be ready + licensed + confirmed (409 `TOUR_PUBLISHED_ASSET_NOT_READY`) |
| `POST /tours/:id/scenes/:sceneId/hotspots` · `PATCH|DELETE /tours/:id/hotspots/:hotspotId` · `PUT /tours/:id/scenes/:sceneId/hotspots/order {ids}` | `tours.write` | per-type fields (below), fixed icon set, texts `{ar?: {title, body?} | null, en?: …}` |

Every tour write answers the full editor view (`AdminTourDetail`).
Events: `tour.published` / `tour.unpublished` `{tourId, variantId, marketCode, from, to}`.

## 3. Uploads, validation and storage

- **Protocol**: own tus-like chunked sessions on `upload_sessions` (no tus
  server dependency, decision of the schema stage). Each chunk is one
  multipart part of the storage provider (S3 multipart or the local
  driver's parts directory), so the API never buffers more than one chunk
  (≤ `UPLOAD_CHUNK_MAX_BYTES`, default 16 MiB; S3 needs ≥ 5 MiB except the
  last). Offsets are enforced with a conditional update (safe across
  instances) plus an in-process lock per session. Expired sessions answer
  410 and are swept hourly (`MediaMaintenanceTrigger`, JOBS_ENABLED
  instances) — parts freed.
- **Limits**: per kind — image 50 MiB, panorama 300 MiB, video 1 GiB,
  document 25 MiB — capped by `UPLOAD_MAX_BYTES`. Session TTL
  `UPLOAD_SESSION_TTL_HOURS`.
- **Validation at completion** (synchronous, so the editor gets the answer
  at once): exact size; SHA-256 (always computed and stored; compared when
  the client sent one); MIME type **sniffed from the magic bytes**
  (`file-type`; the declared type is only used to pre-filter and a mismatch
  is an info warning); full decode with sharp (`failOn: 'error'`: corrupt /
  truncated files refused; animated / multi-page refused); dimensions
  (images ≥ 200×50 and ≤ 100 MP; panoramas 2048…16384 px wide and **2:1 ±
  2 px**). Refused files → 422 `MEDIA_REJECTED`, a `rejected` asset row (for
  the "failed uploads" report) and the bytes deleted.
- **2:1 is not proof** (§9): warnings on a 1024×512 decode — `seam_mismatch`
  (left/right edges differ), `poles_not_converging` (first/last row not a
  single point), `uniform_borders` (padding / letterbox), `low_resolution`
  (< 4096), `tiny_file` (< 0.03 byte/pixel: up-scaled / synthetic / empty),
  `gpano_projection` / `gpano_partial` (XMP GPano), plus info notes
  (`gpano_missing`, `declared_type_mismatch`, `duplicate_file`,
  `video_not_transcoded`). Thresholds are conservative (they only warn).
  Every panorama needs the editor's **visual check** (after the preview
  exists, acknowledging every warning) before a tour using it can be
  published — whether or not warnings exist.
- **Storage layout**: original `private/media/<assetId>/original` (never
  overwritten, never public: it may carry EXIF / GPS; admins get a signed
  URL); generated files `public/media/<assetId>/…` (`preview-1024.jpg`,
  `w2048.jpg`…, `w480.webp`…, `thumb-320.webp`, `video.<ext>`,
  `tiles/<level>/<face><row>_<col>.jpg`, `tiles/fallback/<face>.jpg`,
  `tiles/config.json`), metadata stripped by sharp. Public keys use the
  asset UUID, so drafts' derived files are unguessable but not secret (same
  policy as article images).
- **Versions / retention policy**: a new file is always a new asset; a
  replacement is uploaded with `previousVersionId` (same kind) → `version =
  previous + 1`, chain at `/versions`; the scene is switched with `PATCH
  scene {assetId}` (checked like a publish when the tour is live). Deleting
  is a soft delete refused while the file is used; stored files are kept
  (a purge job for soft-deleted, unused assets older than N days is not
  implemented).
- **Licences**: `asset_licenses` records rights holder, type, attribution
  (required text when required), licence / source URLs (https), permitted
  uses, restrictions, validity dates and an optional proof document. Dates
  are enforced by the services (publishing, public listings) because the
  database cannot check time.
- **Embeds**: `POST /media/videos/embed` stores an allow-listed YouTube /
  Vimeo link as a `video` asset whose "original" is a small JSON record
  (`private/media/<id>/embed.json`); the apps only ever get
  `youtube-nocookie.com/embed/<id>` or `player.vimeo.com/video/<id>`.

## 4. Processing job

`QUEUES.MEDIA_PROCESSING`, job `process-asset` `{assetId}`, 3 attempts with
exponential backoff, worker concurrency 1 (`MediaProcessingProcessor`,
JOBS_ENABLED instances). Ids: `media-<assetId>-initial` (completion is
idempotent) and `media-<assetId>-r<ts>` + BullMQ deduplication per asset
for re-runs. When Redis is down the completion still succeeds (asset
`uploaded`, `processingJob.queued=false, reason=JOBS_UNAVAILABLE`) and an
admin re-queues later.

- **Panorama**: preview 1024×512 (JPEG q50, light blur, progressive) →
  renditions 2048 / 4096 / 8192 wide, only ≤ source (never up-scaled; the
  2048 px minimum width guarantees at least one) → Pannellum **multires**: cube edge ≈ width/π (multiple of 8, as
  Pannellum's `generate.py`), levels until one tile, tiles 512 px JPEG q78,
  1024 px fallback faces, config
  `{path:"/%l/%s%y_%x", fallbackPath:"/fallback/%s", extension:"jpg", tileResolution, maxLevel, cubeResolution}`
  saved in `media_assets.multires_config` and `tiles/config.json`. Cube
  faces are computed from the equirectangular pixels (bilinear, seam
  wrap-around) with libpannellum's face orientation (f r b l u d; up face
  top edge = back) — verified end-to-end with a direction-coloured test
  image. Sources wider than 8192 are tiled from an 8192 copy (memory bound).
  Example: 4096×2048 → cube 1296, 3 levels, 84 tiles + 6 fallback faces.
- **Image**: WebP thumbnail 320 + renditions 480 / 960 / 1600 / 2400 (≤
  source), EXIF-rotated, metadata stripped.
- **Video**: public copy of the validated original (no ffmpeg in the stack:
  no transcoding, poster or duration). **Document**: nothing (private).
- **Progress / errors / retries**: `processing_progress` 0–100 (throttled
  writes), `processing_attempts` incremented per run, `processing_started_at`,
  `processing_error`; status `processing` → `ready`, `failed` only after the
  last attempt. A `ready` file (e.g. used by a published tour — database
  rule) stays `ready` while re-processed and on failure. Idempotent:
  deterministic keys, generated variant rows replaced in one transaction,
  files of an earlier run that are no longer produced are deleted, files of
  a failed run that were never registered are removed.

## 5. Tours

- Bound to **variant (→ model year) + market + drive side + interior colour
  (ar/en + hex)**; slug generated from trim / market / side / colour.
- **Publishable** (`evaluateReadiness`, pure + unit tested) when: ≥ 1 scene
  and an initial scene; every scene file is a processed panorama, not
  deleted, licensed with a licence valid today, visually confirmed; every
  hotspot file processed + licensed (valid); every hotspot titled in ar AND
  en; reference tours have both difference notes and an approval; the trim
  is offered in the market (available / coming soon / discontinued) with the
  same drive side when the market row states one; no other published tour
  for the same trim × market × side × colour. The database repeats the file
  / licence / approval / market / uniqueness rules (also at COMMIT for edits
  of a published tour). Non-blocking warnings: trim not public yet, scene
  without tiles.
- **Workflow**: draft → in_review (submit) → published; in_review → draft
  with a review note; published → draft (unpublish); any → archived.
  Scheduling is not used for tours.
- **Reference tours**: `matchType=reference_similar_trim` needs the
  photographed trim, ar + en difference notes and `tours.approve_reference`
  approval; changing trim / reference / notes withdraws the approval; the
  app shows `differenceNote` prominently.
- **Published tours**: binding fields locked; scenes / hotspots can still
  change but a new file must already be publishable; hotspots need both
  languages; the last scene cannot be removed; delete needs unpublish.
- **Hotspots**: `info` (texts only), `detail_image` (image asset),
  `video` (uploaded video or allow-listed embed), `spec_link` (a
  `spec_definitions` key; the public API adds the trim's value in the
  tour's market — `null` = not available), `scene_link` (another scene of
  the same tour + optional target yaw / pitch). Texts are reduced to plain
  text (`toPlainText`: tags and script/style blocks removed, entities
  decoded, bidi / control characters dropped, a remaining "<" before a
  letter is spaced so the database CHECK and any consumer see no markup).
  Icon keys come from a fixed set (`HOTSPOT_ICON_KEYS`: info, screen, seat,
  steering, console, roof, climate, storage, speaker, light, charging,
  battery, door, camera, image, video, spec, arrow).
- **Public visibility**: `publicTourWhere()` = published, not deleted,
  initial scene set, trim public (`PUBLIC_VARIANT_WHERE`), at least one scene
  and no scene / hotspot file deleted, unprocessed, unlicensed or with a
  licence expired / not yet valid today.

## 6. Demo panorama

The demo seed (prep stage) already provides the synthetic, clearly
labelled demo tour ("DEMO — not a real car interior", `isDemo`, no real
car). The API labels demo tours (`demoLabel`) and the home strip lists
real tours first. Tests generate their own procedural panoramas
(`test/tours-helpers.ts: syntheticPanorama` — grid + "DEMO 360° — TEST
ONLY — NOT A CAR INTERIOR"). The seeded demo panoramas have no tiles until
processed (`POST /admin/media/assets/<id>/reprocess` with a worker running,
or `MediaProcessingService.process(id)`), verified in `tours-workflow`.

## 7. Verification (2026-09-25)

- `npm run typecheck` clean; `eslint` + `prettier --check` clean on
  `src/modules/{media,tours}` and `test/tours-*`.
- `npm test`: 53 suites / 588 tests pass (new: `media-domain.spec.ts`
  31 tests — rules, multires plan, cube faces, heuristics, GPano, licences,
  embed allow-list; `tours-domain.spec.ts` 25 tests — plain text, labels,
  readiness).
- `npm run test:e2e -- test/tours-media.e2e-spec.ts test/tours-processing.e2e-spec.ts test/tours-workflow.e2e-spec.ts test/tours-worker.e2e-spec.ts`:
  4 suites / 35 tests pass — resume after interruption (409 + HEAD/GET
  offset), idempotent completion, bad bytes / truncated JPEG / non-2:1 /
  too small / checksum refused, padded flat photo flagged, visual check
  rules, licences, versions, deletion, embeds, permissions (401/403);
  processing: preview / renditions / tiles / fallback / config, cube-face
  orientation, image renditions without EXIF, video copy, attempts and
  failure after the last retry, re-run idempotency; the real BullMQ worker
  path (job completed, progress 100); publish blocked until processed +
  licensed + confirmed, review workflow, duplicates, reference approval,
  locks, file swaps, expired licence hides the tour, public list / featured
  / detail (languages, market, maxWidth, ETag 304, spec value, embed,
  attribution), demo tour.
- Existing specs still pass: foundation, rbac-admin, schema-remaining,
  vehicles-public, api-hygiene, platform-system (6 suites / 108 tests).
- `npm run openapi:export -- <scratch>/openapi.json` → 232 paths incl. the
  29 media / tours paths (the shared `backend/openapi.json` was not
  rewritten while other agents add endpoints).

## 8. Not done / limits

- Admin screens (tour editor with click-to-place hotspots, media library,
  licences) — deferred by the product owner; the API above is ready for them.
- No video transcoding / poster / duration (no ffmpeg); videos are served
  as uploaded after type sniffing.
- No virus scanning (only type sniffing + decode).
- No purge of soft-deleted media files; no storage quota.
- Cubemap (6-face) uploads: the `cubemap` projection exists in the schema
  but uploads accept equirectangular panoramas only.
- No user (non-admin) upload endpoint yet: `UploadSessionsService` is
  exported for stations / community photos (`/me/...` routes would reuse it).
- The per-instance lock plus the conditional offset update protect chunk
  order; two instances writing the same session at the same instant could
  both write the same part number — the part checksum then fails at
  completion (detected, never silently corrupt).
- Validation of a large panorama happens in the API request (up to the
  300 MiB kind limit is read into memory once).
- REQUIREMENTS_TRACKER.md not edited (outside this area).

## 9. Notes for other teams

- **Vehicles / stations (integration gap)**: files uploaded through this
  library keep their original PRIVATE (it may contain GPS); public URLs are
  in `asset_variants` (`rendition` `w480…w2400`, `thumbnail`).
  `MediaUrlService.image()` (vehicles) and `StationMediaService.image()`
  return `null` when `storageKey` is not public, so library images do not
  show there yet. Fix: when `urlOf(asset.storageKey)` is null, use the
  largest `rendition` URL (and its width/height) as `url` — as
  `ArticleMediaService.toView()` already does.
- **Vehicles**: `RelatedContentService.tourRows()` should use
  `publicTourWhere()` (exported by `modules/tours`) so car pages never list
  a tour whose trim is hidden or whose licence expired (the detail would
  404).
- **Mobile**: contract in §1; show `preview` first, then
  `recommendedRendition` or `multires`; pass `maxWidth` from the device's
  max texture size; hotspot texts are plain text; `demoLabel` /
  `differenceNote` must be visible; `mediaOrigin` is the only origin the
  viewer needs (plus the two embed origins for videos).
- **Integrator**: the demo seed could run `MediaProcessingService.process()`
  for its two panoramas so the demo tour has multires tiles without a worker.
