/** Injectable clock so limits and expiry can be tested deterministically. */
export const COMMUNITY_CLOCK = 'COMMUNITY_CLOCK';

export interface CommunityClock {
  now(): Date;
}

export const systemClock: CommunityClock = { now: () => new Date() };
