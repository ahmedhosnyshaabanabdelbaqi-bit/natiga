import { GeoInputError, nearbyQuery, parseBBox, withinBBox, withinRadius } from './geo';

describe('geo helpers', () => {
  it('parses bbox', () => {
    expect(parseBBox('31.1,29.9,31.4,30.2')).toEqual({
      minLng: 31.1,
      minLat: 29.9,
      maxLng: 31.4,
      maxLat: 30.2,
    });
    expect(() => parseBBox('1,2,3')).toThrow(GeoInputError);
    expect(() => parseBBox('0,95,1,96')).toThrow(/latitude/);
    expect(() => parseBBox('10,0,5,1')).toThrow(/antimeridian/);
  });

  it('parameterizes values and whitelists identifiers', () => {
    const sql = withinRadius('charging_stations', { lat: 30.04, lng: 31.23 }, 5000);
    expect(sql.sql).toContain('ST_DWithin("charging_stations"."location"');
    expect(sql.values).toEqual([31.23, 30.04, 5000]);
    const bbox = withinBBox('charging_stations', parseBBox('31,29,32,30'), 't');
    expect(bbox.sql).toContain('"t"."location" && ST_MakeEnvelope(');
  });

  it('rejects invalid input', () => {
    expect(() => withinRadius('charging_stations', { lat: 91, lng: 0 }, 10)).toThrow(GeoInputError);
    expect(() => withinRadius('charging_stations', { lat: 0, lng: 0 }, 0)).toThrow(/radius/);
    expect(() =>
      nearbyQuery({
        table: 'charging_stations',
        center: { lat: 0, lng: 0 },
        radiusMeters: 10,
        limit: 0,
      }),
    ).toThrow(/limit/);
  });

  it('builds a KNN nearby query', () => {
    const q = nearbyQuery({
      table: 'service_providers',
      center: { lat: 24.7, lng: 46.7 },
      radiusMeters: 1000,
      limit: 5,
    });
    expect(q.sql).toContain('FROM "service_providers" AS t');
    expect(q.sql).toContain('<->');
    expect(q.values).toContain(5);
  });
});
