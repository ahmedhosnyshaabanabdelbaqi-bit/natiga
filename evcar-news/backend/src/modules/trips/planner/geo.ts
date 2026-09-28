/**
 * Small geodesy helpers for the trip planner (pure). Coordinates follow
 * GeoJSON order [lng, lat] for polylines.
 */
export interface LatLng {
  lat: number;
  lng: number;
}

const R_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cumulative great-circle length (km) at every vertex of a [lng, lat] polyline. */
export function cumulativeKm(line: [number, number][]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) {
    out.push(
      out[i - 1] +
        haversineKm(
          { lng: line[i - 1][0], lat: line[i - 1][1] },
          { lng: line[i][0], lat: line[i][1] },
        ),
    );
  }
  return out;
}

/**
 * Projects a point on the polyline: distance along it (km, geometric) and
 * the perpendicular offset (km). Local equirectangular projection per
 * segment — accurate enough for corridor distances of a few km.
 */
export function projectOnLine(
  line: [number, number][],
  cum: number[],
  p: LatLng,
): { alongKm: number; offsetKm: number } {
  let best = { alongKm: 0, offsetKm: Number.POSITIVE_INFINITY };
  for (let i = 1; i < line.length; i++) {
    const a = { lng: line[i - 1][0], lat: line[i - 1][1] };
    const b = { lng: line[i][0], lat: line[i][1] };
    const k = Math.cos(rad((a.lat + b.lat) / 2));
    const ax = a.lng * k;
    const ay = a.lat;
    const bx = b.lng * k - ax;
    const by = b.lat - ay;
    const px = p.lng * k - ax;
    const py = p.lat - ay;
    const len2 = bx * bx + by * by;
    const f = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
    const q = { lng: a.lng + f * (b.lng - a.lng), lat: a.lat + f * (b.lat - a.lat) };
    const offset = haversineKm(p, q);
    if (offset < best.offsetKm) {
      best = { alongKm: cum[i - 1] + f * (cum[i] - cum[i - 1]), offsetKm: offset };
    }
  }
  if (line.length === 1)
    best = { alongKm: 0, offsetKm: haversineKm(p, { lng: line[0][0], lat: line[0][1] }) };
  return best;
}

/** Keeps at most `max` vertices (always the first and last). */
export function simplify(line: [number, number][], max: number): [number, number][] {
  if (line.length <= max) return line;
  const step = (line.length - 1) / (max - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < max; i++) out.push(line[Math.round(i * step)]);
  return out;
}
