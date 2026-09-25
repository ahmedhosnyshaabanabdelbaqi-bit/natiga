/**
 * Vehicle catalog (REQUIREMENTS §6/§7/§17): admin API with permissions and
 * audit, BEV vs PHEV separation, canonical units + original values,
 * verification rights, per-market availability / inlets / prices (never
 * converted, history order, no overlapping official periods) and the
 * public API used by the app (market filter, null never 0, spec sheet,
 * pickers). All data is fictional test data created by the test.
 */
import { userWithRoles, waitForAudit, type PlatformUser } from './platform-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

describe('Vehicles catalog (e2e)', () => {
  let t: TestApp;
  let manager: PlatformUser; // vehicle_data_manager: write + publish + verify + prices
  let admin: PlatformUser;
  let editor: PlatformUser; // vehicles.read only
  let writer: PlatformUser; // custom role: vehicles.read + vehicles.write
  let normal: PlatformUser;

  const ids: Record<string, string> = {};

  const post = (u: PlatformUser, path: string, body: unknown) =>
    t
      .http()
      .post(`/api/v1${path}`)
      .set(u.auth)
      .send(body as object);
  const patch = (u: PlatformUser, path: string, body: unknown) =>
    t
      .http()
      .patch(`/api/v1${path}`)
      .set(u.auth)
      .send(body as object);
  const put = (u: PlatformUser, path: string, body: unknown) =>
    t
      .http()
      .put(`/api/v1${path}`)
      .set(u.auth)
      .send(body as object);
  const get = (path: string, u?: PlatformUser) => {
    const r = t.http().get(`/api/v1${path}`);
    return u ? r.set(u.auth) : r;
  };

  beforeAll(async () => {
    t = await createTestApp();
    const role = await t.prisma.role.create({
      data: { key: 'e2e_vehicle_writer', nameEn: 'E2E writer', nameAr: 'كاتب اختبار' },
    });
    for (const key of ['vehicles.read', 'vehicles.write']) {
      const p = await t.prisma.permission.findUniqueOrThrow({ where: { key } });
      await t.prisma.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
    }
    [manager, admin, editor, writer, normal] = await Promise.all([
      userWithRoles(t, ['vehicle_data_manager', 'user']),
      userWithRoles(t, ['admin', 'user']),
      userWithRoles(t, ['editor', 'user']),
      userWithRoles(t, ['e2e_vehicle_writer', 'user']),
      userWithRoles(t, ['user']),
    ]);
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('permissions', () => {
    it('guards every admin route on the server', async () => {
      await get('/admin/brands').expect(401);
      await get('/admin/brands', normal).expect(403);
      await post(normal, '/admin/brands', { nameEn: 'X', nameAr: 'س' }).expect(403);
      await get('/admin/brands', editor).expect(200);
      await post(editor, '/admin/brands', { nameEn: 'X', nameAr: 'س' }).expect(403);
      await post(writer, '/admin/spec-sources', { type: 'manufacturer', title: 'x' }).expect(403);
      const denied = await t.prisma.auditLog.count({
        where: { action: 'security.permission_denied' },
      });
      expect(denied).toBeGreaterThan(0);
    });
  });

  describe('admin hierarchy', () => {
    it('creates drafts with vehicles.write; publishing needs vehicles.publish', async () => {
      const brand = await post(writer, '/admin/brands', {
        nameEn: 'Voltara Test Motors',
        nameAr: 'فولتارا للاختبار',
        countryCode: 'EG',
      }).expect(201);
      expect(brand.body.data).toMatchObject({
        slug: 'voltara-test-motors',
        status: 'draft',
        modelCount: 0,
      });
      ids.brand = brand.body.data.id;

      const denied = await patch(writer, `/admin/brands/${ids.brand}`, {
        status: 'published',
      }).expect(403);
      expect(denied.body.error.code).toBe('PUBLISH_PERMISSION_REQUIRED');
      await post(writer, '/admin/brands', {
        nameEn: 'Another',
        nameAr: 'آخر',
        status: 'published',
      }).expect(403);

      await patch(manager, `/admin/brands/${ids.brand}`, { status: 'published' }).expect(200);
      const audit = await waitForAudit(t, 'brands.update');
      expect(audit.entityId).toBe(ids.brand);
      expect(audit.actorId).toBe(manager.id);

      // Explicit slug conflict → 409, bad slug → 422
      const dup = await post(manager, '/admin/brands', {
        slug: 'voltara-test-motors',
        nameEn: 'Dup',
        nameAr: 'مكرر',
      }).expect(409);
      expect(dup.body.error.code).toBe('SLUG_TAKEN');
      await post(manager, '/admin/brands', { slug: 'Bad Slug', nameEn: 'x', nameAr: 'x' }).expect(
        422,
      );

      const model = await post(manager, '/admin/models', {
        brandId: ids.brand,
        nameEn: 'Aero',
        nameAr: 'آيرو',
        bodyType: 'suv',
        status: 'published',
      }).expect(201);
      expect(model.body.data.slug).toBe('voltara-test-motors-aero');
      ids.model = model.body.data.id;

      const gen = await post(manager, '/admin/generations', {
        modelId: ids.model,
        nameEn: 'First generation',
        nameAr: 'الجيل الأول',
        startYear: 2024,
      }).expect(201);
      ids.gen = gen.body.data.id;
      await post(manager, '/admin/generations', {
        modelId: ids.model,
        nameEn: 'Bad',
        nameAr: 'خطأ',
        startYear: 2026,
        endYear: 2024,
      }).expect(422);

      const year = await post(manager, '/admin/model-years', {
        generationId: ids.gen,
        year: 2025,
      }).expect(201);
      ids.year = year.body.data.id;
      await post(manager, '/admin/model-years', { generationId: ids.gen, year: 2025 }).expect(409);
    });

    it('keeps BEV and PHEV of the same trim name as separate variants', async () => {
      const bev = await post(manager, '/admin/variants', {
        modelYearId: ids.year,
        nameEn: 'Long Range',
        nameAr: 'المدى الطويل',
        powertrainType: 'BEV',
        driveType: 'awd',
        seats: 5,
        status: 'published',
      }).expect(201);
      ids.bev = bev.body.data.id;
      expect(bev.body.data).toMatchObject({
        slug: 'voltara-test-motors-aero-2025-long-range-bev',
        powertrainType: 'BEV',
        status: 'published',
      });
      const phev = await post(manager, '/admin/variants', {
        modelYearId: ids.year,
        nameEn: 'Long Range',
        nameAr: 'المدى الطويل',
        powertrainType: 'PHEV',
        driveType: 'fwd',
        seats: 5,
        status: 'published',
      }).expect(201);
      ids.phev = phev.body.data.id;
      expect(phev.body.data.slug).toBe('voltara-test-motors-aero-2025-long-range-phev');

      const dup = await post(manager, '/admin/variants', {
        modelYearId: ids.year,
        nameEn: 'Long Range',
        nameAr: 'مكرر',
        powertrainType: 'BEV',
      }).expect(409);
      expect(dup.body.error.code).toBe('ALREADY_EXISTS');
      await post(manager, '/admin/variants', {
        modelYearId: ids.year,
        nameEn: 'No powertrain',
        nameAr: 'بدون',
      }).expect(422);
    });

    it('lists and shows the tree for the admin', async () => {
      const models = await get(`/admin/models?brandId=${ids.brand}`, editor).expect(200);
      expect(models.body.data[0]).toMatchObject({ id: ids.model, variantCount: 2 });
      const tree = await get(`/admin/models/${ids.model}`, editor).expect(200);
      expect(tree.body.data.generations[0].modelYears[0].variants).toHaveLength(2);
      const variants = await get(
        `/admin/variants?modelId=${ids.model}&powertrainType=PHEV`,
        editor,
      ).expect(200);
      expect(variants.body.data.map((v: { id: string }) => v.id)).toEqual([ids.phev]);
      expect(variants.body.data[0].visibilityBlockers).toEqual(['no_market_listing']);
    });
  });

  describe('data points', () => {
    it('creates a source (sources.write)', async () => {
      const s = await post(manager, '/admin/spec-sources', {
        type: 'manufacturer',
        title: 'Test specification sheet (fictional)',
        url: 'https://example.com/spec.pdf',
        documentDate: '2025-01-15',
      }).expect(201);
      ids.source = s.body.data.id;
    });

    it('stores specs in canonical units and keeps the published value', async () => {
      const res = await put(manager, `/admin/variants/${ids.bev}/specs`, {
        items: [
          {
            specKey: 'battery.usable_kwh',
            value: 75,
            sourceId: ids.source,
            reliability: 'manufacturer_claim',
          },
          { specKey: 'battery.gross_kwh', value: 80000, unit: 'Wh', sourceId: ids.source },
          { specKey: 'charging.dc_peak_kw', value: 150, sourceId: ids.source },
          { specKey: 'charging.ac_max_kw', value: 11 },
          { specKey: 'performance.power_kw', value: 250 },
          { specKey: 'safety.aeb', value: true },
          { specKey: 'battery.chemistry', value: 'LFP' },
          { specKey: 'warranty.vehicle_years', value: 5, marketCode: 'EG' },
        ],
      }).expect(200);
      const gross = res.body.data.find(
        (s: { specKey: string }) => s.specKey === 'battery.gross_kwh',
      );
      expect(gross).toMatchObject({
        value: 80,
        unit: 'kWh',
        originalValue: '80000',
        originalUnit: 'Wh',
      });

      const bad = await put(manager, `/admin/variants/${ids.bev}/specs`, {
        items: [{ specKey: 'battery.usable_kwh', value: 75, unit: 'km' }],
      }).expect(422);
      expect(bad.body.error.details[0]).toMatchObject({ field: 'items.0.unit' });
      await put(manager, `/admin/variants/${ids.bev}/specs`, {
        items: [{ specKey: 'battery.chemistry', value: 'LFP', unit: 'kWh' }],
      }).expect(422);
      await put(manager, `/admin/variants/${ids.bev}/specs`, {
        items: [{ specKey: 'no.such_key', value: 1 }],
      }).expect(422);
      await put(manager, `/admin/variants/${ids.bev}/specs`, {
        items: [{ specKey: 'battery.usable_kwh', value: -5 }],
      }).expect(422);

      await put(manager, `/admin/variants/${ids.phev}/specs`, {
        items: [{ specKey: 'battery.usable_kwh', value: 18.3, sourceId: ids.source }],
      }).expect(200);
    });

    it('refuses powertrain-inconsistent data (BEV vs hybrid)', async () => {
      const total = await post(manager, `/admin/variants/${ids.bev}/ranges`, {
        cycle: 'WLTP',
        rangeType: 'total',
        value: 900,
      }).expect(422);
      expect(total.body.error.code).toBe('NOT_APPLICABLE_TO_POWERTRAIN');
      await post(manager, `/admin/variants/${ids.bev}/consumption`, {
        cycle: 'WLTP',
        kind: 'fuel',
        value: 1.2,
      }).expect(422);

      const miles = await post(manager, `/admin/variants/${ids.bev}/ranges`, {
        cycle: 'WLTP',
        rangeType: 'electric',
        value: 310.7,
        unit: 'mi',
        sourceId: ids.source,
      }).expect(201);
      expect(miles.body.data).toMatchObject({
        valueKm: 500,
        originalValue: '310.7',
        originalUnit: 'mi',
        cycle: 'WLTP',
      });
      ids.bevRange = miles.body.data.id;
      await post(manager, `/admin/variants/${ids.bev}/ranges`, {
        cycle: 'CLTC',
        rangeType: 'electric',
        value: 610,
      }).expect(201);
      await post(manager, `/admin/variants/${ids.bev}/ranges`, {
        cycle: 'OTHER',
        rangeType: 'electric',
        value: 610,
      }).expect(422);
      await post(manager, `/admin/variants/${ids.bev}/ranges`, {
        cycle: 'WLTP',
        rangeType: 'electric',
        value: 500,
        unit: 'km',
      }).expect(409);

      await post(manager, `/admin/variants/${ids.phev}/ranges`, {
        cycle: 'WLTP',
        rangeType: 'electric',
        value: 80,
      }).expect(201);
      await post(manager, `/admin/variants/${ids.phev}/ranges`, {
        cycle: 'WLTP',
        rangeType: 'total',
        value: 950,
      }).expect(201);
      const fuel = await post(manager, `/admin/variants/${ids.phev}/consumption`, {
        cycle: 'WLTP',
        kind: 'fuel',
        mode: 'charge_sustaining',
        value: 5.1,
      }).expect(201);
      expect(fuel.body.data).toMatchObject({ unit: 'L/100km', value: 5.1 });
      const elec = await post(manager, `/admin/variants/${ids.bev}/consumption`, {
        cycle: 'WLTP',
        kind: 'electricity',
        value: 16.5,
        unit: 'kWh/100km',
      }).expect(201);
      expect(elec.body.data).toMatchObject({
        value: 165,
        unit: 'Wh/km',
        originalUnit: 'kWh/100km',
      });

      // The PHEV has a total range: it cannot become a BEV.
      const change = await patch(manager, `/admin/variants/${ids.phev}`, {
        powertrainType: 'BEV',
      }).expect(422);
      expect(change.body.error.code).toBe('NOT_APPLICABLE_TO_POWERTRAIN');
    });

    it('validates charging times and curves (SoC 0–100, from < to, charger condition)', async () => {
      await post(manager, `/admin/variants/${ids.bev}/charging-times`, {
        currentType: 'DC',
        fromSoc: 80,
        toSoc: 10,
        duration: 30,
        chargerPowerKw: 150,
      }).expect(422);
      await post(manager, `/admin/variants/${ids.bev}/charging-times`, {
        currentType: 'DC',
        fromSoc: 10,
        toSoc: 120,
        duration: 30,
        chargerPowerKw: 150,
      }).expect(422);
      const noCondition = await post(manager, `/admin/variants/${ids.bev}/charging-times`, {
        currentType: 'DC',
        fromSoc: 10,
        toSoc: 80,
        duration: 30,
      }).expect(422);
      expect(noCondition.body.error.details[0].field).toBe('chargerPowerKw');
      await post(manager, `/admin/variants/${ids.bev}/charging-times`, {
        currentType: 'DC',
        fromSoc: 10,
        toSoc: 80,
        duration: 30,
        chargerPowerKw: 150,
        peakPowerKw: 100,
        averagePowerKw: 120,
      }).expect(422);
      const ok = await post(manager, `/admin/variants/${ids.bev}/charging-times`, {
        currentType: 'DC',
        fromSoc: 10,
        toSoc: 80,
        duration: 0.5,
        durationUnit: 'h',
        chargerPowerKw: 150,
        peakPowerKw: 150,
        averagePowerKw: 95,
        sourceId: ids.source,
      }).expect(201);
      expect(ok.body.data).toMatchObject({ durationMinutes: 30, socWindow: '10–80%' });

      await post(manager, `/admin/variants/${ids.bev}/charging-curves`, {
        points: [
          { socPercent: 10, powerKw: 150 },
          { socPercent: 10, powerKw: 140 },
        ],
      }).expect(422);
      const curve = await post(manager, `/admin/variants/${ids.bev}/charging-curves`, {
        label: 'Test curve',
        chargerMaxPowerKw: 350,
        points: [
          { socPercent: 80, powerKw: 60 },
          { socPercent: 10, powerKw: 150 },
          { socPercent: 50, powerKw: 120 },
        ],
      }).expect(201);
      expect(curve.body.data.points.map((p: { socPercent: number }) => p.socPercent)).toEqual([
        10, 50, 80,
      ]);
      expect(curve.body.data.peakPowerKw).toBe(150);
    });

    it('verification needs specs.verify and is reset when the value changes', async () => {
      const denied = await put(writer, `/admin/variants/${ids.bev}/specs`, {
        items: [{ specKey: 'battery.usable_kwh', value: 75, reliability: 'verified' }],
      }).expect(403);
      expect(denied.body.error.code).toBe('VERIFY_PERMISSION_REQUIRED');
      const noSource = await put(manager, `/admin/variants/${ids.bev}/specs`, {
        items: [{ specKey: 'charging.ac_max_kw', value: 11, reliability: 'verified' }],
      }).expect(422);
      expect(noSource.body.error.details[0].field).toBe('items.0.sourceId');

      const verified = await put(manager, `/admin/variants/${ids.bev}/specs`, {
        items: [{ specKey: 'battery.usable_kwh', value: 75, reliability: 'verified' }],
      }).expect(200);
      const row = verified.body.data.find(
        (s: { specKey: string }) => s.specKey === 'battery.usable_kwh',
      );
      expect(row.reliability).toBe('verified');
      expect(row.verifiedAt).not.toBeNull();

      // Same value, no verification fields: allowed and stays verified.
      const same = await put(writer, `/admin/variants/${ids.bev}/specs`, {
        items: [{ specKey: 'battery.usable_kwh', value: 75, notes: 'checked' }],
      }).expect(200);
      expect(
        same.body.data.find((s: { specKey: string }) => s.specKey === 'battery.usable_kwh')
          .reliability,
      ).toBe('verified');

      // New value by a non-verifier: back to unverified.
      const changed = await put(writer, `/admin/variants/${ids.bev}/specs`, {
        items: [{ specKey: 'battery.usable_kwh', value: 77 }],
      }).expect(200);
      const after = changed.body.data.find(
        (s: { specKey: string }) => s.specKey === 'battery.usable_kwh',
      );
      expect(after).toMatchObject({ value: 77, reliability: 'unverified', verifiedAt: null });
      await put(manager, `/admin/variants/${ids.bev}/specs`, {
        items: [{ specKey: 'battery.usable_kwh', value: 75, reliability: 'verified' }],
      }).expect(200);
    });
  });

  describe('markets, inlets and prices', () => {
    it('sets per-market availability, local names and inlets', async () => {
      const eg = await put(manager, `/admin/variants/${ids.bev}/markets/eg`, {
        availability: 'available',
        localNameAr: 'آيرو المدى الطويل (مصر)',
        localNameEn: 'Aero LR (Egypt)',
        launchDate: '2025-03-01',
      }).expect(200);
      expect(eg.body.data[0]).toMatchObject({ marketCode: 'EG', availability: 'available' });
      await put(manager, `/admin/variants/${ids.bev}/markets/SA`, {
        availability: 'coming_soon',
      }).expect(200);
      await put(manager, `/admin/variants/${ids.phev}/markets/EG`, {
        availability: 'available',
      }).expect(200);
      await put(manager, `/admin/variants/${ids.phev}/markets/EG`, {
        availability: 'available',
        launchDate: '2025-05-01',
        discontinuedAt: '2025-01-01',
      }).expect(422);
      await put(manager, `/admin/variants/${ids.bev}/markets/ZZ`, {
        availability: 'available',
      }).expect(422);

      const inlets = await put(manager, `/admin/variants/${ids.bev}/markets/EG/inlets`, {
        inlets: [
          { connectorTypeCode: 'type2', currentType: 'AC', maxPowerKw: 11 },
          { connectorTypeCode: 'ccs2', currentType: 'DC', maxPowerKw: 150, sourceId: ids.source },
        ],
      }).expect(200);
      expect(
        inlets.body.data.find((m: { marketCode: string }) => m.marketCode === 'EG').inlets,
      ).toHaveLength(2);
      const wrongCurrent = await put(manager, `/admin/variants/${ids.bev}/markets/EG/inlets`, {
        inlets: [{ connectorTypeCode: 'chademo', currentType: 'AC' }],
      }).expect(422);
      expect(wrongCurrent.body.error.details[0].field).toBe('inlets.0.currentType');
    });

    it('prices: local currency + source for official prices, never converted, ordered history', async () => {
      const path = `/admin/variants/${ids.bev}/prices`;
      await post(writer, path, {
        marketCode: 'EG',
        amount: '2000000',
        currencyCode: 'EGP',
        priceType: 'official_msrp',
        effectiveFrom: '2025-01-01',
        sourceId: ids.source,
      }).expect(403);
      const noSource = await post(manager, path, {
        marketCode: 'EG',
        amount: '2000000',
        currencyCode: 'EGP',
        priceType: 'official_msrp',
        effectiveFrom: '2025-01-01',
      }).expect(422);
      expect(noSource.body.error.details[0].field).toBe('sourceId');
      const foreign = await post(manager, path, {
        marketCode: 'EG',
        amount: '40000',
        currencyCode: 'USD',
        priceType: 'official_msrp',
        effectiveFrom: '2025-01-01',
        sourceId: ids.source,
      }).expect(422);
      expect(foreign.body.error.details[0].field).toBe('currencyCode');
      await post(manager, path, {
        marketCode: 'AE',
        amount: '150000',
        currencyCode: 'AED',
        priceType: 'official_msrp',
        effectiveFrom: '2025-01-01',
        sourceId: ids.source,
      }).expect(422); // no AE availability row

      const first = await post(manager, path, {
        marketCode: 'EG',
        amount: '2000000',
        currencyCode: 'EGP',
        priceType: 'official_msrp',
        effectiveFrom: '2025-01-01',
        sourceId: ids.source,
      }).expect(201);
      expect(first.body.data).toMatchObject({
        amount: { amount: '2000000.00', currency: 'EGP' },
        effectiveTo: null,
        inMarketCurrency: true,
      });
      await post(manager, path, {
        marketCode: 'EG',
        amount: '2150000',
        currencyCode: 'EGP',
        priceType: 'official_msrp',
        effectiveFrom: '2025-06-01',
        sourceId: ids.source,
      }).expect(201);
      const estimate = await post(manager, path, {
        marketCode: 'EG',
        amount: '45000',
        currencyCode: 'USD',
        priceType: 'market_estimate',
        effectiveFrom: '2025-02-01',
      }).expect(201);
      expect(estimate.body.data.inMarketCurrency).toBe(false);

      // Overlap with the closed first period → 409
      const overlap = await post(manager, path, {
        marketCode: 'EG',
        amount: '1990000',
        currencyCode: 'EGP',
        priceType: 'official_msrp',
        effectiveFrom: '2025-03-01',
        effectiveTo: '2025-04-01',
        sourceId: ids.source,
        closePrevious: false,
      }).expect(409);
      expect(overlap.body.error.code).toBe('PRICE_PERIOD_OVERLAP');

      const history = await get(`${path}?marketCode=EG`, editor).expect(200);
      expect(history.body.data.map((p: { effectiveFrom: string }) => p.effectiveFrom)).toEqual([
        '2025-06-01',
        '2025-02-01',
        '2025-01-01',
      ]);
      expect(history.body.data[2].effectiveTo).toBe('2025-05-31'); // closed automatically
    });
  });

  describe('public API', () => {
    it('lists the model in markets where trims are listed, with filters', async () => {
      const eg = await get('/cars?market=EG&lang=en').expect(200);
      const card = eg.body.data.find((c: { id: string }) => c.id === ids.model);
      expect(card).toMatchObject({
        title: 'Voltara Test Motors Aero',
        powertrainTypes: ['BEV', 'PHEV'],
        variantCount: 2,
        modelYears: [2025],
        availability: 'available',
        maxDcPeakKw: 150,
      });
      expect(card.priceFrom.amount).toEqual({ amount: '2150000.00', currency: 'EGP' });
      expect(card.ranges).toEqual(
        expect.arrayContaining([
          { cycle: 'WLTP', rangeType: 'electric', minKm: 80, maxKm: 500 },
          { cycle: 'CLTC', rangeType: 'electric', minKm: 610, maxKm: 610 },
          { cycle: 'WLTP', rangeType: 'total', minKm: 950, maxKm: 950 },
        ]),
      );
      expect(eg.body.meta).toMatchObject({ marketCode: 'EG', currencyCode: 'EGP' });

      const bevOnly = await get('/cars?market=EG&powertrain=BEV').expect(200);
      expect(bevOnly.body.data.find((c: { id: string }) => c.id === ids.model).variantCount).toBe(
        1,
      );

      // SA: only the BEV (coming soon), no price there → null, never 0
      const sa = await get('/cars?market=SA').expect(200);
      const saCard = sa.body.data.find((c: { id: string }) => c.id === ids.model);
      expect(saCard).toMatchObject({
        powertrainTypes: ['BEV'],
        availability: 'coming_soon',
        priceFrom: null,
      });
      const ae = await get('/cars?market=AE').expect(200);
      expect(ae.body.data.find((c: { id: string }) => c.id === ids.model)).toBeUndefined();

      // Price filter in the market currency
      const cheap = await get('/cars?market=EG&maxPrice=1000000').expect(200);
      expect(cheap.body.data.find((c: { id: string }) => c.id === ids.model)).toBeUndefined();
      const inRange = await get('/cars?market=EG&minPrice=2000000&maxPrice=2200000').expect(200);
      expect(inRange.body.data.find((c: { id: string }) => c.id === ids.model).variantCount).toBe(
        1,
      );

      // Range needs its cycle
      const noCycle = await get('/cars?market=EG&minRange=400').expect(422);
      expect(noCycle.body.error.details[0].field).toBe('rangeCycle');
      const wltp = await get('/cars?market=EG&minRange=400&rangeCycle=WLTP').expect(200);
      expect(wltp.body.data.find((c: { id: string }) => c.id === ids.model).variantCount).toBe(1);
      const nedc = await get('/cars?market=EG&minRange=400&rangeCycle=NEDC').expect(200);
      expect(nedc.body.data.find((c: { id: string }) => c.id === ids.model)).toBeUndefined();

      await get('/cars?market=EG&drive=awd&seats=5&body=suv&brand=voltara-test-motors').expect(200);
      await get('/cars?powertrain=DIESEL').expect(422);
    });

    it('brands list and brand page are market-aware', async () => {
      const brands = await get('/brands?market=EG&hasCars=true&lang=en').expect(200);
      expect(brands.body.data.find((b: { id: string }) => b.id === ids.brand)).toMatchObject({
        name: 'Voltara Test Motors',
        carCount: 1,
      });
      const page = await get('/brands/voltara-test-motors?market=AE').expect(200);
      expect(page.body.data.cars).toEqual([]);
      expect(page.body.data.notInMarket[0]).toMatchObject({
        id: ids.model,
        marketCodes: ['EG', 'SA'],
      });
    });

    it('model page: trims of the market, prices, key facts; null not 0', async () => {
      const res = await get('/cars/voltara-test-motors-aero?market=EG&lang=ar').expect(200);
      const d = res.body.data;
      expect(res.headers['cache-control']).toContain('public');
      expect(d).toMatchObject({
        availableInMarket: true,
        marketCode: 'EG',
        powertrainTypes: ['BEV', 'PHEV'],
        notAvailableLabel: 'غير متوفر',
      });
      const variants = d.generations[0].years[0].variants;
      const bev = variants.find((v: { id: string }) => v.id === ids.bev);
      const phev = variants.find((v: { id: string }) => v.id === ids.phev);
      expect(bev.localName).toBe('آيرو المدى الطويل (مصر)');
      expect(bev.currentPrice).toMatchObject({
        amount: { amount: '2150000.00' },
        priceType: 'official_msrp',
      });
      expect(bev.keyFacts).toMatchObject({
        usableBatteryKwh: 75,
        grossBatteryKwh: 80,
        dcPeakKw: 150,
      });
      expect(phev.keyFacts).toMatchObject({ grossBatteryKwh: null, dcPeakKw: null, powerKw: null });
      expect(phev.currentPrice).toBeNull();
      expect(d.tours).toMatchObject({ available: false, tours: [] });
      expect(d.availableMarkets.map((m: { code: string }) => m.code)).toEqual(['EG', 'SA']);

      const sa = await get(`/cars/${ids.model}?market=SA`).expect(200);
      expect(
        sa.body.data.generations[0].years[0].variants.map((v: { id: string }) => v.id),
      ).toEqual([ids.bev]);
      await get('/cars/no-such-car').expect(404);
    });

    it('variant spec sheet with provenance; BEV and PHEV never share data', async () => {
      const res = await get(
        `/cars/voltara-test-motors-aero/variants/${ids.bev}?market=EG&lang=en`,
      ).expect(200);
      const d = res.body.data;
      expect(d).toMatchObject({
        powertrainType: 'BEV',
        modelYear: 2025,
        market: {
          code: 'EG',
          offered: true,
          availability: 'available',
          localName: 'Aero LR (Egypt)',
        },
      });
      const battery = d.specGroups.find((g: { key: string }) => g.key === 'battery');
      const usable = battery.items.find((i: { key: string }) => i.key === 'battery.usable_kwh');
      expect(usable.point).toMatchObject({
        value: 75,
        unit: 'kWh',
        reliability: 'verified',
        source: { id: ids.source, title: 'Test specification sheet (fictional)' },
      });
      const voltage = battery.items.find((i: { key: string }) => i.key === 'battery.voltage_v');
      expect(voltage.point).toBeNull();
      expect(d.keyFacts.powerHp).toMatchObject({ value: 335, unit: 'hp', derived: true });
      const warranty = d.specGroups.find((g: { key: string }) => g.key === 'warranty');
      expect(
        warranty.items.find((i: { key: string }) => i.key === 'warranty.vehicle_years').point.value,
      ).toBe(5);
      expect(
        d.charging.inlets.map((i: { connectorType: { code: string } }) => i.connectorType.code),
      ).toEqual(['type2', 'ccs2']);
      expect(d.charging.times[0]).toMatchObject({ fromSoc: 10, toSoc: 80, chargerPowerKw: 150 });
      expect(d.ranges.every((r: { rangeType: string }) => r.rangeType === 'electric')).toBe(true);
      expect(d.price.current.amount.amount).toBe('2150000.00');
      expect(d.price.history).toHaveLength(3);
      expect(d.sources.map((s: { id: string }) => s.id)).toContain(ids.source);

      // Same trim name, PHEV: its own data only
      const phev = await get(`/variants/${ids.phev}?market=EG&lang=en`).expect(200);
      const p = phev.body.data;
      expect(p.powertrainType).toBe('PHEV');
      expect(p.keyFacts.usableBatteryKwh.value).toBe(18.3);
      expect(p.keyFacts.dcPeakKw).toBeNull();
      expect(p.ranges.map((r: { rangeType: string }) => r.rangeType).sort()).toEqual([
        'electric',
        'total',
      ]);
      expect(p.charging).toEqual({ inlets: [], times: [], curves: [] });
      expect(p.price).toEqual({ current: null, history: [] });

      // Market-specific warranty row does not leak into SA; not offered in AE
      const sa = await get(`/variants/${ids.bev}?market=SA&lang=en`).expect(200);
      const saWarranty = sa.body.data.specGroups.find((g: { key: string }) => g.key === 'warranty');
      expect(
        saWarranty.items.find((i: { key: string }) => i.key === 'warranty.vehicle_years').point,
      ).toBeNull();
      expect(sa.body.data.charging.inlets).toEqual([]);
      const ae = await get(
        `/variants/voltara-test-motors-aero-2025-long-range-bev?market=AE`,
      ).expect(200);
      expect(ae.body.data.market).toMatchObject({ offered: false, availability: 'not_listed' });

      // A variant of another model → 404
      await get(`/cars/some-other-model/variants/${ids.bev}`).expect(404);
    });

    it('pickers cascade brand → model → year → variant → market', async () => {
      const brands = await get('/cars/pickers?market=EG&lang=en').expect(200);
      expect(brands.body.data.level).toBe('brand');
      expect(brands.body.data.items.find((i: { id: string }) => i.id === ids.brand)).toMatchObject({
        label: 'Voltara Test Motors',
        count: 1,
      });
      const models = await get(`/cars/pickers?brand=voltara-test-motors&market=EG`).expect(200);
      expect(models.body.data).toMatchObject({ level: 'model' });
      const years = await get(`/cars/pickers?model=${ids.model}&market=EG`).expect(200);
      expect(years.body.data.items).toMatchObject([{ year: 2025, count: 2 }]);
      const variants = await get(
        `/cars/pickers?model=${ids.model}&year=2025&market=SA&lang=en`,
      ).expect(200);
      expect(variants.body.data.items.map((i: { id: string }) => i.id)).toEqual([ids.bev]);
      const all = await get(
        `/cars/pickers?model=${ids.model}&year=2025&market=AE&scope=all`,
      ).expect(200);
      expect(all.body.data.items).toHaveLength(2);
      const markets = await get(`/cars/pickers?variant=${ids.bev}&lang=en`).expect(200);
      expect(markets.body.data).toMatchObject({ level: 'market' });
      expect(markets.body.data.items.map((i: { id: string }) => i.id)).toEqual(['EG', 'SA']);
      expect(markets.body.data.items[0]).toMatchObject({
        currencyCode: 'EGP',
        availability: 'available',
      });
    });

    it('hides unpublished and deleted entries', async () => {
      await patch(manager, `/admin/variants/${ids.phev}`, { status: 'draft' }).expect(200);
      const eg = await get('/cars?market=EG').expect(200);
      expect(eg.body.data.find((c: { id: string }) => c.id === ids.model).powertrainTypes).toEqual([
        'BEV',
      ]);
      await get(`/variants/${ids.phev}`).expect(404);
      await patch(manager, `/admin/variants/${ids.phev}`, { status: 'published' }).expect(200);

      await t.http().delete(`/api/v1/admin/variants/${ids.phev}`).set(writer.auth).expect(403);
      await t.http().delete(`/api/v1/admin/variants/${ids.phev}`).set(admin.auth).expect(204);
      await get(`/variants/${ids.phev}`).expect(404);
      await post(admin, `/admin/variants/${ids.phev}/restore`, {}).expect(200);
      await get(`/variants/${ids.phev}`).expect(200);

      const inUse = await t
        .http()
        .delete(`/api/v1/admin/brands/${ids.brand}`)
        .set(admin.auth)
        .expect(409);
      expect(inUse.body.error.code).toBe('IN_USE');
    });

    it('indexes published cars for search', async () => {
      const docs = await t.prisma.searchDocument.findMany({
        where: { entityId: { in: [ids.brand, ids.model, ids.bev] } },
      });
      expect(docs.length).toBe(6);
      const model = docs.find((d) => d.entityId === ids.model && d.locale === 'en');
      expect(model).toMatchObject({ title: 'Voltara Test Motors Aero', marketCodes: ['EG', 'SA'] });
    });
  });
});
