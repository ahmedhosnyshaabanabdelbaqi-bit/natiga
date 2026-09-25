import { DateTime, IANAZone } from 'luxon';

/**
 * Opening hours (docs/decisions/prep-remaining-schema.md §4):
 *   {"mon":[["08:00","22:00"]],"fri":[],"sat":[["10:00","14:00"],["16:00","24:00"]]}
 * keys mon..sun; each day ≤ 6 windows ["HH:MM","HH:MM"] in the station's
 * local time; "24:00" allowed as end; end < start = past midnight; [] =
 * closed; missing day = unknown; NULL = unknown. `isAlwaysOpen = true` ⇒
 * opening_hours NULL. Mirrors the SQL function app_valid_opening_hours().
 *
 * "Open now" is computed at request time in the station time zone (luxon,
 * DST-aware) and never stored.
 */
export const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];
export type OpeningWindow = [string, string];
export type OpeningHours = Partial<Record<WeekDay, OpeningWindow[]>>;

const START_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const END_RE = /^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$/;
export const MAX_WINDOWS_PER_DAY = 6;

export interface HoursProblem {
  /** e.g. "openingHours.mon[0]" */
  path: string;
  rule: 'object' | 'day' | 'windows' | 'window' | 'time' | 'empty_window';
}

/** Validates the JSON shape exactly like app_valid_opening_hours(); [] = valid. */
export function validateOpeningHours(value: unknown): HoursProblem[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object' || Array.isArray(value)) {
    return [{ path: 'openingHours', rule: 'object' }];
  }
  const problems: HoursProblem[] = [];
  for (const [day, windows] of Object.entries(value as Record<string, unknown>)) {
    const base = `openingHours.${day}`;
    if (!(WEEK_DAYS as readonly string[]).includes(day)) {
      problems.push({ path: base, rule: 'day' });
      continue;
    }
    if (!Array.isArray(windows) || windows.length > MAX_WINDOWS_PER_DAY) {
      problems.push({ path: base, rule: 'windows' });
      continue;
    }
    windows.forEach((w: unknown, i) => {
      const path = `${base}[${i}]`;
      if (
        !Array.isArray(w) ||
        w.length !== 2 ||
        typeof w[0] !== 'string' ||
        typeof w[1] !== 'string'
      ) {
        problems.push({ path, rule: 'window' });
      } else if (!START_RE.test(w[0]) || !END_RE.test(w[1])) {
        problems.push({ path, rule: 'time' });
      } else if (w[0] === w[1]) {
        problems.push({ path, rule: 'empty_window' });
      }
    });
  }
  return problems;
}

export function isValidTimezone(tz: unknown): tz is string {
  return typeof tz === 'string' && tz.length <= 64 && IANAZone.isValidZone(tz);
}

export type OpenState = 'open' | 'closed' | 'unknown';
export type OpenReason = 'always_open' | 'schedule' | 'unknown_schedule' | 'unknown_day';

export interface OpenNowResult {
  state: OpenState;
  reason: OpenReason;
  /** End of the current opening (UTC ISO) when open and known. */
  closesAt: string | null;
  /** Next opening (UTC ISO) when closed and known within 7 days. */
  opensAt: string | null;
  /** Local wall time in the station time zone, "HH:mm". */
  localTime: string;
  evaluatedAt: string;
}

