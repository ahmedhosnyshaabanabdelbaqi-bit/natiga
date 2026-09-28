import {
  checkRate,
  cleanMultiline,
  COMMUNITY_POLICY,
  countLinks,
  excerpt,
  initialStatus,
  isNewAccount,
  longestWindowMs,
  maxLinksFor,
  RATE_RULES,
} from './community-rules';

const NOW = new Date('2026-09-25T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;

describe('community rules', () => {
  describe('countLinks', () => {
    it('counts scheme URLs, www. and bare domains', () => {
      expect(countLinks(null)).toBe(0);
      expect(countLinks('no links here, just 3.5 kWh and 4.2km')).toBe(0);
      expect(countLinks('see https://example.com/a and www.test.org')).toBe(2);
      expect(countLinks('buy at cheap-parts.shop/now or spam.xyz')).toBe(2);
      expect(countLinks('رابط http://مثال.com هنا')).toBe(1);
    });

    it('does not count decimals or version numbers', () => {
      expect(countLinks('Range 450.5 km, firmware 2.3.1')).toBe(0);
    });
  });

  describe('new accounts', () => {
    it('are younger than the policy age', () => {
      expect(isNewAccount(ago(COMMUNITY_POLICY.newAccountMs - 1000), NOW)).toBe(true);
      expect(isNewAccount(ago(COMMUNITY_POLICY.newAccountMs + 1000), NOW)).toBe(false);
    });
    it('may not post links', () => {
      expect(maxLinksFor(true)).toBe(0);
      expect(maxLinksFor(false)).toBe(COMMUNITY_POLICY.maxLinks);
    });
  });

  describe('checkRate', () => {
    it('passes under the limit and fails at it with a retry time', () => {
      const rule = RATE_RULES.comment[0];
      const recent = Array.from({ length: rule.max - 1 }, (_, i) => ago((i + 1) * 1000));
      expect(checkRate('comment', recent, NOW, false).ok).toBe(true);
      const full = [...recent, ago(9 * MIN)];
      const res = checkRate('comment', full, NOW, false);
      expect(res.ok).toBe(false);
      // The oldest write (9 min ago) leaves the 10-minute window in ~60 s.
      expect(res.retryAfterSeconds).toBeCloseTo(60, 0);
    });

    it('uses the stricter limit for new accounts', () => {
      const rule = RATE_RULES.comment[0];
      const recent = Array.from({ length: rule.newAccountMax }, (_, i) => ago((i + 1) * 1000));
      expect(checkRate('comment', recent, NOW, false).ok).toBe(true);
      expect(checkRate('comment', recent, NOW, true).ok).toBe(false);
    });

    it('ignores writes outside the windows', () => {
      const old = Array.from({ length: 500 }, () => ago(longestWindowMs('comment') + MIN));
      expect(checkRate('comment', old, NOW, true).ok).toBe(true);
    });

    it('checks every window of a kind (daily cap)', () => {
      const daily = RATE_RULES.question[1];
      // Spread over the day so the hourly rule passes.
      const recent = Array.from({ length: daily.max }, (_, i) => ago((i + 1) * 61 * MIN));
      expect(checkRate('question', recent.slice(1), NOW, false).ok).toBe(true);
      const res = checkRate('question', recent, NOW, false);
      expect(res.ok).toBe(false);
      expect(res.rule).toBe(daily);
    });
  });

  describe('initialStatus', () => {
    it('reviews always wait for a moderator', () => {
      expect(initialStatus('review', [])).toEqual({
        status: 'pending',
        holdReasons: ['premoderation'],
      });
    });
    it('clean comments are published, suspicious ones held', () => {
      expect(initialStatus('comment', []).status).toBe('approved');
      expect(initialStatus('comment', ['links']).status).toBe('pending');
      expect(initialStatus('answer', ['new_account']).holdReasons).toEqual(['new_account']);
    });
  });

  describe('text helpers', () => {
    it('cleanMultiline keeps line breaks and strips control / bidi characters', () => {
      expect(cleanMultiline('  a\u0000b \r\n\r\n\r\n\r\n c\u202E  d  ')).toBe('ab\n\nc d');
      expect(cleanMultiline(5)).toBe(5);
    });
    it('excerpt shortens long text', () => {
      expect(excerpt(null)).toBeNull();
      expect(excerpt('short')).toBe('short');
      const long = excerpt('x'.repeat(500), 20)!;
      expect(long).toHaveLength(20);
      expect(long.endsWith('…')).toBe(true);
    });
  });
});
