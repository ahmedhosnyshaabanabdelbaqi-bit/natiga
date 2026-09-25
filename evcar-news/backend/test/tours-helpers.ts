/**
 * Helpers of the tours-* e2e specs: staff accounts, a minimal published
 * catalog trim offered in EG, a SYNTHETIC equirectangular test panorama
 * (procedural grid labelled "DEMO 360° — TEST ONLY", never a car interior)
 * and the resumable upload protocol.
 */
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { Response } from 'supertest';
import { MediaProcessingService } from '../src/modules/media/services/media-processing.service';
import { bearer, createAndLogin, type LoggedIn } from './auth-test-helpers';
import type { TestApp } from './utils/test-app';

export interface TourStaff {
  /** vehicle_data_manager: media.*, licenses.write, tours.read / tours.write. */
  manager: LoggedIn;
  /** content_reviewer: tours.publish, tours.approve_reference (+ editor rights). */
  reviewer: LoggedIn;
  /** editor: media.upload, licenses.write, tours.read (no tours.write). */
  editor: LoggedIn;
  /** plain registered user. */
  user: LoggedIn;
}

export async function tourStaff(t: TestApp): Promise<TourStaff> {
  const [manager, reviewer, editor, user] = await Promise.all([
    createAndLogin(t, ['vehicle_data_manager']),
    createAndLogin(t, ['content_reviewer']),
    createAndLogin(t, ['editor']),
    createAndLogin(t, ['user']),
  ]);
  return { manager, reviewer, editor, user };
}

export const auth = (who: LoggedIn) => bearer(who.accessToken);

let seq = 0;

export interface CatalogTrim {
  brandId: string;
  modelId: string;
  modelYearId: string;
  variantId: string;
  variantSlug: string;
  /** A second trim of the same model year (reference tours). */
  otherVariantId: string;
}

/** Published brand → model → generation → year → 2 trims, both offered in EG (LHD). */
export async function catalogTrim(t: TestApp, marketCode = 'EG'): Promise<CatalogTrim> {
  seq += 1;
  const suffix = `${Date.now().toString(36)}${seq}`;
  const brand = await t.prisma.brand.create({
    data: {
      slug: `tt-brand-${suffix}`,
      nameEn: 'Tour Test Brand',
      nameAr: 'ماركة اختبار الجولات',
      status: 'published',
      isDemo: true,
    },
  });
  const model = await t.prisma.carModel.create({
    data: {
      brandId: brand.id,
      slug: `tt-model-${suffix}`,
      nameEn: 'Tour Model',
      nameAr: 'موديل الجولة',
      status: 'published',
      isDemo: true,
    },
  });
  const generation = await t.prisma.generation.create({
    data: { modelId: model.id, slug: 'g1', nameEn: 'Gen 1', nameAr: 'الجيل 1', isDemo: true },
  });
  const year = await t.prisma.modelYear.create({
    data: { generationId: generation.id, year: 2026, isDemo: true },
  });
  const variants = [];
  for (const [i, name] of [
    ['Long Range', 'المدى الطويل'],
    ['Standard', 'القياسية'],
  ].entries()) {
    const v = await t.prisma.vehicleVariant.create({
      data: {
        modelYearId: year.id,
        slug: `tt-${suffix}-v${i}`,
        nameEn: name[0],
        nameAr: name[1],
        powertrainType: 'BEV',
        status: 'published',
        isDemo: true,
      },
    });
    await t.prisma.variantMarket.create({
      data: { variantId: v.id, marketCode, availability: 'available', driveSide: 'lhd' },
    });
    variants.push(v);
  }
  return {
    brandId: brand.id,
    modelId: model.id,
    modelYearId: year.id,
    variantId: variants[0].id,
    variantSlug: variants[0].slug,
    otherVariantId: variants[1].id,
  };
}

/**
 * Procedural equirectangular 2:1 TEST image: sky/floor gradients, a 15°
 * grid (periodic, so the 360° seam matches), direction labels and a
 * "DEMO 360° — TEST ONLY" banner. Synthetic, never a real car interior.
 */
export async function syntheticPanorama(
  width: number,
  height = width / 2,
  opts: { format?: 'jpeg' | 'png'; quality?: number; tint?: string } = {},
): Promise<Buffer> {
  const tint = opts.tint ?? '#0A5CFF';
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="#DDEBFF"/><stop offset="0.5" stop-color="${tint}"/>`,
    `<stop offset="1" stop-color="#101820"/></linearGradient></defs>`,
    `<rect width="${width}" height="${height}" fill="url(#g)"/>`,
  ];
  for (let i = 1; i < 24; i++) {
    const x = (width / 24) * i;
    parts.push(
      `<line x1="${x}" y1="${height * 0.08}" x2="${x}" y2="${height * 0.92}" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="2"/>`,
    );
  }
  for (let j = 1; j < 12; j++) {
    const y = (height / 12) * j;
    parts.push(
      `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="2"/>`,
    );
  }
  const size = Math.max(12, Math.round(width / 60));
  for (const [x, label] of [
    [width / 2, 'FRONT'],
    [(width * 3) / 4, 'RIGHT'],
    [width / 4, 'LEFT'],
  ] as const) {
    parts.push(
      `<text x="${x}" y="${height / 2 - size}" font-family="DejaVu Sans, sans-serif" font-size="${size}" fill="#00C2E0" text-anchor="middle">${label}</text>`,
    );
  }
  parts.push(
    `<text x="${width / 2}" y="${height / 2 + size * 2}" font-family="DejaVu Sans, sans-serif" font-size="${size}" fill="#FFFFFF" text-anchor="middle">DEMO 360° — TEST ONLY — NOT A CAR INTERIOR</text>`,
    '</svg>',
  );
  const img = sharp(Buffer.from(parts.join('')));
  return opts.format === 'png'
    ? img.png().toBuffer()
    : img.jpeg({ quality: opts.quality ?? 85 }).toBuffer();
}

/** A flat test photo (not a panorama). */
export async function flatImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 92, b: 255 } },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 3}" fill="#00C2E0"/></svg>`,
        ),
      },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();
}

