/**
 * Pure notification rules (REQUIREMENTS §16): which preference switch a
 * notification category depends on, and quiet hours in the user's time zone.
 */
import { DateTime, IANAZone } from 'luxon';

export const NOTIFICATION_CATEGORIES = [
  'news',
  'price_alert',
  'reminder',
  'community',
  'station',
  'campaign',
  /** Account / security: always delivered in-app, never muted. */
  'account',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * Preference switches (`types.*` of /me/notification-preferences) that a server
 * component actually PRODUCES today (review 3). Clients show only these; a switch
 * without a producer would be a button without a function. Add a key here when
 * its producer ships (price-change listener, community replies, station alerts,
 * campaigns). `reminders` stays off the list: reminders are local notifications
 * scheduled by the app itself.
 */
export const PRODUCED_PREFERENCE_TYPES = ['news'] as const;

/**
 * Topic types whose follow actually leads to notifications today (the
 * article-published listener matches variant → model → brand → category).
 */
export const PRODUCED_TOPIC_TYPES = ['brand', 'model', 'variant', 'category'] as const;

export interface PreferenceSwitches {
  pushEnabled: boolean;
  newsEnabled: boolean;
  priceAlertsEnabled: boolean;
  remindersEnabled: boolean;
  communityEnabled: boolean;
  stationAlertsEnabled: boolean;
  campaignsEnabled: boolean;
  unsubscribedAt: Date | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string | null;
}

export const DEFAULT_PREFERENCES: PreferenceSwitches = {
  pushEnabled: true,
  newsEnabled: true,
  priceAlertsEnabled: true,
  remindersEnabled: true,
  communityEnabled: true,
  stationAlertsEnabled: true,
  campaignsEnabled: true,
  unsubscribedAt: null,
  quietHoursStart: null,
  quietHoursEnd: null,
  timezone: null,
};

/** Does the user want this category at all (in-app + push)? */
export function categoryAllowed(p: PreferenceSwitches, category: NotificationCategory): boolean {
  if (category === 'account') return true;
  if (p.unsubscribedAt) return false;
  switch (category) {
    case 'news':
      return p.newsEnabled;
    case 'price_alert':
      return p.priceAlertsEnabled;
    case 'reminder':
      return p.remindersEnabled;
    case 'community':
      return p.communityEnabled;
    case 'station':
      return p.stationAlertsEnabled;
    case 'campaign':
      return p.campaignsEnabled;
  }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidHhmm(v: unknown): v is string {
  return typeof v === 'string' && HHMM.test(v);
}

export function isValidZone(tz: unknown): tz is string {
  return typeof tz === 'string' && tz.length <= 64 && IANAZone.isValidZone(tz);
}

/**
 * Quiet hours [start, end) in the user's zone; a window with end < start
 * crosses midnight ("22:00"–"07:00"); start = end means no quiet hours.
 * Returns whether `now` is inside and, if so, when the window ends (UTC).
 */
export function quietHoursState(
  start: string | null,
  end: string | null,
  timezone: string | null,
  now: Date,
): { quiet: boolean; endsAt: Date | null } {
  if (!isValidHhmm(start) || !isValidHhmm(end) || !isValidZone(timezone) || start === end) {
    return { quiet: false, endsAt: null };
  }
  const local = DateTime.fromJSDate(now, { zone: timezone });
  const mins = local.hour * 60 + local.minute;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  const crosses = e < s;
  const inside = crosses ? mins >= s || mins < e : mins >= s && mins < e;
  if (!inside) return { quiet: false, endsAt: null };
  let endDay = local.startOf('day');
  if (crosses && mins >= s) endDay = endDay.plus({ days: 1 });
  const endsAt = endDay.set({ hour: eh, minute: em, second: 0, millisecond: 0 });
  return { quiet: true, endsAt: endsAt.toUTC().toJSDate() };
}

/** Safe deep link: an in-app path ("/news/x", not "//host") or an https URL. */
export function isSafeDeepLink(v: string | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (v.length > 1024) return false;
  if (/^\/($|[^/\\])/.test(v)) return !/[\s<>"']/.test(v);
  try {
    const u = new URL(v);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}
