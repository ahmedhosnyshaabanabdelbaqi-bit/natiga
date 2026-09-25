/**
 * Access token lives in memory only (never localStorage) per the web auth
 * contract; the refresh token is an httpOnly cookie the JS cannot read.
 */
let accessToken: string | null = null;
let expiresAt = 0;

/** Refresh proactively when the token has less than this many ms left. */
const EXPIRY_SKEW_MS = 15_000;

export const tokenStore = {
  get(): string | null {
    return accessToken;
  },
  set(token: string, expiresInSeconds: number, now: number = Date.now()): void {
    accessToken = token;
    expiresAt = now + Math.max(0, expiresInSeconds) * 1000;
  },
  clear(): void {
    accessToken = null;
    expiresAt = 0;
  },
  /** True when we hold a token that is (almost) expired. */
  isExpired(now: number = Date.now()): boolean {
    return accessToken !== null && now >= expiresAt - EXPIRY_SKEW_MS;
  },
};
