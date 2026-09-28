/**
 * Helpers of the community-* e2e specs. Synthetic test data only (no
 * seeded reviews: REQUIREMENTS §15 forbids showing demo reviews as real).
 */
import { randomBytes } from 'node:crypto';
import { bearer, createAndLogin, type LoggedIn } from './auth-test-helpers';
import { createVariantWithInlets } from './stations-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

export const DAY_MS = 86_400_000;

export async function communityApp(): Promise<TestApp> {
  // Per-IP route throttles are covered elsewhere; these specs assert the per-user limits.
  return createTestApp({ env: { RATE_LIMIT_MULTIPLIER: '1000' } });
}

export interface Member extends LoggedIn {
  auth: { Authorization: string };
}

/** A signed-in user; `established` = account older than the new-account period. */
export async function member(
  t: TestApp,
  opts: { roles?: string[]; established?: boolean; verified?: boolean } = {},
): Promise<Member> {
  const u = await createAndLogin(t, opts.roles ?? ['user']);
  if (opts.established !== false) {
    await t.prisma.user.update({
      where: { id: u.userId },
      data: { createdAt: new Date(Date.now() - 30 * DAY_MS) },
    });
  }
  if (opts.verified === false) {
    await t.prisma.user.update({ where: { id: u.userId }, data: { emailVerifiedAt: null } });
  }
  return { ...u, auth: bearer(u.accessToken) };
}

/** A published synthetic variant (+ its model id). */
export async function testVariant(t: TestApp): Promise<{ variantId: string; modelId: string }> {
  const variantId = await createVariantWithInlets(t, 'EG', []);
  const v = await t.prisma.vehicleVariant.findUniqueOrThrow({
    where: { id: variantId },
    select: { modelYear: { select: { generation: { select: { modelId: true } } } } },
  });
  return { variantId, modelId: v.modelYear.generation.modelId };
}

let n = 0;
/** Unique review text (duplicate detection compares normalized text). */
export function reviewText(prefix = 'Synthetic test review'): string {
  n += 1;
  return `${prefix} ${n} ${randomBytes(4).toString('hex')}: charging at home overnight works well for daily trips.`;
}

export function uniqueText(prefix = 'Test comment'): string {
  n += 1;
  return `${prefix} ${n} ${randomBytes(4).toString('hex')}`;
}

/** Approves a pending item through the admin API. */
export async function moderate(
  t: TestApp,
  moderator: Member,
  collection: 'reviews' | 'comments' | 'questions' | 'answers',
  id: string,
  action: 'approve' | 'reject' | 'hide' | 'restore' | 'delete',
  reason?: string,
): Promise<void> {
  await t
    .http()
    .post(`/api/v1/admin/community/${collection}/${id}/moderate`)
    .set(moderator.auth)
    .send({ action, ...(reason ? { reason } : {}) })
    .expect(200);
}
