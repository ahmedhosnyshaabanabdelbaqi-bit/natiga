/**
 * Community moderation (REQUIREMENTS §15): server-side permissions of the
 * admin API, anti-spam (per-user rate limits, link limits, duplicates,
 * new-account throttling), user reports (+ automatic hold), moderator
 * blocks ("ban") and the verified-owner flow (no badge without a real,
 * staff-approved verification). Synthetic data only.
 */
import { randomBytes } from 'node:crypto';
import { STORAGE_PROVIDER } from '../src/providers/provider-tokens';
import type { StorageProvider } from '../src/providers/storage/storage.types';
import { RATE_RULES } from '../src/modules/community/common/community-rules';
import {
  communityApp,
  DAY_MS,
  member,
  moderate,
  type Member,
  reviewText,
  testVariant,
  uniqueText,
} from './community-helpers';
import type { TestApp } from './utils/test-app';
import { orderedSteps } from './utils/ordered-steps';

describe('Community moderation (e2e)', () => {
  let t: TestApp;
  let alice: Member;
  let bob: Member;
  let carol: Member;
  let dave: Member;
  let mod: Member;
  let car: { variantId: string; modelId: string };

  const comment = (who: Member, body: string, targetId = car.variantId) =>
    t.http().post('/api/v1/comments').set(who.auth).send({ targetType: 'variant', targetId, body });

  beforeAll(async () => {
    t = await communityApp();
    [alice, bob, carol, dave, mod] = await Promise.all([
      member(t),
      member(t),
      member(t),
      member(t),
      member(t, { roles: ['community_moderator'] }),
    ]);
    car = await testVariant(t);
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('permissions (server-side)', () => {
    const { step, run } = orderedSteps();
    let pendingReviewId: string;

    beforeAll(async () => {
      const res = await t
        .http()
        .post('/api/v1/community/reviews')
        .set(alice.auth)
        .send({ variantId: car.variantId, rating: 3, body: reviewText() })
        .expect(201);
      pendingReviewId = res.body.data.id;
    });

    step('guests 401, plain users / editors / station managers 403', async () => {
      await t.http().get('/api/v1/admin/community/reviews').expect(401);
      const editor = await member(t, { roles: ['editor'] });
      const stations = await member(t, { roles: ['station_manager'] });
      for (const who of [alice, editor, stations]) {
        await t.http().get('/api/v1/admin/community/reviews').set(who.auth).expect(403);
        await t.http().get('/api/v1/admin/community/owner-verifications').set(who.auth).expect(403);
        await t
          .http()
          .post(`/api/v1/admin/community/reviews/${pendingReviewId}/moderate`)
          .set(who.auth)
          .send({ action: 'approve' })
          .expect(403);
        await t
          .http()
          .post(`/api/v1/admin/community/users/${bob.userId}/block`)
          .set(who.auth)
          .send({ reason: 'Test' })
          .expect(403);
      }
    });

    step(
      'community_moderator sees the queue and moderates (moderation_actions + audit log)',
      async () => {
        const queue = await t
          .http()
          .get('/api/v1/admin/community/reviews')
          .set(mod.auth)
          .expect(200);
        expect(queue.body.data.map((i: { id: string }) => i.id)).toContain(pendingReviewId);
        const overview = await t
          .http()
          .get('/api/v1/admin/community/overview')
          .set(mod.auth)
          .expect(200);
        expect(overview.body.data.pending.review).toBeGreaterThanOrEqual(1);
        await t.http().get('/api/v1/admin/community/unknown').set(mod.auth).expect(404);

        const res = await t
          .http()
          .post(`/api/v1/admin/community/reviews/${pendingReviewId}/moderate`)
          .set(mod.auth)
          .send({ action: 'reject', reason: 'Test rejection' })
          .expect(200);
        expect(res.body.data).toMatchObject({ status: 'rejected' });
        expect(res.body.data.history[0]).toMatchObject({
          action: 'reject',
          reason: 'Test rejection',
        });
        const audit = await t.prisma.auditLog.findFirst({
          where: { actorId: mod.userId, entityId: pendingReviewId },
        });
        expect(audit).not.toBeNull();
        // Invalid transition: a rejected item cannot be "approved" (use restore).
        const bad = await t
          .http()
          .post(`/api/v1/admin/community/reviews/${pendingReviewId}/moderate`)
          .set(mod.auth)
          .send({ action: 'approve' })
          .expect(409);
        expect(bad.body.error.code).toBe('COMMUNITY_INVALID_TRANSITION');
      },
    );

    step('deleted content can only be seen / restored by moderators', async () => {
      await moderate(t, mod, 'reviews', pendingReviewId, 'delete');
      await t
        .http()
        .get(`/api/v1/community/reviews/${pendingReviewId}`)
        .set(alice.auth)
        .expect(404);
      const staff = await t
        .http()
        .get(`/api/v1/admin/community/reviews/${pendingReviewId}`)
        .set(mod.auth)
        .expect(200);
      expect(staff.body.data.deletedAt).not.toBeNull();
      await moderate(t, mod, 'reviews', pendingReviewId, 'restore');
      const back = await t.http().get(`/api/v1/community/reviews/${pendingReviewId}`).expect(200);
      expect(back.body.data.status).toBe('approved');
    });
    it('workflow: the steps above, in order', () => run(), run.timeout);
  });

  describe('anti-spam', () => {
    it('new accounts: no links, posts held for review, stricter rate limit (429 + Retry-After)', async () => {
      const newbie = await member(t, { established: false });
      const link = await comment(newbie, 'visit www.example.com now').expect(422);
      expect(link.body.error.details[0].constraints).toHaveProperty('maxLinks');

      const limit = RATE_RULES.comment[0].newAccountMax;
      for (let i = 0; i < limit; i++) {
        const ok = await comment(newbie, uniqueText('Newbie')).expect(201);
        expect(ok.body.data.status).toBe('pending');
      }
      const res = await comment(newbie, uniqueText('Newbie')).expect(429);
      expect(res.body.error.code).toBe('COMMUNITY_RATE_LIMITED');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      expect(res.body.error.details).toMatchObject({ kind: 'comment', newAccount: true });
      const signal = await t.prisma.spamSignal.findFirst({
        where: { userId: newbie.userId, signal: 'rate_limited' },
      });
      expect(signal).not.toBeNull();
      // Nothing of the new account is public yet.
      const list = await t
        .http()
        .get(`/api/v1/comments?targetType=variant&targetId=${car.variantId}`)
        .expect(200);
      expect(
        list.body.data.some((c: { author: { id: string } }) => c.author.id === newbie.userId),
      ).toBe(false);
    });

    it('established accounts: at most 2 links; the same text twice → 409', async () => {
      await comment(
        alice,
        'a https://a.example.com b https://b.example.com c www.c.example.org',
      ).expect(422);
      const text = uniqueText('Same text');
      await comment(alice, text).expect(201);
      const dup = await comment(alice, `  ${text.toUpperCase()}  `).expect(409);
      expect(dup.body.error.code).toBe('COMMUNITY_DUPLICATE_CONTENT');
    });

    it('long text copied by another account is held for review', async () => {
      const text = `${uniqueText('Copy paste campaign')} — the same long promotional sentence repeated.`;
      expect((await comment(bob, text).expect(201)).body.data.status).toBe('approved');
      const copy = await comment(carol, text).expect(201);
      expect(copy.body.data.status).toBe('pending');
    });
  });

  describe('reports', () => {
    const { step, run } = orderedSteps();
    let target: string;

    beforeAll(async () => {
      target = (await comment(dave, uniqueText('Reported comment')).expect(201)).body.data.id;
    });

    step('validates reporter, reason details and duplicates', async () => {
      const url = '/api/v1/community/reports';
      await t
        .http()
        .post(url)
        .send({ targetType: 'comment', targetId: target, reason: 'spam' })
        .expect(401);
      const self = await t
        .http()
        .post(url)
        .set(dave.auth)
        .send({ targetType: 'comment', targetId: target, reason: 'spam' })
        .expect(422);
      expect(self.body.error.code).toBe('COMMUNITY_SELF_REPORT');
      await t
        .http()
        .post(url)
        .set(alice.auth)
        .send({ targetType: 'comment', targetId: target, reason: 'other' })
        .expect(422);
      const res = await t
        .http()
        .post(`${url}?lang=en`)
        .set(alice.auth)
        .send({ targetType: 'comment', targetId: target, reason: 'spam' })
        .expect(201);
      expect(res.body.data).toMatchObject({ reason: 'spam', status: 'open' });
      expect(res.body.data.reasonLabel).toBeTruthy();
      const dup = await t
        .http()
        .post(url)
        .set(alice.auth)
        .send({ targetType: 'comment', targetId: target, reason: 'abuse' })
        .expect(409);
      expect(dup.body.error.code).toBe('COMMUNITY_REPORT_DUPLICATE');
      await t
        .http()
        .post(url)
        .set(alice.auth)
        .send({
          targetType: 'user',
          targetId: dave.userId,
          reason: 'abuse',
          details: 'Test abuse details',
        })
        .expect(201);
    });

    step(
      'three distinct reports hold the content; a moderator restore dismisses the reports',
      async () => {
        await t
          .http()
          .post('/api/v1/community/reports')
          .set(bob.auth)
          .send({ targetType: 'comment', targetId: target, reason: 'abuse' })
          .expect(201);
        await t.http().get(`/api/v1/comments/${target}`).expect(200);
        await t
          .http()
          .post('/api/v1/community/reports')
          .set(carol.auth)
          .send({ targetType: 'comment', targetId: target, reason: 'off_topic' })
          .expect(201);
        await t.http().get(`/api/v1/comments/${target}`).expect(404);

        const queue = await t
          .http()
          .get('/api/v1/admin/community/comments?reported=true')
          .set(mod.auth)
          .expect(200);
        expect(queue.body.data).toContainEqual(
          expect.objectContaining({ id: target, openReports: 3 }),
        );
        const reports = await t
          .http()
          .get(`/api/v1/admin/community/reports?targetId=${target}`)
          .set(mod.auth)
          .expect(200);
        expect(reports.body.meta.total).toBe(3);
        expect(reports.body.data[0].target).toMatchObject({ status: 'pending' });

        await moderate(t, mod, 'comments', target, 'approve', 'Test: reports not upheld');
        await t.http().get(`/api/v1/comments/${target}`).expect(200);
        const closed = await t.prisma.contentReport.findMany({ where: { targetId: target } });
        expect(closed.every((r) => r.status === 'rejected' && r.handledById === mod.userId)).toBe(
          true,
        );
        const mine = await t.http().get('/api/v1/me/community/reports').set(alice.auth).expect(200);
        expect(mine.body.data).toContainEqual(
          expect.objectContaining({ targetId: target, status: 'rejected' }),
        );
      },
    );
    it('workflow: the steps above, in order', () => run(), run.timeout);
  });

  describe('blocks ("ban")', () => {
    const { step, run } = orderedSteps();
    let spammer: Member;
    let postId: string;

    beforeAll(async () => {
      spammer = await member(t);
      postId = (await comment(spammer, uniqueText('Before block')).expect(201)).body.data.id;
    });

    step('moderators cannot block owners / admins / themselves', async () => {
      const owner = await member(t, { roles: ['owner'] });
      for (const id of [owner.userId, mod.userId]) {
        const res = await t
          .http()
          .post(`/api/v1/admin/community/users/${id}/block`)
          .set(mod.auth)
          .send({ reason: 'Test' })
          .expect(403);
        expect(res.body.error.code).toBe('COMMUNITY_CANNOT_BLOCK_STAFF');
      }
    });

    step('a blocked user cannot post, vote or report; hideContent hides their posts', async () => {
      const res = await t
        .http()
        .post(`/api/v1/admin/community/users/${spammer.userId}/block`)
        .set(mod.auth)
        .send({ reason: 'Test spam block', hideContent: true })
        .expect(201);
      expect(res.body.data).toMatchObject({ scope: 'community', active: true, hiddenPosts: 1 });
      await t
        .http()
        .post(`/api/v1/admin/community/users/${spammer.userId}/block`)
        .set(mod.auth)
        .send({ reason: 'Again' })
        .expect(409);

      const post = await comment(spammer, uniqueText('After block')).expect(403);
      expect(post.body.error.code).toBe('COMMUNITY_USER_BLOCKED');
      expect(post.body.error.details).toMatchObject({
        scope: 'community',
        reason: 'Test spam block',
      });
      const answerTarget = (await comment(alice, uniqueText('Vote me')).expect(201)).body.data.id;
      await t
        .http()
        .post('/api/v1/community/votes')
        .set(spammer.auth)
        .send({ targetType: 'comment', targetId: answerTarget, value: 1 })
        .expect(403);
      await t
        .http()
        .post('/api/v1/community/reports')
        .set(spammer.auth)
        .send({ targetType: 'comment', targetId: answerTarget, reason: 'spam' })
        .expect(403);
      await t.http().get(`/api/v1/comments/${postId}`).expect(404);
      const status = await t
        .http()
        .get('/api/v1/me/community/status')
        .set(spammer.auth)
        .expect(200);
      expect(status.body.data).toMatchObject({ canPost: false, block: { scope: 'community' } });

      const overview = await t
        .http()
        .get(`/api/v1/admin/community/users/${spammer.userId}`)
        .set(mod.auth)
        .expect(200);
      expect(overview.body.data.blocks[0]).toMatchObject({ active: true });
      expect(overview.body.data.history[0]).toMatchObject({ action: 'block_user' });
    });

    step('unblock restores posting (hidden posts stay hidden until restored)', async () => {
      await t
        .http()
        .post(`/api/v1/admin/community/users/${spammer.userId}/unblock`)
        .set(mod.auth)
        .send({ reason: 'Test unblock' })
        .expect(200);
      await comment(spammer, uniqueText('After unblock')).expect(201);
      await t.http().get(`/api/v1/comments/${postId}`).expect(404);
    });

    step('an expired block no longer applies and does not prevent a new block', async () => {
      const temp = await t
        .http()
        .post(`/api/v1/admin/community/users/${spammer.userId}/block`)
        .set(mod.auth)
        .send({ reason: 'Short block', expiresAt: new Date(Date.now() + 60_000).toISOString() })
        .expect(201);
      await comment(spammer, uniqueText('During')).expect(403);
      await t.prisma.userBlock.update({
        where: { id: temp.body.data.id },
        data: {
          createdAt: new Date(Date.now() - 2 * DAY_MS),
          expiresAt: new Date(Date.now() - DAY_MS),
        },
      });
      await comment(spammer, uniqueText('After expiry')).expect(201);
      await t
        .http()
        .post(`/api/v1/admin/community/users/${spammer.userId}/block`)
        .set(mod.auth)
        .send({ reason: 'New block' })
        .expect(201);
      const blocks = await t
        .http()
        .get(`/api/v1/admin/community/blocks?userId=${spammer.userId}&active=false`)
        .set(mod.auth)
        .expect(200);
      expect(blocks.body.meta.total).toBe(3);
    });

    step('warnings are recorded in the user history', async () => {
      await t
        .http()
        .post(`/api/v1/admin/community/users/${dave.userId}/warn`)
        .set(mod.auth)
        .send({ reason: 'Test warning' })
        .expect(201);
      const o = await t
        .http()
        .get(`/api/v1/admin/community/users/${dave.userId}`)
        .set(mod.auth)
        .expect(200);
      expect(o.body.data.history[0]).toMatchObject({ action: 'warn_user', reason: 'Test warning' });
    });
    it('workflow: the steps above, in order', () => run(), run.timeout);
  });

  describe('verified owner flow', () => {
    const { step, run } = orderedSteps();
    let owner: Member;
    let reviewId: string;
    let verificationId: string;

    beforeAll(async () => {
      owner = await member(t);
      const r = await t
        .http()
        .post('/api/v1/community/reviews')
        .set(owner.auth)
        .send({ variantId: car.variantId, rating: 5, body: reviewText('Owner review') })
        .expect(201);
      reviewId = r.body.data.id;
      await moderate(t, mod, 'reviews', reviewId, 'approve');
    });

    const badge = async () =>
      (await t.http().get(`/api/v1/community/reviews/${reviewId}?lang=ar`).expect(200)).body
        .data as {
        verifiedOwner: boolean;
        verifiedOwnerLabel: string | null;
      };

    step(
      'a request alone gives no badge; document review cannot be approved without a document',
      async () => {
        const res = await t
          .http()
          .post('/api/v1/me/owner-verifications')
          .set(owner.auth)
          .send({ variantId: car.variantId, method: 'document_review' })
          .expect(201);
        verificationId = res.body.data.id;
        expect(res.body.data).toMatchObject({ status: 'pending', hasEvidence: false });
        expect((await badge()).verifiedOwner).toBe(false);
        await t
          .http()
          .post('/api/v1/me/owner-verifications')
          .set(owner.auth)
          .send({ variantId: car.variantId, method: 'dealer_confirmation' })
          .expect(409);
        // Users cannot approve (403); staff cannot approve a document review without evidence (422).
        await t
          .http()
          .post(`/api/v1/admin/community/owner-verifications/${verificationId}/approve`)
          .set(owner.auth)
          .send({})
          .expect(403);
        const noDoc = await t
          .http()
          .post(`/api/v1/admin/community/owner-verifications/${verificationId}/approve`)
          .set(mod.auth)
          .send({})
          .expect(422);
        expect(noDoc.body.error.code).toBe('OWNER_VERIFICATION_NO_EVIDENCE');
        await t
          .http()
          .delete(`/api/v1/me/owner-verifications/${verificationId}`)
          .set(owner.auth)
          .expect(204);
      },
    );

    step('evidence must be the user’s own owner_evidence upload', async () => {
      const res = await t
        .http()
        .post('/api/v1/me/owner-verifications')
        .set(owner.auth)
        .send({ variantId: car.variantId, method: 'document_review', evidenceAssetId: reviewId })
        .expect(422);
      expect(res.body.error.details[0].field).toBe('evidenceAssetId');
    });

    step('approval with a document attaches the badge; the evidence file is deleted', async () => {
      const storage = t.app.get<StorageProvider>(STORAGE_PROVIDER);
      const key = `private/test-evidence/${randomBytes(6).toString('hex')}.jpg`;
      await storage.put(key, Buffer.from('synthetic test evidence'));
      const asset = await t.prisma.mediaAsset.create({
        data: {
          kind: 'document',
          status: 'ready',
          storageDriver: storage.driver,
          storageKey: key,
          mimeType: 'image/jpeg',
          uploadedById: owner.userId,
        },
      });
      await t.prisma.uploadSession.create({
        data: {
          userId: owner.userId,
          kind: 'document',
          purpose: 'owner_evidence',
          filename: 'evidence.jpg',
          totalBytes: 23,
          receivedBytes: 23,
          tempKey: `tmp/test-evidence/${asset.id}`,
          status: 'completed',
          assetId: asset.id,
          expiresAt: new Date(Date.now() + DAY_MS),
        },
      });
      const req = await t
        .http()
        .post('/api/v1/me/owner-verifications')
        .set(owner.auth)
        .send({ variantId: car.variantId, method: 'document_review', evidenceAssetId: asset.id })
        .expect(201);
      verificationId = req.body.data.id;
      expect(req.body.data.hasEvidence).toBe(true);

      const detail = await t
        .http()
        .get(`/api/v1/admin/community/owner-verifications/${verificationId}`)
        .set(mod.auth)
        .expect(200);
      expect(detail.body.data.evidence).toMatchObject({ assetId: asset.id, available: true });
      expect(typeof detail.body.data.evidence.url).toBe('string');

      const ok = await t
        .http()
        .post(`/api/v1/admin/community/owner-verifications/${verificationId}/approve`)
        .set(mod.auth)
        .send({ decisionNote: 'Test: registration document matched' })
        .expect(200);
      expect(ok.body.data).toMatchObject({ status: 'approved', linkedReviews: 1 });
      expect(ok.body.data.evidenceDeletedAt).not.toBeNull();
      expect(await storage.exists(key)).toBe(false);
      expect(
        (await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).deletedAt,
      ).not.toBeNull();

      expect(await badge()).toMatchObject({
        verifiedOwner: true,
        verifiedOwnerLabel: 'مالك موثّق',
      });
      const verifiedOnly = await t
        .http()
        .get(`/api/v1/community/reviews?variantId=${car.variantId}&verifiedOnly=true`)
        .expect(200);
      expect(verifiedOnly.body.data.map((r: { id: string }) => r.id)).toEqual([reviewId]);
      const mine = await t.http().get('/api/v1/me/owner-verifications').set(owner.auth).expect(200);
      expect(mine.body.data[0]).toMatchObject({ status: 'approved', hasEvidence: false });
    });

    step('an expired verification no longer shows the badge', async () => {
      await t.prisma.ownerVerification.update({
        where: { id: verificationId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect((await badge()).verifiedOwner).toBe(false);
      await t.prisma.ownerVerification.update({
        where: { id: verificationId },
        data: { expiresAt: null },
      });
      expect((await badge()).verifiedOwner).toBe(true);
    });

    step('revoking removes the badge', async () => {
      await t
        .http()
        .post(`/api/v1/admin/community/owner-verifications/${verificationId}/revoke`)
        .set(mod.auth)
        .send({ decisionNote: 'Test: car sold' })
        .expect(200);
      expect(await badge()).toMatchObject({ verifiedOwner: false, verifiedOwnerLabel: null });
      const row = await t.prisma.review.findUniqueOrThrow({ where: { id: reviewId } });
      expect(row).toMatchObject({ isVerifiedOwner: false, ownerVerificationId: null });
    });

    step(
      'dealer confirmation needs a staff note; reject keeps the review without badge',
      async () => {
        const req = await t
          .http()
          .post('/api/v1/me/owner-verifications')
          .set(owner.auth)
          .send({ variantId: car.variantId, method: 'dealer_confirmation' })
          .expect(201);
        await t
          .http()
          .post(`/api/v1/admin/community/owner-verifications/${req.body.data.id}/approve`)
          .set(mod.auth)
          .send({})
          .expect(422);
        await t
          .http()
          .post(`/api/v1/admin/community/owner-verifications/${req.body.data.id}/reject`)
          .set(mod.auth)
          .send({ decisionNote: 'Test: dealer could not confirm' })
          .expect(200);
        expect((await badge()).verifiedOwner).toBe(false);
      },
    );
    it('workflow: the steps above, in order', () => run(), run.timeout);
  });
});
