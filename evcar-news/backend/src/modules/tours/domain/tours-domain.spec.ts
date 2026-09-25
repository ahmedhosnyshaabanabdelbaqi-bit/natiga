import { positionLabel, textIn } from './labels';
import { slugify, toPlainText } from './plain-text';
import { evaluateReadiness, type ReadinessAsset, type ReadinessInput } from './tour-readiness';

/** The database CHECK on hotspot texts: no "<" followed by a letter, "/", "!" or "?". */
const DB_PLAIN = /<[A-Za-z/!?]/;

describe('hotspot plain text', () => {
  const title = (s: string) => toPlainText(s, { multiline: false });
  const body = (s: string) => toPlainText(s, { multiline: true });

  it.each([
    ['<b>Screen</b>', 'Screen'],
    ['<script>alert(1)</script>Seat', 'Seat'],
    ['<style>*{}</style><p>Roof</p>', 'Roof'],
    ['<img src=x onerror=alert(1)>Vents', 'Vents'],
    ['<a href="javascript:alert(1)">Link</a>', 'Link'],
    ['A &amp; B', 'A & B'],
    ['&lt;script&gt;x', '< script>x'],
    ['5 < 6 and 7 > 3', '5 < 6 and 7 > 3'],
    ['<scr<b>ipt>alert(1)</script>', 'ipt>alert(1)'],
    ['<!-- hidden -->Visible', 'Visible'],
    ['  many    spaces\n\tand\nlines ', 'many spaces and lines'],
    ['‮evil​', 'evil'],
    ['الشاشة <b>المركزية</b>', 'الشاشة المركزية'],
    ['&#60;iframe&#62;', '< iframe>'],
  ])('title %j → %j', (input, expected) => {
    const out = title(input);
    expect(out).toBe(expected);
    expect(DB_PLAIN.test(out)).toBe(false);
  });

  it('keeps line breaks in bodies', () => {
    expect(body('Line 1<br>Line 2<p>Para</p>\n\n\n\nEnd')).toBe('Line 1\nLine 2\nPara\n\nEnd');
    expect(body('<ul><li>One</li><li>Two</li></ul>')).toBe('One\nTwo');
  });

  it('returns an empty string for markup-only input', () => {
    expect(title('<b></b><script>x</script>')).toBe('');
  });

  it('slugifies colour names', () => {
    expect(slugify('Grey / Red')).toBe('grey-red');
    expect(slugify('أسود')).toBe('');
    expect(slugify('Café Noir')).toBe('cafe-noir');
  });
});

describe('labels', () => {
  it('localizes positions and falls back between languages', () => {
    expect(positionLabel('driver', 'ar')).toBe('مقعد السائق');
    expect(positionLabel('rear', 'en')).toBe('Rear seats');
    expect(positionLabel('unknown', 'en')).toBe('Other view');
    expect(textIn('en', 'عربي', null)).toBe('عربي');
    expect(textIn('ar', ' ', ' ')).toBeNull();
  });
});

