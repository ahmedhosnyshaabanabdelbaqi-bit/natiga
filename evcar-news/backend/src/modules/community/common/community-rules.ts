/**
 * Pure anti-spam / policy rules of the community area (REQUIREMENTS §15:
 * "البلاغ والحظر والمراجعة ومقاومة السبام"). No I/O here so the rules are
 * unit-tested directly; CommunityGuardService applies them.
 */

export type ContentKind = 'review' | 'comment' | 'question' | 'answer';
export type WriteKind = ContentKind | 'report' | 'vote';

export interface RateRule {
  /** Sliding window length. */
  windowMs: number;
  /** Max writes in the window for an established account. */
  max: number;
  /** Max writes in the window while the account is "new". */
  newAccountMax: number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * Per-user limits (checked in the service, on top of the per-IP route
 * throttles). Several rules per kind: all must pass.
 */
export const RATE_RULES: Record<WriteKind, RateRule[]> = {
  review: [{ windowMs: DAY, max: 5, newAccountMax: 1 }],
  comment: [
    { windowMs: 10 * MIN, max: 10, newAccountMax: 3 },
    { windowMs: DAY, max: 100, newAccountMax: 15 },
  ],
  question: [
    { windowMs: HOUR, max: 5, newAccountMax: 1 },
    { windowMs: DAY, max: 20, newAccountMax: 3 },
  ],
  answer: [
    { windowMs: 10 * MIN, max: 10, newAccountMax: 3 },
    { windowMs: DAY, max: 60, newAccountMax: 10 },
  ],
  report: [{ windowMs: DAY, max: 30, newAccountMax: 10 }],
  vote: [{ windowMs: HOUR, max: 300, newAccountMax: 60 }],
};

export const COMMUNITY_POLICY = {
  /** An account younger than this is "new": stricter limits, no links, pre-moderation. */
  newAccountMs: 3 * DAY,
  /** Max links per text for established accounts (new accounts: 0). */
  maxLinks: 2,
  /** Same author + same normalized text within this window → 409. */
  duplicateWindowMs: 7 * DAY,
  /** Same normalized text by other authors within this window → held for review. */
  crossUserDuplicateWindowMs: DAY,
  /** Cross-user duplicates only count for texts at least this long (short "thanks" is fine). */
  crossUserDuplicateMinLength: 40,
  /** Distinct open reports that send published content back to the review queue. */
  autoHoldReports: 3,
  /** Reviews always wait for a moderator before they are public. */
  premoderateReviews: true,
} as const;

/** Signal weights (spam_signals.score, 0..100). */
export const SIGNAL_SCORES = {
  rate_limited: 30,
  duplicate_content: 40,
  link_spam: 20,
  new_account: 10,
  user_reports: 30,
} as const;

// Scheme URLs, www., and bare domains with a common TLD (e.g. "example.com/x").
const LINK_RE =
  /\b(?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9-]{2,63}\.(?:com|net|org|info|biz|io|co|me|ly|xyz|top|site|online|shop|app|link|click|ru|cn|sa|eg|ae)\b(?:\/[^\s]*)?/gi;

/** Number of links (URLs or bare domains) in a text. */
export function countLinks(text: string | null | undefined): number {
  if (!text) return 0;
  return text.match(LINK_RE)?.length ?? 0;
}

export function isNewAccount(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() < COMMUNITY_POLICY.newAccountMs;
}

export function maxLinksFor(newAccount: boolean): number {
  return newAccount ? 0 : COMMUNITY_POLICY.maxLinks;
}

export interface RateCheck {
  ok: boolean;
  /** Seconds until the oldest write of the violated window leaves it. */
  retryAfterSeconds: number;
  rule?: RateRule;
}

/**
 * Checks recent write timestamps (any order) against the rules of `kind`.
 * `recent` should cover the longest window of the kind.
 */
export function checkRate(
  kind: WriteKind,
  recent: Date[],
  now: Date,
  newAccount: boolean,
): RateCheck {
  const t = now.getTime();
  for (const rule of RATE_RULES[kind]) {
    const limit = newAccount ? rule.newAccountMax : rule.max;
    const inWindow = recent
      .map((d) => d.getTime())
      .filter((x) => x > t - rule.windowMs)
      .sort((a, b) => a - b);
    if (inWindow.length >= limit) {
      // The (n - limit + 1)-th oldest must leave the window before one more fits.
      const oldest = inWindow[inWindow.length - limit];
      return { ok: false, retryAfterSeconds: (oldest + rule.windowMs - t) / 1000, rule };
    }
  }
  return { ok: true, retryAfterSeconds: 0 };
}

export function longestWindowMs(kind: WriteKind): number {
  return Math.max(...RATE_RULES[kind].map((r) => r.windowMs));
}

export type HoldReason = 'new_account' | 'links' | 'cross_user_duplicate' | 'premoderation';

/**
 * Initial moderation status of a new / edited post. Anything suspicious
 * waits for a moderator instead of being rejected outright (false positives
 * stay recoverable).
 */
export function initialStatus(
  kind: ContentKind,
  reasons: HoldReason[],
): { status: 'approved' | 'pending'; holdReasons: HoldReason[] } {
  const all = [...reasons];
  if (kind === 'review' && COMMUNITY_POLICY.premoderateReviews) all.push('premoderation');
  return { status: all.length ? 'pending' : 'approved', holdReasons: all };
}

/**
 * Multi-line user text: removes control / zero-width / bidi override
 * characters (keeps line breaks), trims each line, collapses 3+ blank lines.
 */
export function cleanMultiline(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return (
    value
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0009\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
      .split('\n')
      .map((l) => l.replace(/[ \t\u00A0]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/** Short plain-text excerpt for moderation queues. */
export function excerpt(text: string | null | undefined, max = 160): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}
