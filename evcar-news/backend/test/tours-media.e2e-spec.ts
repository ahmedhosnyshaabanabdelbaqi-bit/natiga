/**
 * Media library (REQUIREMENTS §9): resumable uploads (offsets, resume after
 * an interruption, idempotent completion), validation (magic bytes, corrupt
 * files, 2:1 panoramas, checksum, size / type limits, suspicious-image
 * warnings), rights (licences, attribution), the editor's visual check,
 * embeds (allow-list) and permissions.
 */
import sharp from 'sharp';
import { STORAGE_PROVIDER } from '../src/providers/provider-tokens';
import type { StorageProvider } from '../src/providers/storage/storage.types';
import {
  auth,
  completeUpload,
  createLicense,
  flatImage,
  processInline,
  sendChunk,
  sha256,
  syntheticPanorama,
  tourStaff,
  uploadAsset,
  uploadChunks,
  type TourStaff,
} from './tours-helpers';
import { createAndLogin } from './auth-test-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

describe('Media library: uploads, validation, rights (e2e)', () => {
  let t: TestApp;
  let staff: TourStaff;
  let storage: StorageProvider;
  let pano: Buffer;

  beforeAll(async () => {
    t = await createTestApp();
    staff = await tourStaff(t);
    storage = t.app.get<StorageProvider>(STORAGE_PROVIDER);
    pano = await syntheticPanorama(2048);
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('resumable upload protocol', () => {
    it('resumes after an interruption from the offset the server reports', async () => {
      const body = pano;
      const chunk = 64 * 1024;
      const created = await t
        .http()
        .post('/api/v1/admin/media/uploads')
        .set(auth(staff.manager))
        .send({
          filename: 'driver.jpg',
          sizeBytes: body.length,
          mimeType: 'image/jpeg',
          kind: 'panorama',
          sha256: sha256(body),
          chunkSizeBytes: chunk,
          purpose: 'tour_scene',
        })
        .expect(201);
      const id = created.body.data.id as string;
      expect(created.headers['location']).toBe(`/api/v1/admin/media/uploads/${id}`);
      expect(created.headers['upload-offset']).toBe('0');
      expect(created.body.data).toMatchObject({
        status: 'active',
        kind: 'panorama',
        totalBytes: body.length,
        receivedBytes: 0,
        chunkSizeBytes: chunk,
      });

      // Two chunks arrive, then the connection drops.
      await sendChunk(t, staff.manager, id, 0, body.subarray(0, chunk)).expect(204);
      const second = await sendChunk(t, staff.manager, id, chunk, body.subarray(chunk, 2 * chunk));
      expect(second.status).toBe(204);
      expect(second.headers['upload-offset']).toBe(String(2 * chunk));

      // The client lost the last response and retries the second chunk: refused with the offset.
      const retry = await sendChunk(t, staff.manager, id, chunk, body.subarray(chunk, 2 * chunk));
      expect(retry.status).toBe(409);
      expect(retry.body.error).toMatchObject({
        code: 'UPLOAD_OFFSET_MISMATCH',
        details: { expectedOffset: 2 * chunk },
      });
      // A chunk too far ahead is refused too.
      await sendChunk(t, staff.manager, id, 5 * chunk, body.subarray(0, 10)).expect(409);

      // Resume: ask where to continue (tus-style HEAD and JSON GET).
      const head = await t
        .http()
        .head(`/api/v1/admin/media/uploads/${id}`)
        .set(auth(staff.manager))
        .expect(200);
      expect(head.headers['upload-offset']).toBe(String(2 * chunk));
      expect(head.headers['upload-length']).toBe(String(body.length));
      const state = await t
        .http()
        .get(`/api/v1/admin/media/uploads/${id}`)
        .set(auth(staff.manager))
        .expect(200);
      expect(state.body.data).toMatchObject({ receivedBytes: 2 * chunk, partsReceived: 2 });

      // Completing early is refused.
      const early = await completeUpload(t, staff.manager, id);
      expect(early.status).toBe(409);
      expect(early.body.error.code).toBe('UPLOAD_INCOMPLETE');

      for (let offset = 2 * chunk; offset < body.length; offset += chunk) {
        await sendChunk(t, staff.manager, id, offset, body.subarray(offset, offset + chunk)).expect(
          204,
        );
      }
      // Bytes beyond the declared length are refused.
      const extra = await sendChunk(t, staff.manager, id, body.length, Buffer.from('x'));
      expect(extra.status).toBe(413);

      const done = await completeUpload(t, staff.manager, id);
      expect(done.status).toBe(201);
      expect(done.body.data).toMatchObject({
        kind: 'panorama',
        status: 'uploaded',
        mimeType: 'image/jpeg',
        width: 2048,
        height: 1024,
        projection: 'equirectangular',
        checksumSha256: sha256(body),
        purpose: 'tour_scene',
        visualCheckRequired: true,
        visualCheck: null,
        license: null,
      });
      expect(done.body.data.processingJob).toHaveProperty('queued');
      // Warnings are shown, e.g. the resolution below the 4096 px recommendation.
      const codes = (done.body.data.warnings as { code: string }[]).map((w) => w.code);
      expect(codes).toContain('low_resolution');

      // The original is kept privately, byte for byte.
      const row = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: done.body.data.id } });
      expect(row.storageKey).toBe(`private/media/${row.id}/original`);
      expect(sha256(await storage.getBuffer(row.storageKey))).toBe(sha256(body));

      // Completing again (lost response) returns the same asset, never a duplicate.
      const again = await completeUpload(t, staff.manager, id);
      expect(again.status).toBe(201);
      expect(again.body.data.id).toBe(done.body.data.id);
      // The session is closed for new bytes.
      await sendChunk(t, staff.manager, id, 0, Buffer.from('x')).expect(410);
    });

    it('validates the Upload-Offset header and the chunk content type', async () => {
      const id = (
        await t
          .http()
          .post('/api/v1/admin/media/uploads')
          .set(auth(staff.manager))
          .send({ filename: 'a.jpg', sizeBytes: 100, mimeType: 'image/jpeg', kind: 'image' })
          .expect(201)
      ).body.data.id as string;
      const noHeader = await t
        .http()
        .patch(`/api/v1/admin/media/uploads/${id}`)
        .set(auth(staff.manager))
        .set('Content-Type', 'application/offset+octet-stream')
        .send(Buffer.from('abc'));
      expect(noHeader.status).toBe(400);
      expect(noHeader.body.error.code).toBe('UPLOAD_OFFSET_REQUIRED');
      const json = await t
        .http()
        .patch(`/api/v1/admin/media/uploads/${id}`)
        .set(auth(staff.manager))
        .set('Upload-Offset', '0')
        .send({ hello: 'world' });
      expect(json.status).toBe(415);
      // Cancelling frees the session.
      await t
        .http()
        .delete(`/api/v1/admin/media/uploads/${id}`)
        .set(auth(staff.manager))
        .expect(204);
      await sendChunk(t, staff.manager, id, 0, Buffer.from('abc')).expect(410);
    });

    it('refuses declared types a kind does not accept and files over the size limit', async () => {
      const bad = await t
        .http()
        .post('/api/v1/admin/media/uploads')
        .set(auth(staff.manager))
        .send({ filename: 'x.mp4', sizeBytes: 1000, mimeType: 'video/mp4', kind: 'panorama' });
      expect(bad.status).toBe(415);
      const huge = await t
        .http()
        .post('/api/v1/admin/media/uploads')
        .set(auth(staff.manager))
        .send({
          filename: 'x.jpg',
          sizeBytes: 400 * 1024 * 1024,
          mimeType: 'image/jpeg',
          kind: 'panorama',
        });
      expect(huge.status).toBe(413);
      expect(huge.body.error.code).toBe('UPLOAD_TOO_LARGE');
      const unknown = await t
        .http()
        .post('/api/v1/admin/media/uploads')
        .set(auth(staff.manager))
        .send({
          filename: 'x.jpg',
          sizeBytes: 10,
          mimeType: 'image/jpeg',
          kind: 'panorama',
          extra: 1,
        });
      expect(unknown.status).toBe(422);
    });

    it('keeps sessions private to their uploader and requires media.upload', async () => {
      const id = await uploadChunks(t, staff.manager, Buffer.from('partial'), {
        kind: 'document',
        mimeType: 'application/pdf',
      });
      await t.http().get(`/api/v1/admin/media/uploads/${id}`).set(auth(staff.editor)).expect(403);
      await t
        .http()
        .post('/api/v1/admin/media/uploads')
        .set(auth(staff.user))
        .send({ filename: 'a.jpg', sizeBytes: 10, mimeType: 'image/jpeg', kind: 'image' })
        .expect(403);
      await t
        .http()
        .post('/api/v1/admin/media/uploads')
        .send({ filename: 'a.jpg', sizeBytes: 10, mimeType: 'image/jpeg', kind: 'image' })
        .expect(401);
      await t.http().get('/api/v1/admin/media/assets').set(auth(staff.user)).expect(403);
    });
  });

  describe('validation', () => {
    const rejected = async (body: Buffer, opts: Parameters<typeof uploadChunks>[3]) => {
      const id = await uploadChunks(t, staff.manager, body, opts);
      const res = await completeUpload(t, staff.manager, id);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('MEDIA_REJECTED');
      const assetId = res.body.error.details.assetId as string;
      const row = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
      expect(row.status).toBe('rejected');
      // The bytes of a refused file are not kept.
      expect(await storage.exists(row.storageKey)).toBe(false);
      const session = await t.prisma.uploadSession.findUniqueOrThrow({ where: { id } });
      expect(session.status).toBe('aborted');
      return (res.body.error.details.problems as { code: string }[]).map((p) => p.code);
    };

    it('rejects a file whose bytes are not an image (magic bytes, not the declared type)', async () => {
      const fake = Buffer.concat([
        Buffer.from('<html><script>alert(1)</script></html>'),
        Buffer.alloc(2000, 7),
      ]);
      expect(await rejected(fake, { kind: 'panorama', mimeType: 'image/jpeg' })).toEqual([
        'unsupported_type',
      ]);
    });

    it('rejects a corrupt / truncated JPEG', async () => {
      const truncated = pano.subarray(0, Math.floor(pano.length * 0.6));
      expect(await rejected(truncated, { kind: 'panorama' })).toEqual(['corrupt']);
    });

    it('rejects a panorama that is not 2:1', async () => {
      const wide = await syntheticPanorama(3000, 2000);
      const codes = await rejected(wide, { kind: 'panorama' });
      expect(codes).toEqual(['not_2_to_1']);
    });

    it('rejects a panorama below the minimum width', async () => {
      expect(await rejected(await syntheticPanorama(1024), { kind: 'panorama' })).toEqual([
        'too_small',
      ]);
    });

    it('rejects a file whose SHA-256 differs from the declared one', async () => {
      expect(await rejected(pano, { kind: 'panorama', sha256: 'a'.repeat(64) })).toEqual([
        'checksum_mismatch',
      ]);
    });

    it('flags a flat photo padded to 2:1 (2:1 alone is no proof) without rejecting it', async () => {
      const flat = await flatImage(1600, 1000);
      const padded = await sharp({
        create: { width: 4096, height: 2048, channels: 3, background: '#000000' },
      })
        .composite([{ input: flat, left: 1248, top: 524 }])
        .jpeg({ quality: 85 })
        .toBuffer();
      const asset = await uploadAsset(t, staff.manager, padded, { kind: 'panorama' });
      const codes = asset.warnings.filter((w) => w.severity === 'warning').map((w) => w.code);
      expect(codes).toEqual(expect.arrayContaining(['uniform_borders', 'tiny_file']));
      // Admin detail explains in the request language.
      const detail = await t
        .http()
        .get(`/api/v1/admin/media/assets/${asset.id}?lang=ar`)
        .set(auth(staff.manager))
        .expect(200);
      const w = (detail.body.data.warnings as { code: string; message: string }[]).find(
        (x) => x.code === 'uniform_borders',
      );
      expect(w?.message).toMatch(/حواف/);
      expect(detail.body.data.validation.measures).toBeTruthy();
      expect(detail.body.data.originalUrl).toMatch(/\/api\/v1\/storage\/local\/private\/media\//);
    });

    it('accepts a PNG panorama and warns when the declared type differs from the bytes', async () => {
      const png = await syntheticPanorama(2048, 1024, { format: 'png' });
      const asset = await uploadAsset(t, staff.manager, png, {
        kind: 'panorama',
        mimeType: 'image/jpeg',
      });
      expect(asset).toMatchObject({ mimeType: 'image/png', status: 'uploaded' });
      expect(asset.warnings.map((w) => w.code)).toContain('declared_type_mismatch');
    });
  });

  describe('visual check of panoramas', () => {
    it('needs the processed preview and an explicit acknowledgement of every warning', async () => {
      const asset = await uploadAsset(t, staff.manager, pano, { kind: 'panorama' });
      const early = await t
        .http()
        .post(`/api/v1/admin/media/assets/${asset.id}/visual-check`)
        .set(auth(staff.manager))
        .send({ confirmed: true, acknowledgedWarnings: [] });
      expect(early.status).toBe(409);
      expect(early.body.error.code).toBe('MEDIA_NOT_READY');

      await processInline(t, asset.id);
      const missing = await t
        .http()
        .post(`/api/v1/admin/media/assets/${asset.id}/visual-check`)
        .set(auth(staff.manager))
        .send({ confirmed: true, acknowledgedWarnings: [] });
      expect(missing.status).toBe(422);
      expect(missing.body.error.code).toBe('MEDIA_WARNINGS_NOT_ACKNOWLEDGED');
      expect(missing.body.error.details.unacknowledged).toContain('low_resolution');

      const notConfirmed = await t
        .http()
        .post(`/api/v1/admin/media/assets/${asset.id}/visual-check`)
        .set(auth(staff.manager))
        .send({ confirmed: false });
      expect(notConfirmed.status).toBe(422);

      // The editor role has no tours.write / tours.publish: cannot confirm.
      await t
        .http()
        .post(`/api/v1/admin/media/assets/${asset.id}/visual-check`)
        .set(auth(staff.editor))
        .send({ confirmed: true, acknowledgedWarnings: missing.body.error.details.unacknowledged })
        .expect(403);

      const ok = await t
        .http()
        .post(`/api/v1/admin/media/assets/${asset.id}/visual-check`)
        .set(auth(staff.manager))
        .send({
          confirmed: true,
          acknowledgedWarnings: missing.body.error.details.unacknowledged,
          note: 'Grid looks straight; horizon level.',
        })
        .expect(200);
      expect(ok.body.data.visualCheck).toMatchObject({
        confirmedById: staff.manager.userId,
        note: 'Grid looks straight; horizon level.',
      });
      const audit = await t.prisma.auditLog.findFirst({
        where: { entityId: asset.id, action: 'media.visual_check.confirm' },
      });
      expect(audit).not.toBeNull();

      const revoked = await t
        .http()
        .delete(`/api/v1/admin/media/assets/${asset.id}/visual-check`)
        .set(auth(staff.manager))
        .expect(200);
      expect(revoked.body.data.visualCheck).toBeNull();
    });

    it('refuses the check on files that are not panoramas', async () => {
      const img = await uploadAsset(t, staff.manager, await flatImage(800, 600), { kind: 'image' });
      const res = await t
        .http()
        .post(`/api/v1/admin/media/assets/${img.id}/visual-check`)
        .set(auth(staff.manager))
        .send({ confirmed: true });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('MEDIA_NOT_PANORAMA');
    });
  });

  describe('licences and rights', () => {
    it('requires the credit line when attribution is required and validates dates', async () => {
      const noText = await t
        .http()
        .post('/api/v1/admin/media/licenses')
        .set(auth(staff.manager))
        .send({ licenseType: 'cc_by', rightsHolder: 'Someone', attributionRequired: true });
      expect(noText.status).toBe(422);
      expect(noText.body.error.details[0].field).toBe('attributionText');
      const dates = await t
        .http()
        .post('/api/v1/admin/media/licenses')
        .set(auth(staff.manager))
        .send({
          licenseType: 'licensed',
          rightsHolder: 'Agency',
          validFrom: '2027-01-01',
          validUntil: '2026-01-01',
        });
      expect(dates.status).toBe(422);
      const blankHolder = await t
        .http()
        .post('/api/v1/admin/media/licenses')
        .set(auth(staff.manager))
        .send({ licenseType: 'owned', rightsHolder: '   ' });
      expect(blankHolder.status).toBe(422);
      const http = await t
        .http()
        .post('/api/v1/admin/media/licenses')
        .set(auth(staff.manager))
        .send({ licenseType: 'owned', rightsHolder: 'X', licenseUrl: 'http://example.com' });
      expect(http.status).toBe(422);
    });

    it('records, assigns, lists expiring and protects licences in use', async () => {
      const lic = await createLicense(t, staff.manager, {
        licenseType: 'cc_by',
        rightsHolder: 'Test Photographer',
        attributionRequired: true,
        attributionText: 'Photo: Test Photographer (CC BY 4.0)',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        validUntil: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10),
      });
      const img = await uploadAsset(t, staff.manager, await flatImage(900, 600), { kind: 'image' });
      // Assigning a licence needs licenses.write (station managers only upload).
      const station = await createAndLogin(t, ['station_manager']);
      await t
        .http()
        .patch(`/api/v1/admin/media/assets/${img.id}`)
        .set(auth(station))
        .send({ licenseId: lic.id })
        .expect(403);
      const assigned = await t
        .http()
        .patch(`/api/v1/admin/media/assets/${img.id}`)
        .set(auth(staff.manager))
        .send({ licenseId: lic.id, altTextEn: 'Test image', altTextAr: 'صورة اختبار' })
        .expect(200);
      expect(assigned.body.data.license).toMatchObject({
        id: lic.id,
        attributionText: 'Photo: Test Photographer (CC BY 4.0)',
        isValid: true,
      });
      const expiring = await t
        .http()
        .get('/api/v1/admin/media/licenses?expiringWithinDays=30')
        .set(auth(staff.manager))
        .expect(200);
      const row = (
        expiring.body.data as { id: string; assetCount: number; daysLeft: number }[]
      ).find((l) => l.id === lic.id);
      expect(row).toMatchObject({ assetCount: 1, validity: 'valid' });
      expect(row?.daysLeft).toBeGreaterThanOrEqual(9);
      const del = await t
        .http()
        .delete(`/api/v1/admin/media/licenses/${lic.id}`)
        .set(auth(staff.manager));
      expect(del.status).toBe(409);
      expect(del.body.error.code).toBe('IN_USE');
      // Filter the library by licence state.
      const unlicensed = await t
        .http()
        .get('/api/v1/admin/media/assets?licensed=false&kind=image')
        .set(auth(staff.manager))
        .expect(200);
      expect((unlicensed.body.data as { id: string }[]).some((a) => a.id === img.id)).toBe(false);
    });
  });

  describe('versions, deletion and embeds', () => {
    it('keeps the version chain when a file is replaced', async () => {
      const v1 = await uploadAsset(t, staff.manager, pano, { kind: 'panorama' });
      expect(v1.version).toBe(1);
      const chained = await t
        .http()
        .post('/api/v1/admin/media/uploads')
        .set(auth(staff.manager))
        .send({
          filename: 'driver-v2.jpg',
          sizeBytes: pano.length,
          mimeType: 'image/jpeg',
          kind: 'panorama',
          previousVersionId: v1.id,
        })
        .expect(201);
      const chainedId = chained.body.data.id as string;
      for (let offset = 0; offset < pano.length; offset += 256 * 1024) {
        await sendChunk(
          t,
          staff.manager,
          chainedId,
          offset,
          pano.subarray(offset, offset + 256 * 1024),
        ).expect(204);
      }
      const done = await completeUpload(t, staff.manager, chainedId);
      expect(done.status).toBe(201);
      expect(done.body.data).toMatchObject({ version: 2, previousVersionId: v1.id });
      // Same bytes as an earlier file: reported as a duplicate, still accepted as a new version.
      const firstWithSameBytes = await t.prisma.mediaAsset.findFirst({
        where: { checksumSha256: sha256(pano), status: { not: 'rejected' } },
        orderBy: { createdAt: 'asc' },
      });
      expect(done.body.data.duplicateOf).toBe(firstWithSameBytes?.id);
      expect(done.body.data.duplicateOf).not.toBe(done.body.data.id);
      const versions = await t
        .http()
        .get(`/api/v1/admin/media/assets/${v1.id}/versions`)
        .set(auth(staff.manager))
        .expect(200);
      expect((versions.body.data as { id: string }[]).map((v) => v.id)).toEqual([
        v1.id,
        done.body.data.id,
      ]);
      // Another kind cannot be a version of a panorama.
      const wrongKind = await t
        .http()
        .post('/api/v1/admin/media/uploads')
        .set(auth(staff.manager))
        .send({
          filename: 'a.jpg',
          sizeBytes: 10,
          mimeType: 'image/jpeg',
          kind: 'image',
          previousVersionId: v1.id,
        });
      expect(wrongKind.status).toBe(422);
    });

    it('soft-deletes unused files only (media.manage)', async () => {
      const img = await uploadAsset(t, staff.manager, await flatImage(640, 480), { kind: 'image' });
      await t
        .http()
        .delete(`/api/v1/admin/media/assets/${img.id}`)
        .set(auth(staff.editor))
        .expect(403);
      await t
        .http()
        .delete(`/api/v1/admin/media/assets/${img.id}`)
        .set(auth(staff.manager))
        .expect(204);
      const row = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: img.id } });
      expect(row.deletedAt).not.toBeNull();
      // The original is kept (retention policy), only hidden.
      expect(await storage.exists(row.storageKey)).toBe(true);
      const list = await t
        .http()
        .get('/api/v1/admin/media/assets')
        .set(auth(staff.manager))
        .expect(200);
      expect((list.body.data as { id: string }[]).some((a) => a.id === img.id)).toBe(false);
    });

    it('registers allow-listed YouTube / Vimeo links only', async () => {
      const yt = await t
        .http()
        .post('/api/v1/admin/media/videos/embed')
        .set(auth(staff.manager))
        .send({ url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=10' })
        .expect(201);
      expect(yt.body.data).toMatchObject({
        kind: 'video',
        status: 'ready',
        embed: {
          provider: 'youtube',
          videoId: 'aqz-KE-bpKQ',
          embedUrl: 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
        },
      });
      for (const url of [
        'http://www.youtube.com/watch?v=aqz-KE-bpKQ',
        'https://evil.example.com/embed/aqz-KE-bpKQ',
        'https://www.youtube.com/watch?v=<script>',
        'https://vimeo.com/abc',
      ]) {
        const res = await t
          .http()
          .post('/api/v1/admin/media/videos/embed')
          .set(auth(staff.manager))
          .send({ url });
        expect(res.status).toBe(422);
      }
    });
  });
});
