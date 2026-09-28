/**
 * Trip planner over HTTP with a MOCKED routing provider (no network):
 * 503 when routing is not configured, stops reachable with the reserve +
 * alternative, compatibility / access / opening hours at arrival, live
 * status confidence, refusal when data is insufficient, saved plans and
 * per-user isolation. All stations and cars are synthetic test data.
 */
import { Prisma } from '../src/generated/prisma/client';
import { ROUTING_PROVIDER } from '../src/providers';
import type { RouteRequest, RouteResult } from '../src/providers/routing/routing.types';
import { haversineKm } from '../src/modules/trips/planner/geo';
import { bearer, createAndLogin, type LoggedIn } from './auth-test-helpers';
import { createTestCar } from './personal-helpers';
import { createStation } from './stations-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

/** Road distance = 1.2 × great-circle, 90 km/h, straight polyline — test double only. */
class FakeRouting {
  readonly name = 'fake-routing';
  readonly configured = true;
  readonly calls: RouteRequest[] = [];
  route(req: RouteRequest): Promise<RouteResult> {
    this.calls.push(req);
    const legs = req.waypoints.slice(1).map((p, i) => {
      const km = haversineKm(req.waypoints[i], p) * 1.2;
      return { distanceMeters: km * 1000, durationSeconds: (km / 90) * 3600 };
    });
    const coordinates: [number, number][] = [];
    req.waypoints.slice(1).forEach((p, i) => {
      const a = req.waypoints[i];
      for (let k = 0; k <= 20; k++) {
        if (i > 0 && k === 0) continue;
        coordinates.push([a.lng + ((p.lng - a.lng) * k) / 20, a.lat + ((p.lat - a.lat) * k) / 20]);
      }
    });
    return Promise.resolve({
      provider: this.name,
      distanceMeters: legs.reduce((s, l) => s + l.distanceMeters, 0),
      durationSeconds: legs.reduce((s, l) => s + l.durationSeconds, 0),
      legs,
      geometry: { type: 'LineString', coordinates },
      attribution: 'Test routing double',
    });
  }
  status() {
    return { type: 'routing', name: this.name, configured: true };
  }
  check() {
    return Promise.resolve({ ok: true });
  }
}

const ORIGIN = { lat: 30.0, lng: 31.0, label: 'Test origin' };
const DEST = { lat: 30.0, lng: 35.0, label: 'Test destination' };