describe('tour readiness', () => {
  const asset = (over: Partial<ReadinessAsset> = {}): ReadinessAsset => ({
    id: 'a1',
    kind: 'panorama',
    status: 'ready',
    deleted: false,
    licensed: true,
    licenseValidity: 'valid',
    visualCheckConfirmed: true,
    hasTiles: true,
    ...over,
  });
  const input = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
    tour: {
      matchType: 'exact',
      approved: false,
      differenceNoteAr: null,
      differenceNoteEn: null,
      initialSceneId: 's1',
      driveSide: 'lhd',
    },
    variantMarket: { availability: 'available', driveSide: 'lhd' },
    variantPublic: true,
    scenes: [{ id: 's1', key: 'driver', asset: asset() }],
    hotspots: [{ id: 'h1', sceneId: 's1', type: 'info', locales: ['ar', 'en'], media: null }],
    otherPublishedTourId: null,
    ...over,
  });
  const codes = (i: ReadinessInput) => evaluateReadiness(i).problems.map((p) => p.code);

  it('is publishable when everything is ready, licensed and confirmed', () => {
    const r = evaluateReadiness(input());
    expect(r).toMatchObject({ publishable: true, problems: [], warnings: [] });
  });

  it('needs scenes and an initial scene', () => {
    expect(codes(input({ scenes: [] }))).toEqual(['no_scenes']);
    expect(codes(input({ tour: { ...input().tour, initialSceneId: null } }))).toEqual([
      'no_initial_scene',
    ]);
  });

  it('blocks unprocessed, unlicensed, expired, unconfirmed or deleted scene files', () => {
    expect(
      codes(input({ scenes: [{ id: 's1', key: 'd', asset: asset({ status: 'processing' }) }] })),
    ).toEqual(['scene_asset_not_ready']);
    expect(
      codes(
        input({
          scenes: [
            { id: 's1', key: 'd', asset: asset({ licensed: false, licenseValidity: null }) },
          ],
        }),
      ),
    ).toEqual(['scene_asset_unlicensed']);
    expect(
      codes(
        input({ scenes: [{ id: 's1', key: 'd', asset: asset({ licenseValidity: 'expired' }) }] }),
      ),
    ).toEqual(['scene_licence_expired']);
    expect(
      codes(
        input({
          scenes: [{ id: 's1', key: 'd', asset: asset({ licenseValidity: 'not_yet_valid' }) }],
        }),
      ),
    ).toEqual(['scene_licence_not_yet_valid']);
    expect(
      codes(
        input({ scenes: [{ id: 's1', key: 'd', asset: asset({ visualCheckConfirmed: false }) }] }),
      ),
    ).toEqual(['scene_visual_check_missing']);
    expect(
      codes(input({ scenes: [{ id: 's1', key: 'd', asset: asset({ deleted: true }) }] })),
    ).toEqual(['scene_asset_deleted']);
    expect(
      codes(input({ scenes: [{ id: 's1', key: 'd', asset: asset({ kind: 'image' }) }] })),
    ).toEqual(['scene_asset_not_panorama']);
  });

  it('checks hotspot files and both translations', () => {
    expect(
      codes(
        input({
          hotspots: [
            {
              id: 'h1',
              sceneId: 's1',
              type: 'detail_image',
              locales: ['ar'],
              media: asset({
                kind: 'image',
                status: 'uploaded',
                licensed: false,
                licenseValidity: null,
              }),
            },
          ],
        }),
      ),
    ).toEqual([
      'hotspot_media_asset_not_ready',
      'hotspot_media_asset_unlicensed',
      'hotspot_translation_missing',
    ]);
  });

  it('requires approval + notes for reference tours of a similar trim', () => {
    const ref = { ...input().tour, matchType: 'reference_similar_trim' as const };
    expect(codes(input({ tour: ref }))).toEqual([
      'reference_notes_missing',
      'reference_not_approved',
    ]);
    expect(
      codes(
        input({ tour: { ...ref, differenceNoteAr: 'x', differenceNoteEn: 'y', approved: true } }),
      ),
    ).toEqual([]);
  });

  it('checks the market, the drive side and duplicates', () => {
    expect(codes(input({ variantMarket: null }))).toEqual(['variant_not_in_market']);
    expect(
      codes(input({ variantMarket: { availability: 'not_available', driveSide: null } })),
    ).toEqual(['variant_not_in_market']);
    expect(
      codes(input({ variantMarket: { availability: 'coming_soon', driveSide: 'rhd' } })),
    ).toEqual(['drive_side_mismatch']);
    expect(codes(input({ otherPublishedTourId: 'x' }))).toEqual(['duplicate_published']);
  });

  it('warns (without blocking) about private trims and scenes without tiles', () => {
    const r = evaluateReadiness(
      input({
        variantPublic: false,
        scenes: [{ id: 's1', key: 'd', asset: asset({ hasTiles: false }) }],
      }),
    );
    expect(r.publishable).toBe(true);
    expect(r.warnings.map((w) => w.code)).toEqual(['scene_without_tiles', 'variant_not_public']);
  });
});
