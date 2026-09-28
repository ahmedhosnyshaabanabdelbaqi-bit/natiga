/**
 * Review 3: a fresh install starts with every feature flag off; the documented
 * `db:seed -- --enable-implemented-features` switches on exactly the
 * implemented ones (audited, idempotent) and /app-config then announces them
 * (the trip planner stays hidden without a routing provider).
 */
import { enableImplementedFeatures } from '../src/cli/seed-data/enable-features';
import { IMPLEMENTED_FEATURES } from '../src/modules/settings/settings.types';
import { createTestApp, type TestApp } from './utils/test-app';

describe('Seed: enable implemented features (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  it('turns on implemented features only, audits it, and is idempotent', async () => {
    const before = await t.http().get('/api/v1/app-config').expect(200);
    expect(before.body.data.features.news).toBe(false);

    const enabled = await enableImplementedFeatures(t.prisma);
    expect(new Set(enabled)).toEqual(new Set(IMPLEMENTED_FEATURES));
    const row = await t.prisma.appSetting.findUniqueOrThrow({ where: { key: 'features' } });
    const value = row.value as Record<string, boolean>;
    for (const f of IMPLEMENTED_FEATURES) expect(value[f]).toBe(true);
    for (const f of ['assistant', 'ads', 'exteriorSpin']) expect(value[f]).toBe(false);
    expect(
      await t.prisma.auditLog.count({ where: { action: 'settings.features.seed_enable' } }),
    ).toBe(1);

    expect(await enableImplementedFeatures(t.prisma)).toEqual([]);
    expect(
      await t.prisma.auditLog.count({ where: { action: 'settings.features.seed_enable' } }),
    ).toBe(1);
  });
});