describe('Personal: trip planner (e2e)', () => {
  describe('without a routing provider', () => {
    let t: TestApp;
    beforeAll(async () => {
      t = await createTestApp();
    });
    afterAll(async () => {
      await t?.close();
    });

    it('answers 503 INTEGRATION_NOT_CONFIGURED and app-config hides the planner', async () => {
      const variantId = await createTestCar(t, 'EG', { usableKwh: 60, consumptionWhKm: 180 });
      const res = await t
        .http()
        .post('/api/v1/trips/plan')
        .send({
          origin: ORIGIN,
          destination: DEST,
          variantId,
          currentSocPercent: 90,
          minArrivalSocPercent: 10,
        })
        .expect(503);
      expect(res.body.error.code).toBe('INTEGRATION_NOT_CONFIGURED');
      const cfg = await t.http().get('/api/v1/app-config').expect(200);
      expect(cfg.body.data.features.tripPlanner).toBe(false);
    });
  });

  describe('with a (mocked) routing provider', () => {
    let t: TestApp;
    let user: LoggedIn;
    let other: LoggedIn;
    let variantId: string;
    let noConsumptionVariant: string;
    const routing = new FakeRouting();
    const s: Record<string, { id: string; connectorIds: string[] }> = {};

    beforeAll(async () => {
      t = await createTestApp({
        override: (b) => b.overrideProvider(ROUTING_PROVIDER).useValue(routing),
      });
      user = await createAndLogin(t, ['user']);
      other = await createAndLogin(t, ['user']);
      variantId = await createTestCar(t, 'EG', {
        usableKwh: 60,
        consumptionWhKm: 180,
        acMaxKw: 11,
        curve: [
          [0, 100],
          [100, 100],
        ],
      });
      noConsumptionVariant = await createTestCar(t, 'EG', { usableKwh: 60 });
      s.main = await createStation(t, {
        name: 'Test DC main',
        lat: 30.0,
        lng: 33.0,
        connectors: [{ type: 'ccs2', current: 'DC', kw: 50 }],
      });
      s.alt = await createStation(t, {
        name: 'Test DC alt',
        lat: 30.01,
        lng: 32.5,
        connectors: [{ type: 'ccs2', current: 'DC', kw: 120 }],
      });
      s.ac = await createStation(t, {
        name: 'Test AC only',
        lat: 30.0,
        lng: 33.1,
        connectors: [{ type: 'type2', current: 'AC', kw: 22 }],
      });
      s.incompatible = await createStation(t, {
        name: 'Test CHAdeMO',
        lat: 30.0,
        lng: 33.2,
        connectors: [{ type: 'chademo', current: 'DC', kw: 50 }],
      });
      s.priv = await createStation(t, {
        name: 'Test private',
        lat: 30.0,
        lng: 33.15,
        accessType: 'private',
        connectors: [{ type: 'ccs2', current: 'DC', kw: 150 }],
      });
      s.demo = await createStation(t, {
        name: 'Test demo',
        lat: 30.0,
        lng: 33.18,
        connectors: [{ type: 'ccs2', current: 'DC', kw: 150 }],
      });
      await t.prisma.chargingStation.update({ where: { id: s.demo.id }, data: { isDemo: true } });
      // A fresh live observation on the main station (synthetic provider).
      await t.prisma.availabilityObservation.create({
        data: {
          provider: 'test-live',
          stationId: s.main.id,
          connectorId: s.main.connectorIds[0],
          status: 'available',
          observedAt: new Date(),
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
      });
    });
    afterAll(async () => {
      await t?.close();
    });

    const plan = (body: object, token?: string) => {
      const req = t.http().post('/api/v1/trips/plan?lang=en&market=EG');
      if (token) req.set(bearer(token));
      return req.send(body);
    };
    const base = () => ({
      origin: ORIGIN,
      destination: DEST,
      variantId,
      currentSocPercent: 90,
      minArrivalSocPercent: 10,
      departureAt: '2026-09-25T06:00:00Z',
      assumptions: { consumptionMarginPercent: 0, chargeToSocPercent: 90 },
    });

    it('plans one compatible DC stop with an alternative, keeping the reserve on real road legs', async () => {
      const res = await plan(base()).expect(200);
      const p = res.body.data;
      expect(p.feasible).toBe(true);
      expect(p.routing).toEqual({ provider: 'fake-routing', attribution: 'Test routing double' });
      expect(p.stops).toHaveLength(1);
      const stop = p.stops[0];
      expect(stop.station).toMatchObject({ id: s.main.id, name: 'Test DC main' });
      expect(stop.alternative.station.id).toBe(s.alt.id);
      expect(stop.connector).toMatchObject({
        currentType: 'DC',
        maxUsablePowerKw: 50,
        type: { code: 'ccs2' },
      });
      expect(stop).toMatchObject({
        openAtEta: 'open',
        accessType: 'public',
        operationalStatus: 'operational',
        chargeMethod: 'dc_curve',
      });
      expect(stop.availabilityNow).toMatchObject({
        status: 'available',
        freshness: 'live',
        source: 'test-live',
      });
      expect(stop.arrivalSocPercent).toBeGreaterThanOrEqual(10);
      expect(stop.chargeMinutes).toBeGreaterThan(0);
      expect(p.legs).toHaveLength(2);
      for (const leg of p.legs) expect(leg.arrivalSocPercent).toBeGreaterThanOrEqual(10);
      expect(p.summary.distanceKm).toBeCloseTo(
        (p.legs[0].distanceKm as number) + (p.legs[1].distanceKm as number),
        0,
      );
      expect(p.summary.totalMinutes.low).toBe(
        p.summary.driveMinutes + p.summary.chargingMinutes.low,
      );
      expect(p.summary.cost).toBeNull();
      expect(p.warnings.map((w: { code: string }) => w.code)).toContain('COST_NOT_CALCULATED');
      expect(
        p.assumptions.find((a: { key: string }) => a.key === 'consumptionKwhPer100km'),
      ).toMatchObject({ origin: 'catalog', value: 18 });
      expect(p.confidence).toBe('low'); // catalog consumption → never better than low/medium
      expect(p.disclaimer).toContain('not guaranteed');
      expect(p.geometry.type).toBe('LineString');
      // A second routing call goes through the stop (real road legs); it may come from
      // the route cache when another test planned the same trip first.
      expect(routing.calls.some((c) => c.waypoints.length === 3)).toBe(true);
      // Excluded: incompatible, private, demo, AC when DC is available.
      const used = [stop.station.id, stop.alternative.station.id];
      for (const k of ['incompatible', 'priv', 'demo', 'ac']) expect(used).not.toContain(s[k].id);
    });

    it('computes an approximate cost only from a price the user entered', async () => {
      const res = await plan({
        ...base(),
        assumptions: {
          ...base().assumptions,
          electricityPricePerKwh: 5,
          currency: 'EGP',
          priceDate: '2026-09-01',
        },
      }).expect(200);
      const p = res.body.data;
      expect(p.summary.cost).toMatchObject({ currency: 'EGP', priceDate: '2026-09-01' });
      expect(Number(p.summary.cost.amount)).toBeCloseTo(p.summary.gridEnergyKwh * 5, 1);
      await plan({ ...base(), assumptions: { electricityPricePerKwh: 5 } }).expect(422);
    });

    it('skips a station that is closed at the expected arrival', async () => {
      const closedAllWeek = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
      await t.prisma.chargingStation.update({
        where: { id: s.main.id },
        data: { isAlwaysOpen: false, openingHours: closedAllWeek },
      });
      const res = await plan(base()).expect(200);
      expect(
        res.body.data.stops.map((x: { station: { id: string } }) => x.station.id),
      ).not.toContain(s.main.id);
      await t.prisma.chargingStation.update({
        where: { id: s.main.id },
        data: { isAlwaysOpen: true, openingHours: Prisma.DbNull },
      });
    });

    it('no stop needed for a short trip', async () => {
      const res = await plan({ ...base(), destination: { lat: 30.0, lng: 32.0 } }).expect(200);
      expect(res.body.data.stops).toEqual([]);
      expect(res.body.data.legs).toHaveLength(1);
    });

    it('refuses to invent a plan when no station is reachable', async () => {
      const res = await plan({
        ...base(),
        origin: { lat: 25.0, lng: 25.0 },
        destination: { lat: 25.0, lng: 30.0 },
      }).expect(422);
      expect(res.body.error.code).toBe('TRIP_NO_REACHABLE_STATION');
      expect(res.body.error.details).toMatchObject({ reason: 'no_reachable_station', atKm: 0 });
    });

    it('refuses when car data is missing; user assumptions can supply it', async () => {
      const res = await plan({
        ...base(),
        variantId: noConsumptionVariant,
        assumptions: undefined,
      }).expect(422);
      expect(res.body.error).toMatchObject({
        code: 'TRIP_VEHICLE_DATA_MISSING',
        details: { missing: ['consumptionKwhPer100km'] },
      });
      const ok = await plan({
        ...base(),
        variantId: noConsumptionVariant,
        destination: { lat: 30.0, lng: 32.0 },
        assumptions: { consumptionKwhPer100km: 17 },
      }).expect(200);
      expect(
        ok.body.data.assumptions.find((a: { key: string }) => a.key === 'consumptionKwhPer100km')
          .origin,
      ).toBe('user');
    });

    it('validates input', async () => {
      await plan({ ...base(), currentSocPercent: 10, minArrivalSocPercent: 10 }).expect(422);
      await plan({ ...base(), currentSocPercent: 0 }).expect(422);
      await plan({ ...base(), origin: { lat: 95, lng: 0 } }).expect(422);
      await plan({ ...base(), variantId: undefined }).expect(422);
      await plan({ ...base(), userVehicleId: variantId }).expect(422);
      await plan({ ...base(), foo: 'bar' }).expect(422);
    });

    it('saves a plan for a garage car; saved plans are private', async () => {
      await plan({ ...base(), save: true }).expect(422); // guests cannot save
      const car = await t
        .http()
        .post('/api/v1/me/vehicles')
        .set(bearer(user.accessToken))
        .send({ variantId, marketCode: 'EG' })
        .expect(201);
      const { variantId: _v, ...rest } = base();
      const res = await plan(
        { ...rest, userVehicleId: car.body.data.id, save: true, title: 'Test trip' },
        user.accessToken,
      ).expect(200);
      const id = res.body.data.savedPlanId as string;
      expect(id).toBeTruthy();
      await plan({ ...rest, userVehicleId: car.body.data.id }, other.accessToken).expect(422);

      const list = await t.http().get('/api/v1/me/trips').set(bearer(user.accessToken)).expect(200);
      expect(list.body.data[0]).toMatchObject({
        id,
        title: 'Test trip',
        originLabel: 'Test origin',
        destinationLabel: 'Test destination',
      });
      const one = await t
        .http()
        .get(`/api/v1/me/trips/${id}?lang=en`)
        .set(bearer(user.accessToken))
        .expect(200);
      expect(one.body.data.plan.stops).toHaveLength(1);
      expect(one.body.data.staleNotice).toContain('may have changed');
      await t.http().get(`/api/v1/me/trips/${id}`).set(bearer(other.accessToken)).expect(404);
      await t.http().delete(`/api/v1/me/trips/${id}`).set(bearer(other.accessToken)).expect(404);
      const otherList = await t
        .http()
        .get('/api/v1/me/trips')
        .set(bearer(other.accessToken))
        .expect(200);
      expect(otherList.body.meta.total).toBe(0);
      await t.http().delete(`/api/v1/me/trips/${id}`).set(bearer(user.accessToken)).expect(204);
      await t.http().get('/api/v1/me/trips').expect(401);
    });
  });
});
