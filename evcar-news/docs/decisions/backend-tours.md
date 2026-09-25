# Media library & 360° interior tours (backend-tours) — decisions

Area: `backend/src/modules/media/**`, `backend/src/modules/tours/**`,
`backend/test/tours-*.e2e-spec.ts` (+ `test/tours-helpers.ts`).
REQUIREMENTS §8–9, ARCHITECTURE §4.8. Status: **in progress** — the API
contract below is written first so the app can be built against it; the
rest of this file is completed at the end of the stage.

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