export const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

export interface UploadOptions {
  kind: 'image' | 'panorama' | 'video' | 'document';
  filename?: string;
  mimeType?: string;
  chunkSize?: number;
  sha256?: string;
  licenseId?: string;
  purpose?: string;
}

/** Starts a session and sends every chunk; returns the session id. */
export async function uploadChunks(
  t: TestApp,
  who: LoggedIn,
  body: Buffer,
  opts: UploadOptions,
): Promise<string> {
  const created = await t
    .http()
    .post('/api/v1/admin/media/uploads')
    .set(auth(who))
    .send({
      filename: opts.filename ?? `test-${opts.kind}.jpg`,
      sizeBytes: body.length,
      mimeType: opts.mimeType ?? 'image/jpeg',
      kind: opts.kind,
      ...(opts.sha256 ? { sha256: opts.sha256 } : {}),
      ...(opts.licenseId ? { licenseId: opts.licenseId } : {}),
      ...(opts.purpose ? { purpose: opts.purpose } : {}),
      ...(opts.chunkSize ? { chunkSizeBytes: opts.chunkSize } : {}),
    })
    .expect(201);
  const id = created.body.data.id as string;
  const chunk = opts.chunkSize ?? 256 * 1024;
  for (let offset = 0; offset < body.length; offset += chunk) {
    await sendChunk(t, who, id, offset, body.subarray(offset, offset + chunk)).expect(204);
  }
  return id;
}

export function sendChunk(t: TestApp, who: LoggedIn, id: string, offset: number, bytes: Buffer) {
  return t
    .http()
    .patch(`/api/v1/admin/media/uploads/${id}`)
    .set(auth(who))
    .set('Upload-Offset', String(offset))
    .set('Content-Type', 'application/offset+octet-stream')
    .send(bytes);
}

export async function completeUpload(t: TestApp, who: LoggedIn, id: string): Promise<Response> {
  return t.http().post(`/api/v1/admin/media/uploads/${id}/complete`).set(auth(who));
}

/** Upload + complete; expects success and returns the asset view. */
export async function uploadAsset(
  t: TestApp,
  who: LoggedIn,
  body: Buffer,
  opts: UploadOptions,
): Promise<{ id: string; warnings: { code: string; severity: string }[]; [k: string]: unknown }> {
  const id = await uploadChunks(t, who, body, opts);
  const res = await completeUpload(t, who, id);
  if (res.status !== 201)
    throw new Error(`complete failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

/** Runs the media processing job inline (tests run without BullMQ workers). */
export async function processInline(t: TestApp, assetId: string) {
  return t.app.get(MediaProcessingService).process(assetId);
}

export async function createLicense(t: TestApp, who: LoggedIn, body: Record<string, unknown> = {}) {
  const res = await t
    .http()
    .post('/api/v1/admin/media/licenses')
    .set(auth(who))
    .send({
      licenseType: 'owned',
      rightsHolder: 'EV Car News test fixtures (synthetic images)',
      ...body,
    })
    .expect(201);
  return res.body.data as { id: string };
}

/** Confirms the visual check acknowledging every warning of the asset. */
export async function confirmVisual(t: TestApp, who: LoggedIn, assetId: string) {
  const asset = await t
    .http()
    .get(`/api/v1/admin/media/assets/${assetId}`)
    .set(auth(who))
    .expect(200);
  const codes = (asset.body.data.warnings as { code: string; severity: string }[])
    .filter((w) => w.severity === 'warning')
    .map((w) => w.code);
  return t
    .http()
    .post(`/api/v1/admin/media/assets/${assetId}/visual-check`)
    .set(auth(who))
    .send({
      confirmed: true,
      acknowledgedWarnings: codes,
      note: 'Checked the synthetic test grid.',
    })
    .expect(200);
}

/** A panorama asset that is uploaded, processed, licensed and visually confirmed. */
export async function readyPanorama(
  t: TestApp,
  who: LoggedIn,
  opts: { width?: number; tint?: string; licenseId?: string } = {},
): Promise<string> {
  const license = opts.licenseId ?? (await createLicense(t, who)).id;
  const asset = await uploadAsset(
    t,
    who,
    await syntheticPanorama(opts.width ?? 2048, undefined, { tint: opts.tint }),
    {
      kind: 'panorama',
      licenseId: license,
      purpose: 'tour_scene',
    },
  );
  await processInline(t, asset.id);
  await confirmVisual(t, who, asset.id);
  return asset.id;
}
