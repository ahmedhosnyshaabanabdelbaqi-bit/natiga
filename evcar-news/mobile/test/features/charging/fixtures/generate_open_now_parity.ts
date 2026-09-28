/**
 * Generates open_now_parity.json from the BACKEND "open now" rules
 * (backend/src/modules/stations/common/opening-hours.ts) so the Dart port
 * (lib/features/charging/domain/station_status.dart evaluateOpenNow) can be
 * checked case by case (test/features/charging/open_now_parity_test.dart).
 * Random but seeded: valid weekly schedules (unknown / closed / past-midnight /
 * 24:00 days), 8 IANA zones, instants spread over 2026 including both DST
 * transitions. Review 3 found 311 / 4000 mismatches in a similar run (unknown yesterday).
 *
 * Run from backend/:
 *   cd backend && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","ignoreDeprecations":"6.0"}' \
 *     npx ts-node --transpile-only ../mobile/test/features/charging/fixtures/generate_open_now_parity.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluateOpenNow,
  validateOpeningHours,
  weeklyView,
  WEEK_DAYS,
  type OpeningHours,
} from '../../../../../backend/src/modules/stations/common/opening-hours';

let seed = 20260928;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const ZONES = [
  'Africa/Cairo',
  'Asia/Riyadh',
  'Asia/Dubai',
  'Europe/Berlin',
  'Europe/London',
  'America/New_York',
  'Australia/Sydney',
  'Asia/Kolkata',
];
// Around the 2026 DST transitions (EU: Mar 29 / Oct 25, US: Mar 8 / Nov 1,
// Egypt: Apr 24 / Oct 29, Sydney: Apr 5 / Oct 4) plus random instants.
const ANCHORS = [
  '2026-03-08T07:00:00Z',
  '2026-03-29T01:00:00Z',
  '2026-04-05T00:00:00Z',
  '2026-04-23T22:00:00Z',
  '2026-10-04T00:00:00Z',
  '2026-10-25T01:00:00Z',
  '2026-10-29T21:00:00Z',
  '2026-11-01T06:00:00Z',
  '2026-09-27T08:51:00Z',
].map((s) => Date.parse(s));

function day(): [string, string][] | undefined {
  const r = rnd();
  if (r < 0.15) return undefined; // unknown day
  if (r < 0.25) return []; // closed
  if (r < 0.3) return [['00:00', '24:00']];
  const out: [string, string][] = [];
  let cursor = Math.floor(rnd() * 8) * 30;
  const n = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < n && cursor < 23 * 60; i++) {
    const start = cursor + Math.floor(rnd() * 6) * 30;
    if (start >= 24 * 60) break;
    let end = start + 30 + Math.floor(rnd() * 20) * 30;
    const last = i === n - 1;
    if (end >= 24 * 60) {
      if (last && rnd() < 0.6) end = end - 24 * 60; // runs past midnight
      else end = 24 * 60;
    }
    out.push([hhmm(start), end === 24 * 60 ? '24:00' : hhmm(end)]);
    if (end <= start) break;
    cursor = end + 30;
  }
  return out;
}

const cases: unknown[] = [];
while (cases.length < 1500) {
  const hours: OpeningHours = {};
  for (const d of WEEK_DAYS) {
    const w = day();
    if (w !== undefined) hours[d] = w;
  }
  if (validateOpeningHours(hours).length > 0) continue;
  const timezone = pick(ZONES);
  const base = rnd() < 0.5 ? pick(ANCHORS) : Date.parse('2026-01-01T00:00:00Z') + rnd() * 365 * 86400_000;
  const now = new Date(Math.floor((base + (rnd() - 0.5) * 3 * 86400_000) / 60_000) * 60_000);
  const isAlwaysOpen = rnd() < 0.03 ? true : null;
  const r = evaluateOpenNow(hours, isAlwaysOpen, timezone, now);
  cases.push({
    timezone,
    isAlwaysOpen,
    weekly: weeklyView(hours),
    now: now.toISOString(),
    state: r.state,
    reason: r.reason,
  });
}
writeFileSync(join(__dirname, 'open_now_parity.json'), JSON.stringify(cases) + '\n');
console.log(`wrote ${cases.length} cases`);
