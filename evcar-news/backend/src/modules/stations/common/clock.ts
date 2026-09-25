/**
 * Time source of the stations module ("open now", availability expiry,
 * community windows). Injected so e2e tests can evaluate opening hours at a
 * fixed instant: `builder.overrideProvider(STATIONS_CLOCK).useValue(clock)`.
 */
export const STATIONS_CLOCK = 'STATIONS_CLOCK';

export interface StationsClock {
  now(): Date;
}

export const systemClock: StationsClock = { now: () => new Date() };

/** Mutable clock for tests. */
export class FixedClock implements StationsClock {
  private fixed: Date | null;
  constructor(at: Date | null = null) {
    this.fixed = at;
  }
  set(at: Date | null): void {
    this.fixed = at;
  }
  now(): Date {
    return this.fixed ? new Date(this.fixed.getTime()) : new Date();
  }
}
