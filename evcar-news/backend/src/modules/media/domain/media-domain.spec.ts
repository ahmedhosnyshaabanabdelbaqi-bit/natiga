import {
  CUBE_FACES,
  directionToYawPitch,
  faceDirection,
  renderCubeFace,
  yawPitchToPixel,
} from './cubemap';
import { creditLine, daysLeft, licenseValidity } from './licenses';
import {
  imageRenditionWidths,
  isTwoToOne,
  maxBytesFor,
  originalKey,
  panoramaRenditionWidths,
  previewKey,
  tilesPrefix,
} from './media-rules';
import { multiresConfig, planMultires, tileCount, tileRects } from './multires';
import {
  measurePanorama,
  panoramaWarnings,
  parseGPano,
  unacknowledged,
  warningsToAcknowledge,
  type RawFrame,
} from './panorama-checks';
import { isAllowedEmbedUrl, parseEmbedVideo } from './video-embed';

describe('media rules', () => {
  it('accepts only 2:1 frames (± rounding)', () => {
    expect(isTwoToOne(4096, 2048)).toBe(true);
    expect(isTwoToOne(8192, 4096)).toBe(true);
    expect(isTwoToOne(4097, 2048)).toBe(true);
    expect(isTwoToOne(4096, 2000)).toBe(false);
    expect(isTwoToOne(3000, 2000)).toBe(false);
    expect(isTwoToOne(0, 0)).toBe(false);
  });

  it('never up-scales renditions and always offers one', () => {
    expect(panoramaRenditionWidths(8192)).toEqual([2048, 4096, 8192]);
    expect(panoramaRenditionWidths(6000)).toEqual([2048, 4096]);
    expect(panoramaRenditionWidths(2048)).toEqual([2048]);
    expect(panoramaRenditionWidths(1500)).toEqual([1500]);
    expect(imageRenditionWidths(1200)).toEqual([480, 960, 1200]);
    expect(imageRenditionWidths(5000)).toEqual([480, 960, 1600, 2400]);
    expect(imageRenditionWidths(300)).toEqual([300]);
  });

  it('caps kinds by the deployment limit', () => {
    expect(maxBytesFor('panorama', 1024 ** 3)).toBe(300 * 1024 * 1024);
    expect(maxBytesFor('video', 100)).toBe(100);
  });

  it('keeps originals private and derived files public', () => {
    expect(originalKey('a')).toBe('private/media/a/original');
    expect(previewKey('a')).toBe('public/media/a/preview-1024.jpg');
    expect(tilesPrefix('a')).toBe('public/media/a/tiles');
  });
});

describe('multires plan (Pannellum generate.py layout)', () => {
  it('plans a 4096 px panorama', () => {
    const plan = planMultires(4096);
    expect(plan).toMatchObject({ cubeResolution: 1296, tileResolution: 512, maxLevel: 3 });
    expect(plan.levels).toEqual([
      { level: 1, size: 324, tiles: 1 },
      { level: 2, size: 648, tiles: 2 },
      { level: 3, size: 1296, tiles: 3 },
    ]);
    expect(tileCount(plan)).toBe(6 * (1 + 4 + 9));
    expect(plan.fallbackSize).toBe(1024);
    expect(multiresConfig(plan)).toEqual({
      path: '/%l/%s%y_%x',
      fallbackPath: '/fallback/%s',
      extension: 'jpg',
      tileResolution: 512,
      maxLevel: 3,
      cubeResolution: 1296,
    });
  });

  it('plans 8192 and caps bigger sources, with integer level sizes', () => {
    const p8 = planMultires(8192);
    expect(p8.cubeResolution).toBe(2600);
    expect(p8.maxLevel).toBe(4);
    expect(planMultires(16384)).toEqual(p8);
    for (const w of [2048, 3000, 4096, 6000, 8192]) {
      const p = planMultires(w);
      for (const l of p.levels) expect(Number.isInteger(l.size)).toBe(true);
      expect(p.levels[0].size).toBeLessThanOrEqual(512);
    }
  });

  it('crops edge tiles to the face size', () => {
    const rects = tileRects({ level: 3, size: 1296, tiles: 3 }, 512);
    expect(rects).toHaveLength(9);
    expect(rects.at(-1)).toEqual({
      row: 2,
      col: 2,
      left: 1024,
      top: 1024,
      width: 272,
      height: 272,
    });
  });
});

