import { nextOccurrence, reminderState, type ReminderLike } from './reminder-rules';

const base: ReminderLike = {
  dueDate: null,
  dueOdometerKm: null,
  notifyDaysBefore: 7,
  notifyKmBefore: null,
  completedAt: null,
  repeatIntervalMonths: null,
  repeatIntervalKm: null,
};
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const today = new Date('2026-09-25T15:30:00Z');

describe('reminderState', () => {
  it('date-based: upcoming / due soon / overdue and notifyOn', () => {
    expect(reminderState({ ...base, dueDate: d('2026-10-20') }, null, today)).toEqual({
      status: 'upcoming',
      dueInDays: 25,
      dueInKm: null,
      notifyOn: '2026-10-13',
    });
    expect(reminderState({ ...base, dueDate: d('2026-10-02') }, null, today).status).toBe(
      'due_soon',
    );
    expect(reminderState({ ...base, dueDate: d('2026-09-25') }, null, today)).toMatchObject({
      status: 'due_soon',
      dueInDays: 0,
    });
    expect(reminderState({ ...base, dueDate: d('2026-09-24') }, null, today)).toMatchObject({
      status: 'overdue',
      dueInDays: -1,
    });
  });

  it('odometer-based needs the car odometer; unknown odometer stays upcoming with dueInKm null', () => {
    const r = { ...base, dueOdometerKm: 20000, notifyKmBefore: 500 };
    expect(reminderState(r, null, today)).toMatchObject({
      status: 'upcoming',
      dueInKm: null,
      notifyOn: null,
    });
    expect(reminderState(r, 19000, today)).toMatchObject({ status: 'upcoming', dueInKm: 1000 });
    expect(reminderState(r, 19600, today)).toMatchObject({ status: 'due_soon', dueInKm: 400 });
    expect(reminderState(r, 20100, today)).toMatchObject({ status: 'overdue', dueInKm: -100 });
  });

  it('whichever comes first wins; completed stays completed', () => {
    const r = { ...base, dueDate: d('2027-06-01'), dueOdometerKm: 20000 };
    expect(reminderState(r, 20500, today).status).toBe('overdue');
    expect(reminderState({ ...r, completedAt: today }, 20500, today).status).toBe('completed');
  });
});

describe('nextOccurrence', () => {
  it('no repeat → null', () => {
    expect(nextOccurrence({ ...base, dueDate: d('2026-10-01') }, null)).toBeNull();
  });

  it('adds months (end-of-month safe) and km from the reading at completion', () => {
    expect(
      nextOccurrence({ ...base, dueDate: d('2026-01-31'), repeatIntervalMonths: 1 }, null),
    ).toEqual({ dueDate: d('2026-02-28'), dueOdometerKm: null });
    expect(
      nextOccurrence({ ...base, dueOdometerKm: 20000, repeatIntervalKm: 10000 }, 20350),
    ).toEqual({ dueDate: null, dueOdometerKm: 30350 });
    expect(
      nextOccurrence(
        {
          ...base,
          dueDate: d('2026-10-01'),
          dueOdometerKm: 20000,
          repeatIntervalMonths: 12,
          repeatIntervalKm: 15000,
        },
        null,
      ),
    ).toEqual({ dueDate: d('2027-10-01'), dueOdometerKm: 35000 });
  });
});
