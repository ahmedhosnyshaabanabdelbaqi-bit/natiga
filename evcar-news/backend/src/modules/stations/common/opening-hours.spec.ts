import {
  evaluateOpenNow,
  isValidTimezone,
  type OpeningHours,
  validateOpeningHours,
  weeklyView,
} from './opening-hours';

const week = (windows: [string, string][]): OpeningHours => ({
  mon: windows,
  tue: windows,
  wed: windows,
  thu: windows,
  fri: windows,
  sat: windows,
  sun: windows,
});

describe('validateOpeningHours (mirrors app_valid_opening_hours)', () => {
  it('accepts null, closed days, "24:00" and past-midnight windows', () => {
    expect(validateOpeningHours(null)).toEqual([]);
    expect(
      validateOpeningHours({
        mon: [['08:00', '22:00']],
        fri: [],
        sat: [
          ['10:00', '14:00'],
          ['16:00', '24:00'],
        ],
        sun: [['22:00', '02:00']],
      }),
    ).toEqual([]);
  });

  it.each([
    [[], 'object'],
    ['08-22', 'object'],
    [{ monday: [] }, 'day'],
    [{ mon: 'all day' }, 'windows'],
    [{ mon: [['08:00']] }, 'window'],
    [{ mon: [['8:00', '22:00']] }, 'time'],
    [{ mon: [['24:00', '23:00']] }, 'time'],
    [{ mon: [['08:00', '24:30']] }, 'time'],
    [{ mon: [['08:00', '08:00']] }, 'empty_window'],
    [{ mon: Array.from({ length: 7 }, () => ['08:00', '09:00']) }, 'windows'],
  ])('rejects %j (%s)', (value, rule) => {
    expect(validateOpeningHours(value).map((p) => p.rule)).toContain(rule);
  });

  it('knows IANA zones', () => {
    expect(isValidTimezone('Africa/Cairo')).toBe(true);
    expect(isValidTimezone('Asia/Riyadh')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
    expect(isValidTimezone(42)).toBe(false);
  });
});

describe('evaluateOpenNow', () => {
  // Friday 2026-09-25 19:30 UTC: Cairo 22:30 (EEST, UTC+3), Riyadh 22:30 (UTC+3), Dubai 23:30 (UTC+4).
  const fridayEvening = new Date('2026-09-25T19:30:00Z');
  const hours: OpeningHours = { fri: [['22:00', '23:00']], thu: [['08:00', '20:00']] };

  it('evaluates the same schedule in the station time zone (Cairo / Riyadh / Dubai)', () => {
    const cairo = evaluateOpenNow(hours, false, 'Africa/Cairo', fridayEvening);
    expect(cairo).toMatchObject({ state: 'open', reason: 'schedule', localTime: '22:30' });
    expect(cairo.closesAt).toBe('2026-09-25T20:00:00.000Z');

    const riyadh = evaluateOpenNow(hours, false, 'Asia/Riyadh', fridayEvening);
    expect(riyadh).toMatchObject({ state: 'open', localTime: '22:30' });

    const dubai = evaluateOpenNow(hours, false, 'Asia/Dubai', fridayEvening);
    expect(dubai).toMatchObject({ state: 'closed', localTime: '23:30', closesAt: null });
  });

  it('follows DST: Cairo is UTC+2 in winter, Riyadh stays UTC+3', () => {
    const winter = new Date('2026-12-04T19:30:00Z'); // a Friday
    const h: OpeningHours = { ...week([['08:00', '09:00']]), fri: [['22:00', '23:00']] };
    expect(evaluateOpenNow(h, false, 'Africa/Cairo', winter)).toMatchObject({
      state: 'closed',
      localTime: '21:30',
      opensAt: '2026-12-04T20:00:00.000Z',
    });
    expect(evaluateOpenNow(h, false, 'Asia/Riyadh', winter)).toMatchObject({
      state: 'open',
      localTime: '22:30',
    });
  });

  it('24/7 is open; no schedule is unknown (text hours are never parsed)', () => {
    expect(evaluateOpenNow(null, true, 'Africa/Cairo', fridayEvening)).toMatchObject({
      state: 'open',
      reason: 'always_open',
    });
    expect(evaluateOpenNow(null, null, 'Africa/Cairo', fridayEvening)).toMatchObject({
      state: 'unknown',
      reason: 'unknown_schedule',
    });
    expect(evaluateOpenNow(null, false, 'Africa/Cairo', fridayEvening).state).toBe('unknown');
  });

  it('a missing day is unknown, an empty day is closed', () => {
    expect(
      evaluateOpenNow({ thu: [], sat: [] }, false, 'Africa/Cairo', fridayEvening),
    ).toMatchObject({
      state: 'unknown',
      reason: 'unknown_day',
    });
    const closedFriday = { ...week([['08:00', '20:00']]), fri: [] };
    const r = evaluateOpenNow(closedFriday, false, 'Africa/Cairo', fridayEvening);
    expect(r).toMatchObject({ state: 'closed', reason: 'schedule' });
    // Next opening: Saturday 08:00 Cairo = 05:00 UTC.
    expect(r.opensAt).toBe('2026-09-26T05:00:00.000Z');
  });

  it('a past-midnight window of the previous day keeps the station open', () => {
    const h = { ...week([['18:00', '02:00']]) };
    // Saturday 00:30 Cairo (Friday 21:30 UTC).
    const r = evaluateOpenNow(h, false, 'Africa/Cairo', new Date('2026-09-25T21:30:00Z'));
    expect(r).toMatchObject({ state: 'open', localTime: '00:30' });
    expect(r.closesAt).toBe('2026-09-25T23:00:00.000Z');
  });

  it('merges a window ending at 24:00 with the next day starting at 00:00', () => {
    const h = week([
      ['00:00', '01:00'],
      ['20:00', '24:00'],
    ]);
    const r = evaluateOpenNow(h, false, 'Asia/Dubai', new Date('2026-09-25T19:00:00Z')); // 23:00 Dubai
    expect(r.state).toBe('open');
    expect(r.closesAt).toBe('2026-09-25T21:00:00.000Z'); // 01:00 Dubai next day
  });

  it('an invalid schedule is treated as unknown, never as open', () => {
    expect(
      evaluateOpenNow({ mon: [['x', 'y']] } as unknown as OpeningHours, false, 'UTC', fridayEvening)
        .state,
    ).toBe('unknown');
  });

  it('weeklyView keeps unknown (null) apart from closed ([])', () => {
    const view = weeklyView({ mon: [['08:00', '22:00']], fri: [] });
    expect(view?.find((d) => d.day === 'mon')?.windows).toEqual([{ start: '08:00', end: '22:00' }]);
    expect(view?.find((d) => d.day === 'fri')?.windows).toEqual([]);
    expect(view?.find((d) => d.day === 'sun')?.windows).toBeNull();
    expect(weeklyView(null)).toBeNull();
  });
});
