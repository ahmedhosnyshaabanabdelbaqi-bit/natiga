/**
 * Pure reminder rules (REQUIREMENTS §14): status, "notify on" date for the
 * app's local notification, and the next occurrence of a repeating reminder.
 * Dates are calendar dates (UTC midnight); odometer in km.
 */
import { DateTime } from 'luxon';

export type ReminderStatus = 'upcoming' | 'due_soon' | 'overdue' | 'completed';

export interface ReminderLike {
  dueDate: Date | null;
  dueOdometerKm: number | null;
  notifyDaysBefore: number;
  notifyKmBefore: number | null;
  completedAt: Date | null;
  repeatIntervalMonths: number | null;
  repeatIntervalKm: number | null;
}

export const REMINDER_TYPE_LABELS = {
  maintenance: { ar: 'صيانة دورية', en: 'Maintenance' },
  insurance: { ar: 'تجديد التأمين', en: 'Insurance renewal' },
  licence: { ar: 'تجديد الترخيص', en: 'Licence renewal' },
  tyres: { ar: 'الإطارات', en: 'Tyres' },
  custom: { ar: 'تذكير', en: 'Reminder' },
} as const;
export type ReminderTypeKey = keyof typeof REMINDER_TYPE_LABELS;

const DAY_MS = 86_400_000;

export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function reminderState(
  r: ReminderLike,
  currentOdometerKm: number | null,
  today: Date,
): {
  status: ReminderStatus;
  dueInDays: number | null;
  dueInKm: number | null;
  notifyOn: string | null;
} {
  const dueInDays = r.dueDate
    ? Math.round((utcDay(r.dueDate).getTime() - utcDay(today).getTime()) / DAY_MS)
    : null;
  const dueInKm =
    r.dueOdometerKm !== null && currentOdometerKm !== null
      ? Math.round((r.dueOdometerKm - currentOdometerKm) * 10) / 10
      : null;
  const notifyOn = r.dueDate
    ? new Date(utcDay(r.dueDate).getTime() - r.notifyDaysBefore * DAY_MS).toISOString().slice(0, 10)
    : null;
  if (r.completedAt) return { status: 'completed', dueInDays, dueInKm, notifyOn };
  let status: ReminderStatus = 'upcoming';
  if ((dueInDays !== null && dueInDays < 0) || (dueInKm !== null && dueInKm < 0))
    status = 'overdue';
  else if (
    (dueInDays !== null && dueInDays <= r.notifyDaysBefore) ||
    (dueInKm !== null && dueInKm <= (r.notifyKmBefore ?? 0))
  ) {
    status = 'due_soon';
  }
  return { status, dueInDays, dueInKm, notifyOn };
}

/**
 * Next occurrence after completing a repeating reminder, or null when it
 * does not repeat. Date: previous due date + N months (end-of-month safe);
 * odometer: (reading at completion, else previous due) + N km.
 */
export function nextOccurrence(
  r: ReminderLike,
  completedOdometerKm: number | null,
): { dueDate: Date | null; dueOdometerKm: number | null } | null {
  const byDate = r.repeatIntervalMonths !== null && r.dueDate !== null;
  const byKm =
    r.repeatIntervalKm !== null && (r.dueOdometerKm !== null || completedOdometerKm !== null);
  if (!byDate && !byKm) return null;
  const dueDate = byDate
    ? DateTime.fromJSDate(utcDay(r.dueDate!), { zone: 'utc' })
        .plus({ months: r.repeatIntervalMonths! })
        .toJSDate()
    : null;
  const base = completedOdometerKm ?? r.dueOdometerKm;
  const dueOdometerKm = byKm ? Math.round((base! + r.repeatIntervalKm!) * 10) / 10 : null;
  return { dueDate, dueOdometerKm };
}