describe('equirectangular → cube faces', () => {
  it('points the face centres at the six directions', () => {
    const at = (face: (typeof CUBE_FACES)[number]) => {
      const [x, y, z] = faceDirection(face, 0, 0);
      return directionToYawPitch(x, y, z).map((v) => Math.round(v) + 0);
    };
    expect(at('f')).toEqual([0, 0]);
    expect(at('r')).toEqual([90, 0]);
    expect(Math.abs(at('b')[0])).toBe(180);
    expect(at('l')).toEqual([-90, 0]);
    expect(at('u')[1]).toBe(90);
    expect(at('d')[1]).toBe(-90);
    // Up face: top edge towards the back, bottom edge towards the front.
    const [ux, uy, uz] = faceDirection('u', 0, -1);
    expect(Math.abs(Math.round(directionToYawPitch(ux, uy, uz)[0]))).toBe(180);
    const [dx, dy, dz] = faceDirection('d', 0, -1);
    expect(Math.round(directionToYawPitch(dx, dy, dz)[0])).toBe(0);
    // Right edge of the front face looks right.
    const [rx, ry, rz] = faceDirection('f', 1, 0);
    expect(Math.round(directionToYawPitch(rx, ry, rz)[0])).toBe(45);
  });

  it('maps yaw/pitch to equirectangular pixels', () => {
    expect(yawPitchToPixel(0, 0, 4096, 2048)).toEqual([2047.5, 1023.5]);
    expect(yawPitchToPixel(-180, 90, 4096, 2048)).toEqual([-0.5, -0.5]);
  });

  it('samples the right colours', () => {
    // 8×4 frame: columns by yaw (back, left, front, right), rows sky / floor.
    const W = 8;
    const H = 4;
    const data = new Uint8Array(W * H * 3);
    const colour = (x: number, y: number): [number, number, number] => {
      if (y === 0) return [255, 255, 255];
      if (y === H - 1) return [0, 0, 0];
      const q = Math.floor(((x + 1) % W) / 2); // 0 back, 1 left, 2 front, 3 right
      return (
        [
          [0, 0, 255],
          [255, 255, 0],
          [255, 0, 0],
          [0, 255, 0],
        ] as const
      )[q] as [number, number, number];
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) data.set(colour(x, y), (y * W + x) * 3);
    }
    const frame: RawFrame = { data, width: W, height: H, channels: 3 };
    const centre = (face: (typeof CUBE_FACES)[number]) => {
      const out = renderCubeFace(frame, face, 9);
      const i = (4 * 9 + 4) * 3;
      return [out[i], out[i + 1], out[i + 2]];
    };
    expect(centre('f')).toEqual([255, 0, 0]);
    expect(centre('r')).toEqual([0, 255, 0]);
    expect(centre('b')).toEqual([0, 0, 255]);
    expect(centre('l')).toEqual([255, 255, 0]);
    expect(centre('u')).toEqual([255, 255, 255]);
    expect(centre('d')).toEqual([0, 0, 0]);
  });
});

describe('panorama heuristics (2:1 alone is no proof)', () => {
  const frame = (fn: (x: number, y: number) => number, w = 64, h = 32): RawFrame => {
    const data = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) data.fill(fn(x, y), (y * w + x) * 3, (y * w + x) * 3 + 3);
    }
    return { data, width: w, height: h, channels: 3 };
  };

  it('accepts a seamless image whose poles converge', () => {
    // Brightness varies with pitch only (poles uniform), seam continuous.
    const m = measurePanorama(frame((x, y) => 40 + y * 5 + ((x * 7) % 5)));
    const w = panoramaWarnings({
      width: 8192,
      height: 4096,
      sizeBytes: 12_000_000,
      measures: m,
      gpano: parseGPano('<x GPano:ProjectionType="equirectangular"/>'),
    });
    expect(w).toEqual([]);
  });

  it('flags a flat photo stretched / padded to 2:1', () => {
    // Left half dark, right half bright: seam mismatch; top row varies → poles.
    const stretched = measurePanorama(frame((x) => (x < 32 ? 20 : 220)));
    const codes = panoramaWarnings({
      width: 4096,
      height: 2048,
      sizeBytes: 3_000_000,
      measures: stretched,
      gpano: null,
    }).map((x) => x.code);
    expect(codes).toEqual(
      expect.arrayContaining(['seam_mismatch', 'poles_not_converging', 'gpano_missing']),
    );

    const padded = measurePanorama(frame((x, y) => (y < 8 || y >= 24 ? 0 : 100 + ((x * 13) % 60))));
    expect(
      panoramaWarnings({
        width: 4096,
        height: 2048,
        sizeBytes: 3_000_000,
        measures: padded,
        gpano: null,
      }).map((x) => x.code),
    ).toContain('uniform_borders');
  });

  it('flags low resolution and suspiciously small files', () => {
    const codes = panoramaWarnings({
      width: 2048,
      height: 1024,
      sizeBytes: 20_000,
      measures: null,
      gpano: null,
    })
      .filter((w) => w.severity === 'warning')
      .map((w) => w.code);
    expect(codes).toEqual(['low_resolution', 'tiny_file']);
  });

  it('reads GPano XMP (partial panoramas, other projections)', () => {
    const xmp = `<rdf:Description GPano:ProjectionType="equirectangular"
      GPano:FullPanoWidthPixels="8000" GPano:FullPanoHeightPixels="4000"
      GPano:CroppedAreaImageWidthPixels="8000" GPano:CroppedAreaImageHeightPixels="2000"/>`;
    const g = parseGPano(xmp)!;
    expect(g).toMatchObject({
      projectionType: 'equirectangular',
      isPartial: true,
      croppedHeight: 2000,
    });
    expect(
      parseGPano('<GPano:ProjectionType>cylindrical</GPano:ProjectionType>')?.projectionType,
    ).toBe('cylindrical');
    expect(parseGPano(null)).toBeNull();
    expect(parseGPano('<x/>')).toBeNull();
    const codes = panoramaWarnings({
      width: 8000,
      height: 4000,
      sizeBytes: 1e7,
      measures: null,
      gpano: g,
    }).map((w) => w.code);
    expect(codes).toContain('gpano_partial');
  });

  it('requires every warning (not info) to be acknowledged', () => {
    const warnings = panoramaWarnings({
      width: 2048,
      height: 1024,
      sizeBytes: 20_000,
      measures: null,
      gpano: null,
    });
    expect(warningsToAcknowledge(warnings)).toEqual(['low_resolution', 'tiny_file']);
    expect(unacknowledged(warnings, ['low_resolution'])).toEqual(['tiny_file']);
    expect(unacknowledged(warnings, ['low_resolution', 'tiny_file'])).toEqual([]);
  });
});

