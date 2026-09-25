/**
 * Licence validity (REQUIREMENTS §9 "سجّل صاحب الحقوق والترخيص ومتطلبات
 * الإسناد لكل ملف"). The database refuses a published tour whose files have
 * no licence; validity DATES are time-dependent, so they are checked here
 * (publishing, public listings, "expiring soon" reports). Pure — unit tested.
 */

export type LicenseValidity = 'valid' | 'expired' | 'not_yet_valid';

export interface LicenseDates {
  validFrom: Date | null;
  validUntil: Date | null;
}

/** "YYYY-MM-DD" of a date in UTC. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Validity on `today` (calendar days, inclusive bounds, UTC). */
export function licenseValidity(l: LicenseDates, today: Date = new Date()): LicenseValidity {
  const day = isoDay(today);
  if (l.validFrom && isoDay(l.validFrom) > day) return 'not_yet_valid';
  if (l.validUntil && isoDay(l.validUntil) < day) return 'expired';
  return 'valid';
}

/** Whole days from today until validUntil (negative when expired, null when open-ended). */
export function daysLeft(l: LicenseDates, today: Date = new Date()): number | null {
  if (!l.validUntil) return null;
  const end = Date.parse(`${isoDay(l.validUntil)}T00:00:00Z`);
  const start = Date.parse(`${isoDay(today)}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

/** UTC midnight of today (for `valid_until >= today` filters on DATE columns). */
export function todayUtc(now: Date = new Date()): Date {
  return new Date(`${isoDay(now)}T00:00:00.000Z`);
}

/** Credit line shown with a file: asset credit, else licence attribution, else rights holder. */
export function creditLine(
  asset: { creditText: string | null },
  license: { attributionText: string | null; rightsHolder: string } | null,
): string | null {
  return asset.creditText ?? license?.attributionText ?? license?.rightsHolder ?? null;
}
