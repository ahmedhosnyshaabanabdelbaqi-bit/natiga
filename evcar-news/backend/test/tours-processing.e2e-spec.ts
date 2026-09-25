/**
 * Media processing job (ARCHITECTURE §4.8), run inline (tests have no
 * BullMQ workers): panorama preview + device renditions + Pannellum
 * multires tiles (correct cube-face orientation), flat-image renditions
 * without metadata, video copy, progress / attempts / errors persisted,
 * idempotent re-runs, failure after the last retry.
 */
import sharp from 'sharp';
import { planMultires, tileCount, multiresConfig } from '../src/modules/media/domain/multires';
import { MediaProcessingService } from '../src/modules/media/services/media-processing.service';
import { STORAGE_PROVIDER } from '../src/providers/provider-tokens';
import type { StorageProvider } from '../src/providers/storage/storage.types';
import {
  auth,
  flatImage,
  processInline,
  syntheticPanorama,
  tourStaff,
  uploadAsset,
  type TourStaff,
} from './tours-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

/** 2:1 test image whose regions are coloured by viewing direction. */
async function directionPanorama(width: number): Promise<Buffer> {
  const h = width / 2;
  const q = width / 4;
  // Columns: x = (yaw + 180) / 360 * W → back | left | front | right | back.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}">
    <rect x="0" y="0" width="${q / 2}" height="${h}" fill="#0000FF"/>
    <rect x="${q / 2}" y="0" width="${q}" height="${h}" fill="#FFFF00"/>
    <rect x="${q * 1.5}" y="0" width="${q}" height="${h}" fill="#FF0000"/>
    <rect x="${q * 2.5}" y="0" width="${q}" height="${h}" fill="#00FF00"/>
    <rect x="${q * 3.5}" y="0" width="${q / 2}" height="${h}" fill="#0000FF"/>
    <rect x="0" y="0" width="${width}" height="${h * 0.2}" fill="#FFFFFF"/>
    <rect x="0" y="${h * 0.8}" width="${width}" height="${h * 0.2}" fill="#000000"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

describe('Media processing (e2e)', () => {
  let t: TestApp;
  let staff: TourStaff;
  let storage: StorageProvider;

  beforeAll(async () => {
    t = await createTestApp();
    staff = await tourStaff(t);
    storage = t.app.get<StorageProvider>(STORAGE_PROVIDER);
  });
  afterAll(async () => {
    await t?.close();
  });

  it('builds the preview, device renditions and multires tiles of a panorama', async () => {
    const asset = await uploadAsset(t, staff.manager, await syntheticPanorama(4096), {
      kind: 'panorama',
    });
    const result = await processInline(t, asset.id);
    const plan = planMultires(4096);
    // preview + 2 renditions + tiles + 6 fallback faces + config
    expect(result).toMatchObject({ status: 'ready', files: 3 + tileCount(plan) + 6 + 1 });

    const row = await t.prisma.mediaAsset.findUniqueOrThrow({
      where: { id: asset.id },
      include: { variants: true },
    });
    expect(row).toMatchObject({
      status: 'ready',
      processingProgress: 100,
      processingAttempts: 1,
      processingError: null,
    });
    expect(row.processedAt).not.toBeNull();
    expect(row.multiresConfig).toEqual(multiresConfig(plan));
    expect(plan).toMatchObject({ cubeResolution: 1296, maxLevel: 3, tileResolution: 512 });

    const preview = row.variants.find((v) => v.kind === 'preview')!;
    expect(preview).toMatchObject({ width: 1024, height: 512, mimeType: 'image/jpeg' });
    const previewMeta = await sharp(await storage.getBuffer(preview.storageKey)).metadata();
    expect([previewMeta.width, previewMeta.height]).toEqual([1024, 512]);

    const renditions = row.variants
      .filter((v) => v.kind === 'rendition')
      .map((v) => [v.label, v.width, v.height]);
    expect(renditions.sort()).toEqual([
      ['2048', 2048, 1024],
      ['4096', 4096, 2048],
    ]);
    // 8192 is never produced from a 4096 source (no up-scaling).
    expect(row.variants.some((v) => v.label === '8192')).toBe(false);

    const tiles = row.variants.filter((v) => v.kind === 'tile');
    expect(tiles).toHaveLength(tileCount(plan));
    for (const level of plan.levels) {
      for (const face of ['f', 'r', 'b', 'l', 'u', 'd']) {
        expect(tiles.filter((x) => x.level === level.level && x.face === face)).toHaveLength(
          level.tiles * level.tiles,
        );
      }
    }
    const top = tiles.find((x) => x.label === '3/f0_0')!;
    expect(top.storageKey).toBe(`public/media/${asset.id}/tiles/3/f0_0.jpg`);
    const tileMeta = await sharp(await storage.getBuffer(top.storageKey)).metadata();
    expect([tileMeta.width, tileMeta.height]).toEqual([512, 512]);
    const edge = tiles.find((x) => x.label === '3/f2_2')!; // 1296 = 2×512 + 272
    expect([edge.width, edge.height]).toEqual([272, 272]);
    const fallbacks = row.variants.filter((v) => v.kind === 'cubemap_face');
    expect(fallbacks.map((f) => f.face).sort()).toEqual(['b', 'd', 'f', 'l', 'r', 'u']);
    const config = row.variants.find((v) => v.kind === 'multires_config')!;
    expect(JSON.parse((await storage.getBuffer(config.storageKey)).toString())).toEqual(
      multiresConfig(plan),
    );
    // Every generated file is public and exists.
    for (const v of row.variants) {
      expect(v.storageKey.startsWith(`public/media/${asset.id}/`)).toBe(true);
    }
    expect(await storage.exists(tiles[tiles.length - 1].storageKey)).toBe(true);

    // Admin view: preview URL, renditions, tile count and the Pannellum basePath.
    const detail = await t
      .http()
      .get(`/api/v1/admin/media/assets/${asset.id}`)
      .set(auth(staff.manager))
      .expect(200);
    expect(detail.body.data.preview.url).toMatch(/\/media\/media\/.+\/preview-1024\.jpg$/);
    expect(detail.body.data.tileCount).toBe(tileCount(plan));
    expect(detail.body.data.multires.basePath).toMatch(/\/media\/media\/.+\/tiles$/);
    expect(detail.body.data.usage).toMatchObject({ tourScenes: 0, publishedTours: 0 });

    // Idempotent re-run: same files, no duplicate rows, attempts counted.
    const again = await processInline(t, asset.id);
    expect(again.files).toBe(result.files);
    const count = await t.prisma.assetVariant.count({ where: { assetId: asset.id } });
    expect(count).toBe(result.files);
    const after = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(after).toMatchObject({
      status: 'ready',
      processingAttempts: 2,
      processingProgress: 100,
    });
  });

  it('orients the cube faces like Pannellum (front, right, back, left, up, down)', async () => {
    const asset = await uploadAsset(t, staff.manager, await directionPanorama(2048), {
      kind: 'panorama',
    });
    await processInline(t, asset.id);
    const faces = await t.prisma.assetVariant.findMany({
      where: { assetId: asset.id, kind: 'cubemap_face' },
    });
    const centre = async (face: string) => {
      const key = faces.find((f) => f.face === face)!.storageKey;
      const img = sharp(await storage.getBuffer(key));
      const { width } = await img.metadata();
      const px = await sharp(await storage.getBuffer(key))
        .extract({ left: Math.floor(width / 2), top: Math.floor(width / 2), width: 1, height: 1 })
        .raw()
        .toBuffer();
      return [...px];
    };
    const near = (rgb: number[], expected: number[]) =>
      rgb.every((c, i) => Math.abs(c - expected[i]) < 40);
    expect(near(await centre('f'), [255, 0, 0])).toBe(true);
    expect(near(await centre('r'), [0, 255, 0])).toBe(true);
    expect(near(await centre('b'), [0, 0, 255])).toBe(true);
    expect(near(await centre('l'), [255, 255, 0])).toBe(true);
    expect(near(await centre('u'), [255, 255, 255])).toBe(true);
    expect(near(await centre('d'), [0, 0, 0])).toBe(true);
    // Up face: its top edge points to the back (blue side band), bottom edge to the front.
    const upKey = faces.find((f) => f.face === 'u')!.storageKey;
    const up = sharp(await storage.getBuffer(upKey));
    const size = (await up.metadata()).width;
    const row = async (y: number) => [
      ...(await sharp(await storage.getBuffer(upKey))
        .extract({ left: Math.floor(size / 2), top: y, width: 1, height: 1 })
        .raw()
        .toBuffer()),
    ];
    // The edge centres of the up face look 45° up: backwards at the top, forwards at the bottom.
    expect(near(await row(1), [0, 0, 255])).toBe(true);
    expect(near(await row(size - 2), [255, 0, 0])).toBe(true);
  });

  it('makes metadata-free WebP renditions of flat images', async () => {
    const withExif = await sharp(await flatImage(1200, 800))
      .withMetadata({ exif: { IFD0: { Copyright: 'Test fixture', Artist: 'Nobody' } } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const asset = await uploadAsset(t, staff.manager, withExif, { kind: 'image' });
    await processInline(t, asset.id);
    const variants = await t.prisma.assetVariant.findMany({
      where: { assetId: asset.id },
      orderBy: { width: 'asc' },
    });
    expect(variants.map((v) => [v.kind, v.label, v.width])).toEqual([
      ['thumbnail', 'thumbnail', 320],
      ['rendition', 'w480', 480],
      ['rendition', 'w960', 960],
      ['rendition', 'w1200', 1200],
    ]);
    for (const v of variants) {
      const meta = await sharp(await storage.getBuffer(v.storageKey)).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
    }
    const row = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(row.storageKey.startsWith('private/')).toBe(true);
  });

  it('publishes a copy of a validated video and keeps PDFs private without processing', async () => {
    const mp4 = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from('ftypmp42', 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('mp42isom', 'ascii'),
      Buffer.alloc(4096, 0),
    ]);
    const video = await uploadAsset(t, staff.manager, mp4, {
      kind: 'video',
      mimeType: 'video/mp4',
      filename: 'console.mp4',
    });
    expect(video).toMatchObject({ mimeType: 'video/mp4', status: 'uploaded' });
    await processInline(t, video.id);
    const copy = await t.prisma.assetVariant.findFirstOrThrow({ where: { assetId: video.id } });
    expect(copy).toMatchObject({ kind: 'rendition', label: 'source', mimeType: 'video/mp4' });
    expect((await storage.getBuffer(copy.storageKey)).equals(mp4)).toBe(true);

    const pdf = await uploadAsset(
      t,
      staff.manager,
      Buffer.from('%PDF-1.4\n%test licence proof\n'),
      {
        kind: 'document',
        mimeType: 'application/pdf',
        filename: 'licence.pdf',
      },
    );
    expect(pdf).toMatchObject({ status: 'ready', mimeType: 'application/pdf' });
    expect(await t.prisma.assetVariant.count({ where: { assetId: pdf.id } })).toBe(0);
  });

  it('records errors per attempt and fails the asset only after the last retry', async () => {
    const asset = await uploadAsset(t, staff.manager, await syntheticPanorama(2048), {
      kind: 'panorama',
    });
    const row = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    await storage.delete(row.storageKey); // the original vanished (storage incident)
    const processing = t.app.get(MediaProcessingService);
    await expect(processing.process(asset.id, { attempt: 1, maxAttempts: 3 })).rejects.toThrow();
    let state = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(state.status).toBe('processing');
    expect(state.processingError).toMatch(/not found/i);
    expect(state.processingAttempts).toBe(1);
    await expect(processing.process(asset.id, { attempt: 3, maxAttempts: 3 })).rejects.toThrow();
    state = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(state).toMatchObject({ status: 'failed', processingAttempts: 2 });
    // Nothing half-generated is left registered.
    expect(await t.prisma.assetVariant.count({ where: { assetId: asset.id } })).toBe(0);
  });

  it('queues re-processing on demand (media.manage) and skips rejected / deleted files', async () => {
    const asset = await uploadAsset(t, staff.manager, await syntheticPanorama(2048), {
      kind: 'panorama',
    });
    await t
      .http()
      .post(`/api/v1/admin/media/assets/${asset.id}/reprocess`)
      .set(auth(staff.editor))
      .expect(403);
    const res = await t
      .http()
      .post(`/api/v1/admin/media/assets/${asset.id}/reprocess`)
      .set(auth(staff.manager));
    // 202 when Redis is reachable; 503 JOBS_UNAVAILABLE otherwise (never a 500).
    expect([202, 503]).toContain(res.status);
    if (res.status === 202) expect(res.body.data.queued).toBe(true);

    await t.prisma.mediaAsset.update({ where: { id: asset.id }, data: { deletedAt: new Date() } });
    expect(await processInline(t, asset.id)).toMatchObject({ status: 'skipped' });
  });
});