interface Interval {
  start: number;
  end: number;
  known: boolean;
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Wall time `minutes` after local midnight of `day` (DST-safe via luxon). */
function at(day: DateTime, minutes: number): DateTime {
  if (minutes >= 24 * 60) return day.plus({ days: 1 }).startOf('day');
  return day.set({
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
    second: 0,
    millisecond: 0,
  });
}

function dayKey(day: DateTime): WeekDay {
  return WEEK_DAYS[day.weekday - 1];
}

/**
 * Expands a weekly schedule into absolute intervals from `from` (a local
 * midnight) for `days` days: open windows (`known: true`) and whole unknown
 * days (`known: false`).
 */
function expand(hours: OpeningHours, from: DateTime, days: number): Interval[] {
  const out: Interval[] = [];
  for (let d = 0; d < days; d++) {
    const day = from.plus({ days: d });
    const windows = hours[dayKey(day)];
    if (windows === undefined) {
      out.push({
        start: day.toMillis(),
        end: day.plus({ days: 1 }).startOf('day').toMillis(),
        known: false,
      });
      continue;
    }
    for (const [s, e] of windows) {
      const startMin = minutesOf(s);
      const endMin = e === '24:00' ? 24 * 60 : minutesOf(e);
      const start = at(day, startMin);
      const end = endMin > startMin ? at(day, endMin) : at(day.plus({ days: 1 }), endMin);
      if (end.toMillis() > start.toMillis()) {
        out.push({ start: start.toMillis(), end: end.toMillis(), known: true });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * "Open now" of a place from its schedule + IANA time zone at `now`.
 * - isAlwaysOpen = true → open (24/7).
 * - no schedule → unknown (text hours are shown as published, never parsed).
 * - inside an open window (incl. a past-midnight window of the previous
 *   day) → open, with closesAt = end of the merged window.
 * - today (or, for early hours, yesterday) unknown → unknown.
 * - otherwise closed, with opensAt = next known window within 7 days
 *   (null when an unknown day comes first).
 */
export function evaluateOpenNow(
  hours: OpeningHours | null | undefined,
  isAlwaysOpen: boolean | null | undefined,
  timezone: string,
  now: Date,
): OpenNowResult {
  const zone = isValidTimezone(timezone) ? timezone : 'UTC';
  const local = DateTime.fromJSDate(now, { zone });
  const base = {
    localTime: local.toFormat('HH:mm'),
    evaluatedAt: now.toISOString(),
    closesAt: null,
    opensAt: null,
  };
  if (isAlwaysOpen === true) return { ...base, state: 'open', reason: 'always_open' };
  if (!hours || typeof hours !== 'object' || validateOpeningHours(hours).length > 0) {
    return { ...base, state: 'unknown', reason: 'unknown_schedule' };
  }
  const t = now.getTime();
  const intervals = expand(hours, local.startOf('day').minus({ days: 1 }), 9);
  const open = intervals.filter((i) => i.known);

  const current = open.find((i) => i.start <= t && t < i.end);
  if (current) {
    // Merge contiguous / overlapping windows (e.g. "20:00-24:00" + next "00:00-02:00").
    let end = current.end;
    for (let changed = true; changed;) {
      changed = false;
      for (const i of open) {
        if (i.start <= end && i.end > end) {
          end = i.end;
          changed = true;
        }
      }
    }
    const unknownAtEnd = intervals.some((i) => !i.known && i.start <= end && end < i.end);
    return {
      ...base,
      state: 'open',
      reason: 'schedule',
      closesAt: unknownAtEnd ? null : new Date(end).toISOString(),
    };
  }

  const today = hours[dayKey(local)];
  if (today === undefined) return { ...base, state: 'unknown', reason: 'unknown_day' };
  // An unknown previous day may have a past-midnight window covering now.
  const yesterday = hours[dayKey(local.minus({ days: 1 }))];
  if (yesterday === undefined) {
    return { ...base, state: 'unknown', reason: 'unknown_day' };
  }

  const next = intervals.find((i) => i.end > t && (i.known ? i.start > t : true));
  const opensAt = next && next.known ? new Date(next.start).toISOString() : null;
  return { ...base, state: 'closed', reason: 'schedule', opensAt };
}

export interface WeeklyDayView {
  day: WeekDay;
  /** null = unknown, [] = closed. */
  windows: { start: string; end: string }[] | null;
}

export function weeklyView(hours: OpeningHours | null | undefined): WeeklyDayView[] | null {
  if (!hours || typeof hours !== 'object') return null;
  return WEEK_DAYS.map((day) => {
    const w = hours[day];
    return { day, windows: w === undefined ? null : w.map(([start, end]) => ({ start, end })) };
  });
}
