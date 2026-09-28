/**
 * Garage, charging logs (+ report) and reminders: CRUD, validation and
 * per-user isolation (another user's rows are always 404). Synthetic data.
 */
import { bearer, createAndLogin, type LoggedIn } from './auth-test-helpers';
import { createTestCar } from './personal-helpers';
import { createTestApp, type TestApp } from './utils/test-app';
import { orderedSteps } from './utils/ordered-steps';

describe('Personal: garage, charging logs, reminders (e2e)', () => {
  const { step, run } = orderedSteps();
  let t: TestApp;
  let alice: LoggedIn;
  let bob: LoggedIn;
  let variantId: string;
  let otherVariantId: string;
  let aliceCar: string;
  let bobCar: string;

  beforeAll(async () => {
    t = await createTestApp();
    alice = await createAndLogin(t, ['user']);
    bob = await createAndLogin(t, ['user']);
    variantId = await createTestCar(t, 'EG', { usableKwh: 60 });
    otherVariantId = await createTestCar(t, 'SA');
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('garage', () => {
    step('garage › requires sign-in', async () => {
      await t.http().get('/api/v1/me/vehicles').expect(401);
      await t.http().post('/api/v1/me/vehicles').send({ variantId }).expect(401);
    });

    step(
      'garage › adds a car (market defaults to the request market); the first car is primary',
      async () => {
        const res = await t
          .http()
          .post('/api/v1/me/vehicles?market=EG&lang=en')
          .set(bearer(alice.accessToken))
          .send({
            variantId,
            nickname: '  Daily  ',
            initialOdometerKm: 1000,
            purchaseDate: '2025-05-01',
          })
          .expect(201);
        aliceCar = res.body.data.id;
        expect(res.body.data).toMatchObject({
          nickname: 'Daily',
          displayName: 'Daily',
          marketCode: 'EG',
          listedInMarket: true,
          isPrimary: true,
          initialOdometerKm: 1000,
          currentOdometerKm: 1000,
          purchaseDate: '2025-05-01',
          stats: { chargingLogs: 0, openReminders: 0 },
          variant: { id: variantId, modelYear: 2026, powertrainType: 'BEV', isPublished: true },
        });
        expect(res.body.data.variant.name).toContain('Test Brand');
      },
    );

    step(
      'garage › a second car in another market can become primary; flags listedInMarket',
      async () => {
        const res = await t
          .http()
          .post('/api/v1/me/vehicles')
          .set(bearer(alice.accessToken))
          .send({ variantId: otherVariantId, marketCode: 'EG', isPrimary: true })
          .expect(201);
        expect(res.body.data).toMatchObject({
          isPrimary: true,
          listedInMarket: false,
          nickname: null,
        });
        const list = await t
          .http()
          .get('/api/v1/me/vehicles')
          .set(bearer(alice.accessToken))
          .expect(200);
        expect(list.body.data.map((v: { id: string }) => v.id)).toEqual([
          res.body.data.id,
          aliceCar,
        ]);
        expect(list.body.meta).toMatchObject({ page: 1, total: 2 });
        await t
          .http()
          .delete(`/api/v1/me/vehicles/${res.body.data.id}`)
          .set(bearer(alice.accessToken))
          .expect(204);
        const after = await t
          .http()
          .get(`/api/v1/me/vehicles/${aliceCar}`)
          .set(bearer(alice.accessToken))
          .expect(200);
        expect(after.body.data.isPrimary).toBe(true);
      },
    );

    step('garage › validates input', async () => {
      const bad = await t
        .http()
        .post('/api/v1/me/vehicles')
        .set(bearer(alice.accessToken))
        .send({ variantId: '00000000-0000-4000-8000-000000000000' })
        .expect(422);
      expect(bad.body.error.details[0].field).toBe('variantId');
      await t
        .http()
        .post('/api/v1/me/vehicles')
        .set(bearer(alice.accessToken))
        .send({ variantId, initialOdometerKm: 500, currentOdometerKm: 100 })
        .expect(422);
      await t
        .http()
        .post('/api/v1/me/vehicles')
        .set(bearer(alice.accessToken))
        .send({ variantId, purchaseDate: '2999-01-01' })
        .expect(422);
      await t
        .http()
        .post('/api/v1/me/vehicles')
        .set(bearer(alice.accessToken))
        .send({ variantId, foo: 1 })
        .expect(422);
    });

    step('garage › bob cannot see, change or delete alice’s car (404)', async () => {
      const res = await t
        .http()
        .post('/api/v1/me/vehicles')
        .set(bearer(bob.accessToken))
        .send({ variantId })
        .expect(201);
      bobCar = res.body.data.id;
      await t
        .http()
        .get(`/api/v1/me/vehicles/${aliceCar}`)
        .set(bearer(bob.accessToken))
        .expect(404);
      await t
        .http()
        .patch(`/api/v1/me/vehicles/${aliceCar}`)
        .set(bearer(bob.accessToken))
        .send({ nickname: 'x' })
        .expect(404);
      await t
        .http()
        .delete(`/api/v1/me/vehicles/${aliceCar}`)
        .set(bearer(bob.accessToken))
        .expect(404);
      const list = await t
        .http()
        .get('/api/v1/me/vehicles')
        .set(bearer(bob.accessToken))
        .expect(200);
      expect(list.body.data.map((v: { id: string }) => v.id)).toEqual([bobCar]);
    });

    step('garage › PATCH updates fields and accepts null', async () => {
      const res = await t
        .http()
        .patch(`/api/v1/me/vehicles/${aliceCar}`)
        .set(bearer(alice.accessToken))
        .send({ nickname: null, notes: 'test note' })
        .expect(200);
      expect(res.body.data).toMatchObject({ nickname: null, notes: 'test note' });
      expect(res.body.data.displayName).toContain('موديل اختبار'); // default language: ar
    });
  });

  describe('charging logs', () => {
    const logIds: string[] = [];

    step(
      'charging logs › creates logs; cost currency defaults to the car market; raises the car odometer',
      async () => {
        const entries = [
          {
            chargedAt: '2026-07-01T10:00:00Z',
            energyKwh: 40,
            cost: 80,
            odometerKm: 1000,
            locationType: 'home',
          },
          {
            chargedAt: '2026-07-05T10:00:00Z',
            energyKwh: 20,
            cost: 40,
            odometerKm: 1100,
            locationType: 'home',
          },
          {
            chargedAt: '2026-07-10T10:00:00Z',
            energyKwh: 25,
            cost: 50,
            odometerKm: 1250,
            locationType: 'public',
            currentType: 'DC',
          },
          {
            chargedAt: '2026-08-02T10:00:00Z',
            energyKwh: 27,
            cost: 54,
            odometerKm: 1400,
            locationType: 'public',
          },
        ];
        for (const e of entries) {
          const res = await t
            .http()
            .post('/api/v1/me/charging-logs')
            .set(bearer(alice.accessToken))
            .send({ userVehicleId: aliceCar, ...e })
            .expect(201);
          logIds.push(res.body.data.id as string);
        }
        const first = await t
          .http()
          .get(`/api/v1/me/charging-logs/${logIds[0]}`)
          .set(bearer(alice.accessToken))
          .expect(200);
        expect(first.body.data).toMatchObject({
          energyKwh: 40,
          cost: { amount: '80.00', currency: 'EGP' },
          costPerKwh: { amount: '2', currency: 'EGP' },
          odometerKm: 1000,
          socStart: null,
          vehicle: { id: aliceCar },
        });
        const car = await t
          .http()
          .get(`/api/v1/me/vehicles/${aliceCar}`)
          .set(bearer(alice.accessToken))
          .expect(200);
        expect(car.body.data.currentOdometerKm).toBe(1400);
        expect(car.body.data.stats.chargingLogs).toBe(4);
      },
    );

    step(
      'charging logs › rejects inconsistent odometers, SoC order, future dates, zero energy and a foreign car',
      async () => {
        const post = (body: object) =>
          t.http().post('/api/v1/me/charging-logs').set(bearer(alice.accessToken)).send(body);
        const odo = await post({
          userVehicleId: aliceCar,
          chargedAt: '2026-07-20T10:00:00Z',
          energyKwh: 10,
          odometerKm: 1500,
        }).expect(422);
        expect(odo.body.error.details).toEqual([expect.objectContaining({ field: 'odometerKm' })]);
        await post({
          userVehicleId: aliceCar,
          chargedAt: '2026-07-20T10:00:00Z',
          energyKwh: 10,
          socStart: 80,
          socEnd: 20,
        }).expect(422);
        await post({
          userVehicleId: aliceCar,
          chargedAt: '2999-01-01T00:00:00Z',
          energyKwh: 10,
        }).expect(422);
        await post({
          userVehicleId: aliceCar,
          chargedAt: '2026-07-20T10:00:00Z',
          energyKwh: 0,
        }).expect(422);
        await post({
          userVehicleId: aliceCar,
          chargedAt: '2026-07-20T10:00:00Z',
          energyKwh: -5,
        }).expect(422);
        const foreign = await post({
          userVehicleId: bobCar,
          chargedAt: '2026-07-20T10:00:00Z',
          energyKwh: 10,
        }).expect(422);
        expect(foreign.body.error.details[0].field).toBe('userVehicleId');
      },
    );

    step('charging logs › lists with filters and pagination', async () => {
      const res = await t
        .http()
        .get('/api/v1/me/charging-logs?from=2026-07-01&to=2026-07-31&pageSize=2')
        .set(bearer(alice.accessToken))
        .expect(200);
      expect(res.body.meta).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
      expect(res.body.data[0].chargedAt).toBe('2026-07-10T10:00:00.000Z');
    });

    step(
      'charging logs › report: spend, energy, consumption and cost/100 km from the logs only',
      async () => {
        const res = await t
          .http()
          .get(`/api/v1/me/charging-logs/report?vehicleId=${aliceCar}&lang=en`)
          .set(bearer(alice.accessToken))
          .expect(200);
        const r = res.body.data;
        expect(r.totals).toMatchObject({
          sessions: 4,
          energyKwh: 112,
          spend: [{ amount: '224.00', currency: 'EGP' }],
          sessionsWithoutCost: 0,
        });
        expect(r.months.map((m: { month: string }) => m.month)).toEqual(['2026-07', '2026-08']);
        expect(r.vehicles[0]).toMatchObject({
          vehicleId: aliceCar,
          distance: { km: 400, status: 'ok' },
          consumption: {
            kwhPer100km: 18,
            status: 'ok',
            method: 'odometer_delta',
            confidence: 'medium',
          },
          costPer100km: { value: { amount: '36.00', currency: 'EGP' }, status: 'ok' },
        });
        expect(r.notes.length).toBeGreaterThan(0);
      },
    );

    step(
      'charging logs › report says "insufficient data" instead of inventing figures',
      async () => {
        const res = await t
          .http()
          .get(`/api/v1/me/charging-logs/report?vehicleId=${aliceCar}&from=2026-08-01`)
          .set(bearer(alice.accessToken))
          .expect(200);
        expect(res.body.data.vehicles[0]).toMatchObject({
          sessions: 1,
          consumption: {
            kwhPer100km: null,
            status: 'insufficient_data',
            reason: 'fewer_than_two_odometer_readings',
          },
          costPer100km: { value: null, status: 'insufficient_data' },
        });
        const bobReport = await t
          .http()
          .get('/api/v1/me/charging-logs/report')
          .set(bearer(bob.accessToken))
          .expect(200);
        expect(bobReport.body.data.totals.sessions).toBe(0);
        expect(bobReport.body.data.vehicles[0].consumption.reason).toBe('no_sessions');
      },
    );

    step(
      'charging logs › updates and deletes; isolation: bob gets 404 and sees nothing',
      async () => {
        const upd = await t
          .http()
          .patch(`/api/v1/me/charging-logs/${logIds[3]}`)
          .set(bearer(alice.accessToken))
          .send({ cost: null, notes: 'free session' })
          .expect(200);
        expect(upd.body.data).toMatchObject({
          cost: null,
          costPerKwh: null,
          notes: 'free session',
        });
        await t
          .http()
          .get(`/api/v1/me/charging-logs/${logIds[0]}`)
          .set(bearer(bob.accessToken))
          .expect(404);
        await t
          .http()
          .patch(`/api/v1/me/charging-logs/${logIds[0]}`)
          .set(bearer(bob.accessToken))
          .send({ energyKwh: 1 })
          .expect(404);
        await t
          .http()
          .delete(`/api/v1/me/charging-logs/${logIds[0]}`)
          .set(bearer(bob.accessToken))
          .expect(404);
        const list = await t
          .http()
          .get('/api/v1/me/charging-logs')
          .set(bearer(bob.accessToken))
          .expect(200);
        expect(list.body.meta.total).toBe(0);
        await t
          .http()
          .get(`/api/v1/me/charging-logs/report?vehicleId=${aliceCar}`)
          .set(bearer(bob.accessToken))
          .expect(422);
        await t
          .http()
          .delete(`/api/v1/me/charging-logs/${logIds[3]}`)
          .set(bearer(alice.accessToken))
          .expect(204);
      },
    );
  });

  describe('reminders', () => {
    let dateReminder: string;
    let kmReminder: string;

    step('reminders › creates date and odometer reminders with status + notifyOn', async () => {
      const d = await t
        .http()
        .post('/api/v1/me/reminders?lang=en')
        .set(bearer(alice.accessToken))
        .send({
          type: 'insurance',
          dueDate: '2099-03-01',
          repeatIntervalMonths: 12,
          notifyDaysBefore: 14,
        })
        .expect(201);
      dateReminder = d.body.data.id;
      expect(d.body.data).toMatchObject({
        type: 'insurance',
        typeLabel: 'Insurance renewal',
        title: 'Insurance renewal',
        status: 'upcoming',
        notifyOn: '2099-02-15',
        vehicle: null,
      });
      const k = await t
        .http()
        .post('/api/v1/me/reminders')
        .set(bearer(alice.accessToken))
        .send({
          type: 'maintenance',
          userVehicleId: aliceCar,
          dueOdometerKm: 1500,
          notifyKmBefore: 200,
          repeatIntervalKm: 10000,
        })
        .expect(201);
      kmReminder = k.body.data.id;
      expect(k.body.data).toMatchObject({
        status: 'due_soon',
        dueInKm: 100,
        vehicle: { id: aliceCar, currentOdometerKm: 1400 },
      });
    });

    step(
      'reminders › validates: custom needs a title, a due date or odometer, odometer needs a car',
      async () => {
        const post = (body: object) =>
          t.http().post('/api/v1/me/reminders').set(bearer(alice.accessToken)).send(body);
        await post({ type: 'custom', dueDate: '2099-01-01' }).expect(422);
        await post({ type: 'maintenance' }).expect(422);
        await post({ type: 'maintenance', dueOdometerKm: 5000 }).expect(422);
        await post({ type: 'maintenance', dueDate: '2099-02-30' }).expect(422);
        await post({ type: 'oil', dueDate: '2099-01-01' }).expect(422);
        await post({ type: 'maintenance', dueDate: '2099-01-01', userVehicleId: bobCar }).expect(
          422,
        );
      },
    );

    step('reminders › completing a repeating reminder creates the next one', async () => {
      const res = await t
        .http()
        .post(`/api/v1/me/reminders/${kmReminder}/complete`)
        .set(bearer(alice.accessToken))
        .send({ odometerKm: 1520 })
        .expect(200);
      expect(res.body.data.completed.status).toBe('completed');
      expect(res.body.data.next).toMatchObject({
        dueOdometerKm: 11520,
        status: 'upcoming',
        type: 'maintenance',
      });
      await t
        .http()
        .post(`/api/v1/me/reminders/${kmReminder}/complete`)
        .set(bearer(alice.accessToken))
        .send({})
        .expect(409);
      const car = await t
        .http()
        .get(`/api/v1/me/vehicles/${aliceCar}`)
        .set(bearer(alice.accessToken))
        .expect(200);
      expect(car.body.data.currentOdometerKm).toBe(1520);
      const date = await t
        .http()
        .post(`/api/v1/me/reminders/${dateReminder}/complete`)
        .set(bearer(alice.accessToken))
        .send({})
        .expect(200);
      expect(date.body.data.next.dueDate).toBe('2100-03-01');
    });

    step('reminders › lists open / completed and isolates users', async () => {
      const open = await t
        .http()
        .get('/api/v1/me/reminders')
        .set(bearer(alice.accessToken))
        .expect(200);
      expect(open.body.data).toHaveLength(2);
      const done = await t
        .http()
        .get('/api/v1/me/reminders?status=completed')
        .set(bearer(alice.accessToken))
        .expect(200);
      expect(done.body.data).toHaveLength(2);
      await t
        .http()
        .get(`/api/v1/me/reminders/${dateReminder}`)
        .set(bearer(bob.accessToken))
        .expect(404);
      await t
        .http()
        .patch(`/api/v1/me/reminders/${dateReminder}`)
        .set(bearer(bob.accessToken))
        .send({ notes: 'x' })
        .expect(404);
      await t
        .http()
        .post(`/api/v1/me/reminders/${dateReminder}/complete`)
        .set(bearer(bob.accessToken))
        .send({})
        .expect(404);
      await t
        .http()
        .delete(`/api/v1/me/reminders/${dateReminder}`)
        .set(bearer(bob.accessToken))
        .expect(404);
      const bobList = await t
        .http()
        .get('/api/v1/me/reminders?status=all')
        .set(bearer(bob.accessToken))
        .expect(200);
      expect(bobList.body.data).toEqual([]);
    });

    step('reminders › deleting a car deletes its logs and reminders', async () => {
      await t
        .http()
        .delete(`/api/v1/me/vehicles/${aliceCar}`)
        .set(bearer(alice.accessToken))
        .expect(204);
      expect(await t.prisma.chargingLog.count({ where: { userVehicleId: aliceCar } })).toBe(0);
      expect(await t.prisma.reminder.count({ where: { userVehicleId: aliceCar } })).toBe(0);
      // Date reminder without a car survives.
      expect(await t.prisma.reminder.count({ where: { userId: alice.userId } })).toBe(2);
    });
  });
  it('workflow: the steps above, in order', () => run(), run.timeout);
});
