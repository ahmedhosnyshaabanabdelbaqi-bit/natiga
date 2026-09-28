/**
 * Public calculators over HTTP: required test vector, validation (422 with
 * field details), catalog fill with provenance, garage car (auth), admin
 * reference prices with date + source, and the admin permission guard.
 */
import { bearer, createAndLogin, type LoggedIn } from './auth-test-helpers';
import { createTestCar } from './personal-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

describe('Personal: calculators (e2e)', () => {
  let t: TestApp;
  let user: LoggedIn;
  let other: LoggedIn;
  let admin: LoggedIn;
  let variantId: string;
  let bareVariantId: string;

  beforeAll(async () => {
    t = await createTestApp();
    user = await createAndLogin(t, ['user']);
    other = await createAndLogin(t, ['user']);
    admin = await createAndLogin(t, ['vehicle_data_manager']);
    variantId = await createTestCar(t, 'EG', {
      usableKwh: 60,
      acMaxKw: 11,
      dcPeakKw: 150,
      consumptionWhKm: 180,
      curve: [
        [0, 100],
        [50, 100],
        [80, 50],
        [100, 10],
      ],
    });
    bareVariantId = await createTestCar(t, 'EG');
  });
  afterAll(async () => {
    await t?.close();
  });

  const post = (kind: string, body: object, token?: string) => {
    const req = t.http().post(`/api/v1/calculators/${kind}?lang=en&market=EG`);
    if (token) req.set(bearer(token));
    return req.send(body);
  };

  it('charge-cost: the required test vector (guest)', async () => {
    const res = await post('charge-cost', {
      batteryUsableKwh: 60,
      fromSocPercent: 20,
      toSocPercent: 80,
      efficiency: 0.9,
      currency: 'EGP',
      priceDate: '2026-09-01',
      tariff: { energyPerKwh: 2 },
    }).expect(200);
    expect(res.body.data).toMatchObject({
      calculator: 'charge-cost',
      result: {
        energyAddedKwh: 36,
        gridEnergyKwh: 40,
        cost: {
          energy: { amount: '80.00', currency: 'EGP' },
          total: { amount: '80.00' },
          time: null,
        },
      },
      confidence: 'high',
      vehicle: null,
    });
    expect(res.body.data.steps.length).toBeGreaterThan(2);
    expect(res.body.data.formula).toBeTruthy();
  });

  it('422 with field details for missing / zero / negative inputs and unknown fields', async () => {
    const res = await post('charge-cost', {
      batteryUsableKwh: 0,
      fromSocPercent: -1,
      toSocPercent: 80,
      efficiency: 0,
      tariff: { energyPerKwh: 2 },
    }).expect(422);
    const fields = res.body.error.details.map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(['batteryUsableKwh', 'currency', 'efficiency', 'fromSocPercent']);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    await post('charge-cost', { batteryUsableKwh: 60, foo: 1 }).expect(422);
    await post('charge-cost', { batteryUsableKwh: 'sixty' }).expect(422);
  });

  it('no default prices: a tariff is required', async () => {
    const res = await post('cost-per-100km', {
      consumptionKwhPer100km: 18,
      currency: 'EGP',
    }).expect(422);
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ field: 'electricityPricePerKwh' }),
    ]);
  });

  it('fills missing values from the catalog with provenance notes; user values win', async () => {
    const res = await post('charge-time', {
      variantId,
      currentType: 'DC',
      fromSocPercent: 10,
      toSocPercent: 50,
    }).expect(200);
    expect(res.body.data.vehicle).toMatchObject({ variantId, marketCode: 'EG' });
    expect(res.body.data.result).toMatchObject({
      method: 'dc_curve',
      minutes: 14,
      energyAddedKwh: 24,
    });
    const usable = res.body.data.assumptions.find(
      (a: { key: string }) => a.key === 'batteryUsableKwh',
    );
    expect(usable).toMatchObject({ origin: 'catalog', value: 60 });
    expect(usable.note).toContain('Test source (synthetic)');

    const own = await post('charge-time', {
      variantId,
      currentType: 'AC',
      batteryUsableKwh: 30,
      fromSocPercent: 0,
      toSocPercent: 100,
      efficiency: 1,
      stationPowerKw: 22,
    }).expect(200);
    // user capacity 30 kWh; car AC limit 11 kW from the catalog
    expect(own.body.data.result).toMatchObject({
      minutes: 164,
      powerKw: 11,
      limitingFactor: 'vehicle',
    });
    expect(
      own.body.data.assumptions.find((a: { key: string }) => a.key === 'batteryUsableKwh').origin,
    ).toBe('user');
  });

  it('DC without a documented curve → low-confidence range, minutes null', async () => {
    const res = await post('charge-time', {
      variantId: bareVariantId,
      currentType: 'DC',
      batteryUsableKwh: 60,
      fromSocPercent: 10,
      toSocPercent: 50,
    }).expect(200);
    // catalog DC inlet 150 kW (verified) is the only limit
    expect(res.body.data).toMatchObject({
      confidence: 'low',
      result: { minutes: null, isRoughEstimate: true },
    });
    expect(res.body.data.result.minutesRange.low).toBeGreaterThan(0);
  });

  it('cost-per-100km from the catalog consumption (cycle shown, not converted)', async () => {
    const res = await post('cost-per-100km', {
      variantId,
      electricityPricePerKwh: 2,
      currency: 'EGP',
      priceDate: '2026-09-01',
    }).expect(200);
    expect(res.body.data.result).toMatchObject({
      gridKwhPer100km: 18,
      costPer100km: { amount: '36.00' },
    });
    const c = res.body.data.assumptions.find(
      (a: { key: string }) => a.key === 'consumptionKwhPer100km',
    );
    expect(c).toMatchObject({ origin: 'catalog' });
    expect(c.note).toContain('WLTP');
    expect(res.body.data.confidence).toBe('medium');
  });

  it('garage car needs the owner token', async () => {
    const car = await t
      .http()
      .post('/api/v1/me/vehicles')
      .set(bearer(user.accessToken))
      .send({ variantId, marketCode: 'EG' })
      .expect(201);
    const body = {
      userVehicleId: car.body.data.id,
      fromSocPercent: 20,
      toSocPercent: 80,
      currency: 'EGP',
      tariff: { energyPerKwh: 1 },
    };
    const res = await post('charge-cost', body, user.accessToken).expect(200);
    expect(res.body.data.result.energyAddedKwh).toBe(36);
    await post('charge-cost', body).expect(422);
    const foreign = await post('charge-cost', body, other.accessToken).expect(422);
    expect(foreign.body.error.details[0].field).toBe('userVehicleId');
  });

  it('monthly-cost, vs-fuel and tco', async () => {
    const monthly = await post('monthly-cost', {
      consumptionKwhPer100km: 18,
      electricityPricePerKwh: 2,
      currency: 'EGP',
      kmPerMonth: 1000,
    }).expect(200);
    expect(monthly.body.data.result.totalPerMonth).toEqual({ amount: '360.00', currency: 'EGP' });
    expect(monthly.body.data.warnings.map((w: { code: string }) => w.code)).toContain(
      'PRICE_DATE_MISSING',
    );

    const fuel = await post('vs-fuel', {
      consumptionKwhPer100km: 18,
      electricityPricePerKwh: 2,
      currency: 'EGP',
      fuelConsumptionLPer100km: 8,
      fuelPricePerLiter: 15,
    }).expect(200);
    expect(fuel.body.data.result.differencePer100km.amount).toBe('84.00');

    const tco = await post('tco', {
      years: 5,
      kmPerYear: 15000,
      consumptionKwhPer100km: 18,
      electricityPricePerKwh: 2,
      currency: 'EGP',
      ev: { purchasePrice: 1000000 },
    }).expect(200);
    expect(tco.body.data.result.ev).toMatchObject({
      energy: { amount: '27000.00' },
      total: { amount: '1027000.00' },
      insurance: null,
    });
  });

  describe('reference prices', () => {
    let priceId: string;
    let fuelId: string;

    it('empty until an admin adds one', async () => {
      const res = await t.http().get('/api/v1/calculators/reference-prices?market=EG').expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('admin endpoints are permission-guarded', async () => {
      await t.http().get('/api/v1/admin/energy-prices').set(bearer(user.accessToken)).expect(403);
      await t
        .http()
        .post('/api/v1/admin/energy-prices')
        .set(bearer(user.accessToken))
        .send({
          marketCode: 'EG',
          energyType: 'electricity_residential',
          price: 2,
          currency: 'EGP',
          effectiveFrom: '2026-01-01',
        })
        .expect(403);
    });

    it('admin adds prices (with date + source); the latest in effect is listed', async () => {
      const source = await t.prisma.specificationSource.create({
        data: { type: 'official_document', title: 'Test tariff decree (synthetic)' },
      });
      const add = (body: object) =>
        t
          .http()
          .post('/api/v1/admin/energy-prices?lang=en')
          .set(bearer(admin.accessToken))
          .send(body);
      await add({
        marketCode: 'EG',
        energyType: 'electricity_residential',
        price: 1.5,
        currency: 'EGP',
        effectiveFrom: '2024-01-01',
      }).expect(201);
      const res = await add({
        marketCode: 'EG',
        energyType: 'electricity_residential',
        price: 2.14,
        currency: 'EGP',
        effectiveFrom: '2026-08-01',
        sourceId: source.id,
      }).expect(201);
      priceId = res.body.data.id;
      expect(res.body.data).toMatchObject({
        unit: 'per_kwh',
        price: { amount: '2.14', currency: 'EGP' },
        possiblyOutdated: false,
      });
      const fuel = await add({
        marketCode: 'EG',
        energyType: 'gasoline_92',
        price: 15.25,
        currency: 'EGP',
        effectiveFrom: '2024-03-01',
      }).expect(201);
      fuelId = fuel.body.data.id;
      expect(fuel.body.data.unit).toBe('per_liter');
      await add({
        marketCode: 'EG',
        energyType: 'electricity_residential',
        price: 2,
        currency: 'EGP',
        effectiveFrom: '2026-02-30',
      }).expect(422);
      await add({
        marketCode: 'EG',
        energyType: 'nuclear',
        price: 2,
        currency: 'EGP',
        effectiveFrom: '2026-01-01',
      }).expect(422);

      const list = await t
        .http()
        .get('/api/v1/calculators/reference-prices?market=EG&lang=en')
        .expect(200);
      expect(list.body.data).toHaveLength(2);
      expect(list.body.data.find((p: { id: string }) => p.id === priceId)).toMatchObject({
        effectiveFrom: '2026-08-01',
        source: { title: 'Test tariff decree (synthetic)' },
        label: 'Residential electricity',
      });
      expect(list.body.data.find((p: { id: string }) => p.id === fuelId).possiblyOutdated).toBe(
        true,
      );
    });

    it('a calculation using reference prices shows their origin and date', async () => {
      const res = await post('vs-fuel', {
        consumptionKwhPer100km: 18,
        fuelConsumptionLPer100km: 8,
        referencePriceIds: { electricityPricePerKwh: priceId, fuelPricePerLiter: fuelId },
      }).expect(200);
      expect(res.body.data.result.priceDate).toBe('2024-03-01');
      const e = res.body.data.assumptions.find(
        (a: { key: string }) => a.key === 'electricityPricePerKwh',
      );
      expect(e).toMatchObject({ origin: 'reference_price', value: '2.14' });
      expect(e.note).toContain('2026-08-01');
      expect(res.body.data.warnings.map((w: { code: string }) => w.code)).toContain(
        'REFERENCE_PRICE_OLD',
      );
      // Wrong unit / both typed and referenced → 422
      await post('cost-per-100km', {
        consumptionKwhPer100km: 18,
        referencePriceIds: { electricityPricePerKwh: fuelId },
      }).expect(422);
      await post('cost-per-100km', {
        consumptionKwhPer100km: 18,
        electricityPricePerKwh: 3,
        currency: 'EGP',
        referencePriceIds: { electricityPricePerKwh: priceId },
      }).expect(422);
    });

    it('admin can update and delete; changes are audited', async () => {
      await t
        .http()
        .patch(`/api/v1/admin/energy-prices/${priceId}`)
        .set(bearer(admin.accessToken))
        .send({ notes: 'checked' })
        .expect(200);
      await t
        .http()
        .delete(`/api/v1/admin/energy-prices/${priceId}`)
        .set(bearer(admin.accessToken))
        .expect(204);
      await t
        .http()
        .delete(`/api/v1/admin/energy-prices/${priceId}`)
        .set(bearer(admin.accessToken))
        .expect(404);
      const audits = await t.prisma.auditLog.count({ where: { entityId: priceId } });
      expect(audits).toBeGreaterThanOrEqual(2);
    });
  });
});