describe('licences', () => {
  const today = new Date('2026-09-25T12:00:00Z');
  it('computes validity on calendar days', () => {
    expect(licenseValidity({ validFrom: null, validUntil: null }, today)).toBe('valid');
    expect(licenseValidity({ validFrom: null, validUntil: new Date('2026-09-25') }, today)).toBe(
      'valid',
    );
    expect(licenseValidity({ validFrom: null, validUntil: new Date('2026-09-24') }, today)).toBe(
      'expired',
    );
    expect(licenseValidity({ validFrom: new Date('2026-09-26'), validUntil: null }, today)).toBe(
      'not_yet_valid',
    );
    expect(daysLeft({ validFrom: null, validUntil: new Date('2026-10-05') }, today)).toBe(10);
    expect(daysLeft({ validFrom: null, validUntil: null }, today)).toBeNull();
  });

  it('picks the credit line (asset credit > attribution > rights holder)', () => {
    const l = { attributionText: 'Photo: A', rightsHolder: 'Agency' };
    expect(creditLine({ creditText: 'B' }, l)).toBe('B');
    expect(creditLine({ creditText: null }, l)).toBe('Photo: A');
    expect(
      creditLine({ creditText: null }, { attributionText: null, rightsHolder: 'Agency' }),
    ).toBe('Agency');
    expect(creditLine({ creditText: null }, null)).toBeNull();
  });
});

describe('video embed allow-list', () => {
  it.each([
    [
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
    ],
    ['https://youtu.be/aqz-KE-bpKQ', 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ'],
    [
      'https://www.youtube.com/embed/aqz-KE-bpKQ',
      'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
    ],
    ['https://vimeo.com/123456789', 'https://player.vimeo.com/video/123456789'],
    ['https://player.vimeo.com/video/123456789', 'https://player.vimeo.com/video/123456789'],
  ])('normalises %s', (url, embed) => {
    expect(parseEmbedVideo(url)?.embedUrl).toBe(embed);
    expect(isAllowedEmbedUrl(embed)).toBe(true);
  });

  it.each([
    'http://www.youtube.com/watch?v=aqz-KE-bpKQ',
    'https://youtube.com.evil.test/watch?v=aqz-KE-bpKQ',
    'https://www.youtube.com/watch?v=bad',
    'https://user:pw@www.youtube.com/watch?v=aqz-KE-bpKQ',
    'https://www.youtube.com:8443/watch?v=aqz-KE-bpKQ',
    'https://vimeo.com/channels/staff',
    'javascript:alert(1)',
    'not a url',
  ])('refuses %s', (url) => {
    expect(parseEmbedVideo(url)).toBeNull();
  });

  it('refuses stored URLs that are not the normalised embed', () => {
    expect(isAllowedEmbedUrl('https://www.youtube.com/watch?v=aqz-KE-bpKQ')).toBe(false);
  });
});
