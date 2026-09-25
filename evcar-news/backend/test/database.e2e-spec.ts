import { Prisma } from '../src/generated/prisma/client';
import { createOwnerSetup } from '../src/cli/owner-setup';
import { DEMO_STATION_LOCATION, runDemoSeed } from '../src/cli/seed-data/demo-seed';
import { runReferenceSeed } from '../src/cli/seed-data/reference-seed';
import { normalizeSearchText } from '../src/common/i18n/arabic-normalize';
import { hashToken } from '../src/common/security/tokens';
import { createTestApp, type TestApp } from './utils/test-app';

describe('Database schema, seeds and helpers (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  it('has the reference seed (roles, markets, currencies, connector types, settings)', async () => {
    const roles = await t.prisma.role.findMany({ select: { key: true } });
    expect(roles.map((r) => r.key).sort()).toEqual(
      [
        'admin',
        'community_moderator',
        'content_reviewer',
        'editor',
        'owner',
        'station_manager',
        'user',
        'vehicle_data_manager',
      ].sort(),
    );
    const markets = await t.prisma.market.findMany({ orderBy: { sortOrder: 'asc' } });
    expect(markets.map((m) => [m.code, m.currencyCode, m.timezone])).toEqual([
      ['EG', 'EGP', 'Africa/Cairo'],
      ['SA', 'SAR', 'Asia/Riyadh'],
      ['AE', 'AED', 'Asia/Dubai'],
    ]);
    const connectorCodes = (await t.prisma.connectorType.findMany()).map((c) => c.code).sort();
    expect(connectorCodes).toEqual([
      'bs1363',
      'ccs1',
      'ccs2',
      'chademo',
      'chaoji',
      'gbt_ac',
      'gbt_dc',
      'iec60309',
      'nacs',
      'schuko',
      'type1',
      'type2',
    ]);
    const branding = await t.prisma.appSetting.findUnique({ where: { key: 'branding' } });
    expect(branding?.value).toMatchObject({
      appName: 'EV Car News',
      primaryColor: '#0A5CFF',
      accentColor: '#00C2E0',
    });
    const share = await t.prisma.appSetting.findUnique({ where: { key: 'share' } });
    expect(share?.value).toMatchObject({ baseUrl: 'https://evcar.news' });
    const owner = await t.prisma.role.findUnique({
      where: { key: 'owner' },
      include: { permissions: true },
    });
    expect(owner?.permissions.length).toBe(await t.prisma.permission.count());
    const user = await t.prisma.role.findUnique({
      where: { key: 'user' },
      include: { permissions: true },
    });
    expect(user?.permissions).toHaveLength(0);
  });

  it('SQL app_normalize_text() matches the TypeScript normalizer', async () => {
    const samples = [
      'أحمد إسلام آمال',
      'السَّيَّارَةُ الكَهْرَبَائِيَّةُ',
      'مؤسسة ـــ على ٢٠٢٥ ۱۲',
      'ی ک ﻻ ٱلكتاب',
      '  BYD   Seal  Škoda Citroën ë-C4 ',
      'Tesla Model 3 — تسلا موديل ٣',
    ];
    for (const s of samples) {
      const [row] = await t.prisma.$queryRaw<{ n: string }[]>`SELECT app_normalize_text(${s}) AS n`;
      expect(row.n).toBe(normalizeSearchText(s));
    }
  });

  it('maintains search columns and aliases by trigger', async () => {
    const doc = await t.prisma.searchDocument.create({
      data: {
        entityType: 'brand',
        entityId: '0197f0b0-0000-7000-8000-000000000001',
        locale: 'ar',
        title: 'بي واي دي',
        body: 'سيارات كهربائية',
        isPublished: true,
      },
    });
    expect(doc.normalizedTitle).toBe('بي واي دي');
    const hits = await t.prisma.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM search_documents
      WHERE search_vector @@ plainto_tsquery('simple', app_normalize_text(${'كهربائيه'}))`;
    expect(hits.map((h) => h.id)).toContain(doc.id);
    const alias = await t.prisma.searchAlias.findFirst({ where: { term: 'تسلا' } });
    expect(alias?.canonicalNormalized).toBe('tesla');
  });

  it('computes PostGIS locations and finds nearby stations', async () => {
    const station = await t.prisma.chargingStation.create({
      data: {
        name: 'Geo test station',
        latitude: 30.0444,
        longitude: 31.2357,
        countryCode: 'EG',
        timezone: 'Africa/Cairo',
      },
    });
    const far = await t.prisma.chargingStation.create({
      data: {
        name: 'Far test station',
        latitude: 24.7136,
        longitude: 46.6753,
        countryCode: 'SA',
        timezone: 'Asia/Riyadh',
      },
    });
    const near = await t.prisma.findNearby({
      table: 'charging_stations',
      center: { lat: 30.05, lng: 31.24 },
      radiusMeters: 5_000,
      limit: 10,
    });
    expect(near.map((n) => n.id)).toEqual([station.id]);
    expect(near[0].distanceMeters).toBeGreaterThan(0);
    expect(near[0].distanceMeters).toBeLessThan(1_500);
    const plan = await t.prisma.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
      `EXPLAIN SELECT id FROM charging_stations WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(31.24, 30.05), 4326)::geography, 5000)`,
    );
    expect(plan.length).toBeGreaterThan(0);
    expect(far.id).toBeDefined();
  });

  it('enforces CHECK constraints (e.g. SoC 0..100, reference tours)', async () => {
    await expect(
      t.prisma
        .$executeRaw`INSERT INTO charging_curve_points (id, curve_id, soc_percent, power_kw) VALUES (gen_random_uuid(), gen_random_uuid(), 120, 50)`,
    ).rejects.toThrow(/check constraint|violates/i);
    await expect(
      t.prisma.chargingStation.create({
        data: {
          name: 'bad',
          latitude: 95,
          longitude: 0,
          countryCode: 'EG',
          timezone: 'Africa/Cairo',
        },
      }),
    ).rejects.toThrow();
  });

  it('demo seed is idempotent and flags everything as demo', async () => {
    const first = await runDemoSeed(t.prisma);
    const second = await runDemoSeed(t.prisma);
    expect(second).toEqual(first);
    const variants = await t.prisma.vehicleVariant.findMany({ where: { isDemo: true } });
    expect(new Set(variants.map((v) => v.powertrainType))).toEqual(new Set(['BEV', 'PHEV']));
    const station = await t.prisma.chargingStation.findFirst({ where: { isDemo: true } });
    expect(station?.addressLine).toBeNull();
    expect(station?.name).toContain('DEMO');
    // Never on a real place: open water off the coast, not e.g. central Cairo.
    expect([Number(station?.latitude), Number(station?.longitude)]).toEqual([
      DEMO_STATION_LOCATION.latitude,
      DEMO_STATION_LOCATION.longitude,
    ]);
    const brand = await t.prisma.brand.findUnique({ where: { slug: 'demo-motors' } });
    expect(brand?.isDemo).toBe(true);
  });

  it('create-owner grants the owner role and stores only a token hash', async () => {
    const result = await createOwnerSetup(t.prisma, ' Boss@Example.TEST ', 'Boss');
    expect(result.email).toBe('boss@example.test');
    const user = await t.prisma.user.findUnique({
      where: { email: 'boss@example.test' },
      include: { roles: { include: { role: true } } },
    });
    expect(user?.passwordHash).toBeNull();
    expect(user?.roles.map((r) => r.role.key).sort()).toEqual(['owner', 'user']);
    const token = await t.prisma.emailToken.findFirst({
      where: { userId: result.userId, purpose: 'setup_password' },
    });
    expect(token?.tokenHash).toBe(hashToken(result.token));
    expect(token?.tokenHash).not.toContain(result.token);
    // Re-running issues a new token and invalidates the old one.
    const again = await createOwnerSetup(t.prisma, 'boss@example.test');
    expect(again.created).toBe(false);
    const active = await t.prisma.emailToken.count({
      where: { userId: result.userId, purpose: 'setup_password', usedAt: null },
    });
    expect(active).toBe(1);
  });

  it('exposes Prisma Decimal for money columns', async () => {
    const rate = await t.prisma.exchangeRate.create({
      data: {
        baseCurrency: 'USD',
        quoteCurrency: 'EGP',
        rate: '48.12345678',
        effectiveAt: new Date(),
      },
    });
    expect(rate.rate).toBeInstanceOf(Prisma.Decimal);
    expect(rate.rate.toString()).toBe('48.12345678');
  });
});

describe('Reference seed re-runs (every deploy) keep admin decisions (e2e)', () => {
  // Own database: these tests change settings, currencies and role permissions.
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  it('is idempotent and preserves admin-changed settings', async () => {
    await t.prisma.appSetting.update({
      where: { key: 'branding' },
      data: { value: { appName: 'Changed by admin' } },
    });
    const before = await t.prisma.rolePermission.count();
    const summary = await runReferenceSeed(t.prisma);
    expect(summary.rolePermissionsAdded).toBe(0);
    expect(summary.appSettingsAdded).toBe(0);
    expect(await t.prisma.rolePermission.count()).toBe(before);
    const branding = await t.prisma.appSetting.findUnique({ where: { key: 'branding' } });
    expect(branding?.value).toEqual({ appName: 'Changed by admin' });
  });

  it('never re-grants a permission an owner removed from a role', async () => {
    const editor = await t.prisma.role.findUniqueOrThrow({ where: { key: 'editor' } });
    const perm = await t.prisma.permission.findUniqueOrThrow({ where: { key: 'articles.create' } });
    await t.prisma.rolePermission.delete({
      where: { roleId_permissionId: { roleId: editor.id, permissionId: perm.id } },
    });
    const summary = await runReferenceSeed(t.prisma);
    expect(summary.rolePermissionsAdded).toBe(0);
    expect(
      await t.prisma.rolePermission.count({
        where: { roleId: editor.id, permissionId: perm.id },
      }),
    ).toBe(0);
  });

  it('grants permissions that are NEW in code to existing roles, with an audit row', async () => {
    // Simulate "articles.create was added to the editor role in a new release":
    // the seed has never granted it before.
    const editor = await t.prisma.role.findUniqueOrThrow({ where: { key: 'editor' } });
    const perm = await t.prisma.permission.findUniqueOrThrow({ where: { key: 'articles.create' } });
    await t.prisma.rolePermission.deleteMany({
      where: { roleId: editor.id, permissionId: perm.id },
    });
    await t.prisma.seededRolePermission.delete({
      where: { roleKey_permissionKey: { roleKey: 'editor', permissionKey: 'articles.create' } },
    });
    const summary = await runReferenceSeed(t.prisma);
    expect(summary.rolePermissionsAdded).toBe(1);
    expect(
      await t.prisma.rolePermission.count({ where: { roleId: editor.id, permissionId: perm.id } }),
    ).toBe(1);
    const audit = await t.prisma.auditLog.findFirstOrThrow({
      where: { action: 'roles.permissions.seed_grant', entityId: 'editor' },
    });
    expect(audit.actorLabel).toBe('seed:reference');
    expect(audit.after).toMatchObject({ added: ['articles.create'] });
  });

  it('adopts the current state on a database seeded before tracking existed', async () => {
    const admin = await t.prisma.role.findUniqueOrThrow({ where: { key: 'admin' } });
    const perm = await t.prisma.permission.findUniqueOrThrow({ where: { key: 'audit.read' } });
    await t.prisma.rolePermission.delete({
      where: { roleId_permissionId: { roleId: admin.id, permissionId: perm.id } },
    });
    await t.prisma.seededRolePermission.deleteMany({ where: { roleKey: 'admin' } });
    await runReferenceSeed(t.prisma);
    expect(
      await t.prisma.rolePermission.count({ where: { roleId: admin.id, permissionId: perm.id } }),
    ).toBe(0);
    expect(
      await t.prisma.seededRolePermission.count({ where: { roleKey: 'admin' } }),
    ).toBeGreaterThan(0);
  });

  it('does not overwrite currencies edited by an admin', async () => {
    await t.prisma.currency.update({
      where: { code: 'EGP' },
      data: { symbolEn: 'LE', decimals: 0 },
    });
    await runReferenceSeed(t.prisma);
    const egp = await t.prisma.currency.findUniqueOrThrow({ where: { code: 'EGP' } });
    expect(egp).toMatchObject({ symbolEn: 'LE', decimals: 0 });
  });
});
