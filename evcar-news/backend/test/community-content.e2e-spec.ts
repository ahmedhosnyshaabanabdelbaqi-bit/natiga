/**
 * Community content (REQUIREMENTS §15): owner reviews with rating
 * dimensions, comments on articles / cars, Q&A, helpful votes, user mutes,
 * and the visibility rules (pending / hidden / deleted content is never
 * public; no verified-owner badge without an approved verification).
 * Synthetic data only.
 */
import { newsStaff, publishArticle } from './articles-helpers';
import {
  communityApp,
  member,
  moderate,
  type Member,
  reviewText,
  testVariant,
  uniqueText,
} from './community-helpers';
import type { TestApp } from './utils/test-app';
import { orderedSteps } from './utils/ordered-steps';

interface Review {
  id: string;
  status: string;
  verifiedOwner: boolean;
  verifiedOwnerLabel: string | null;
  isMine: boolean;
  ratings: { dimension: string; label: string; score: number }[];
  votes: { up: number; down: number; score: number; myVote: number | null };
}

describe('Community content (e2e)', () => {
  let t: TestApp;
  let alice: Member;
  let bob: Member;
  let carol: Member;
  let mod: Member;
  let car: { variantId: string; modelId: string };
  let otherCar: { variantId: string; modelId: string };

  beforeAll(async () => {
    t = await communityApp();
    [alice, bob, carol, mod] = await Promise.all([
      member(t),
      member(t),
      member(t),
      member(t, { roles: ['community_moderator'] }),
    ]);
    car = await testVariant(t);
    otherCar = await testVariant(t);
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('reviews', () => {
    const { step, run } = orderedSteps();
    let reviewId: string;

    step('guests cannot write (401); unverified e-mail → 403 EMAIL_NOT_VERIFIED', async () => {
      await t
        .http()
        .post('/api/v1/community/reviews')
        .send({ variantId: car.variantId, rating: 4, body: reviewText() })
        .expect(401);
      const unverified = await member(t, { verified: false });
      const res = await t
        .http()
        .post('/api/v1/community/reviews')
        .set(unverified.auth)
        .send({ variantId: car.variantId, rating: 4, body: reviewText() })
        .expect(403);
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    step('needs exactly one target and dimensions that fit it (422)', async () => {
      await t
        .http()
        .post('/api/v1/community/reviews')
        .set(alice.auth)
        .send({ rating: 4, body: reviewText() })
        .expect(422);
      const res = await t
        .http()
        .post('/api/v1/community/reviews')
        .set(alice.auth)
        .send({
          variantId: car.variantId,
          rating: 4,
          body: reviewText(),
          ratings: [{ dimension: 'station_price', score: 3 }],
        })
        .expect(422);
      expect(res.body.error.details[0].field).toBe('ratings');
    });

    step('a new review waits for moderation and carries no badge', async () => {
      const res = await t
        .http()
        .post('/api/v1/community/reviews?lang=en')
        .set(alice.auth)
        .send({
          variantId: car.variantId,
          rating: 4,
          title: 'Test title',
          body: reviewText(),
          pros: 'Quiet',
          ratings: [
            { dimension: 'charging', score: 5 },
            { dimension: 'comfort', score: 3 },
          ],
        })
        .expect(201);
      const r = res.body.data as Review;
      reviewId = r.id;
      expect(r).toMatchObject({
        status: 'pending',
        verifiedOwner: false,
        verifiedOwnerLabel: null,
        isMine: true,
      });
      expect(r.ratings.map((x) => x.dimension)).toEqual(['charging', 'comfort']);
      expect(r.ratings[0].label).toBe('Charging');
    });

    step('pending reviews are invisible publicly but visible to their author', async () => {
      const list = await t
        .http()
        .get(`/api/v1/community/reviews?variantId=${car.variantId}`)
        .expect(200);
      expect(list.body.data).toEqual([]);
      expect(list.body.meta.total).toBe(0);
      await t.http().get(`/api/v1/community/reviews/${reviewId}`).expect(404);
      await t.http().get(`/api/v1/community/reviews/${reviewId}`).set(bob.auth).expect(404);
      const own = await t
        .http()
        .get(`/api/v1/community/reviews/${reviewId}`)
        .set(alice.auth)
        .expect(200);
      expect(own.body.data.status).toBe('pending');
    });

    step('one review per user and variant (409 COMMUNITY_REVIEW_EXISTS)', async () => {
      const res = await t
        .http()
        .post('/api/v1/community/reviews')
        .set(alice.auth)
        .send({ variantId: car.variantId, rating: 2, body: reviewText() })
        .expect(409);
      expect(res.body.error.code).toBe('COMMUNITY_REVIEW_EXISTS');
      expect(res.body.error.details.existingId).toBe(reviewId);
    });

    step(
      'once approved it is listed and summarized (null averages when nothing is rated)',
      async () => {
        await moderate(t, mod, 'reviews', reviewId, 'approve');
        const list = await t
          .http()
          .get(`/api/v1/community/reviews?variantId=${car.variantId}&lang=ar`)
          .expect(200);
        expect(list.body.data).toHaveLength(1);
        expect(list.body.data[0]).toMatchObject({
          id: reviewId,
          status: 'approved',
          verifiedOwner: false,
        });
        expect(list.headers['cache-control']).toContain('public');

        const sum = await t
          .http()
          .get(`/api/v1/community/reviews/summary?variantId=${car.variantId}&lang=en`)
          .expect(200);
        expect(sum.body.data).toMatchObject({ count: 1, average: 4, verifiedOwnerCount: 0 });
        expect(sum.body.data.distribution).toContainEqual({ rating: 4, count: 1 });
        const dims = sum.body.data.dimensions as {
          dimension: string;
          average: number | null;
          count: number;
        }[];
        expect(dims.find((d) => d.dimension === 'charging')).toMatchObject({
          average: 5,
          count: 1,
        });
        expect(dims.find((d) => d.dimension === 'reliability')).toMatchObject({
          average: null,
          count: 0,
        });

        const empty = await t
          .http()
          .get(`/api/v1/community/reviews/summary?variantId=${otherCar.variantId}`)
          .expect(200);
        expect(empty.body.data).toMatchObject({ count: 0, average: null });
      },
    );

    step(
      'no verified-owner badge without an approved verification (API filter + DB rule)',
      async () => {
        const verified = await t
          .http()
          .get(`/api/v1/community/reviews?variantId=${car.variantId}&verifiedOnly=true`)
          .expect(200);
        expect(verified.body.data).toEqual([]);
        // The flag cannot be forced (the trigger keeps it equal to the link), and a
        // pending verification cannot back a badge.
        const forced = await t.prisma.review.update({
          where: { id: reviewId },
          data: { isVerifiedOwner: true },
        });
        expect(forced.isVerifiedOwner).toBe(false);
        const pending = await t.prisma.ownerVerification.create({
          data: { userId: alice.userId, variantId: car.variantId, method: 'document_review' },
        });
        await expect(
          t.prisma.review.update({
            where: { id: reviewId },
            data: { ownerVerificationId: pending.id },
          }),
        ).rejects.toThrow(/reviews_verified_owner_chk/);
        await t.prisma.ownerVerification.delete({ where: { id: pending.id } });
        // Clients cannot send the badge either (unknown field → 422).
        await t
          .http()
          .post('/api/v1/community/reviews')
          .set(bob.auth)
          .send({ variantId: car.variantId, rating: 5, body: reviewText(), isVerifiedOwner: true })
          .expect(422);
      },
    );

    step('editing sends the review back to moderation; deleting removes it', async () => {
      const res = await t
        .http()
        .patch(`/api/v1/community/reviews/${reviewId}`)
        .set(alice.auth)
        .send({ rating: 5, ratings: [{ dimension: 'range_real_world', score: 4 }] })
        .expect(200);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.ratings.map((x: { dimension: string }) => x.dimension)).toEqual([
        'range_real_world',
      ]);
      await t
        .http()
        .patch(`/api/v1/community/reviews/${reviewId}`)
        .set(bob.auth)
        .send({ rating: 1 })
        .expect(403);
      await moderate(t, mod, 'reviews', reviewId, 'approve');
    });
    it('workflow: the steps above, in order', () => run(), run.timeout);
  });

  describe('comments', () => {
    const { step, run } = orderedSteps();
    let article: { id: string };
    let commentId: string;

    beforeAll(async () => {
      article = await publishArticle(t, await newsStaff(t));
    });

    step('a clean comment by an established account is published at once', async () => {
      const res = await t
        .http()
        .post('/api/v1/comments')
        .set(alice.auth)
        .send({ targetType: 'article', targetId: article.id, body: uniqueText() })
        .expect(201);
      commentId = res.body.data.id;
      expect(res.body.data).toMatchObject({
        status: 'approved',
        target: { type: 'article', id: article.id },
        parentId: null,
      });
      const reply = await t
        .http()
        .post('/api/v1/comments')
        .set(bob.auth)
        .send({
          targetType: 'article',
          targetId: article.id,
          parentId: commentId,
          body: uniqueText('Reply'),
        })
        .expect(201);
      // A reply to a reply is attached to the thread root.
      const nested = await t
        .http()
        .post('/api/v1/comments')
        .set(carol.auth)
        .send({
          targetType: 'article',
          targetId: article.id,
          parentId: reply.body.data.id,
          body: uniqueText('Nested'),
        })
        .expect(201);
      expect(nested.body.data.parentId).toBe(commentId);

      const list = await t
        .http()
        .get(`/api/v1/comments?targetType=article&targetId=${article.id}`)
        .expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({ id: commentId, replyCount: 2 });
      expect(list.body.data[0].replies).toHaveLength(2);
    });

    step(
      'the reply must be on the same target; unpublished targets are refused (422)',
      async () => {
        await t
          .http()
          .post('/api/v1/comments')
          .set(bob.auth)
          .send({
            targetType: 'variant',
            targetId: car.variantId,
            parentId: commentId,
            body: uniqueText(),
          })
          .expect(422);
        await t.prisma.vehicleVariant.update({
          where: { id: otherCar.variantId },
          data: { status: 'draft' },
        });
        await t
          .http()
          .post('/api/v1/comments')
          .set(bob.auth)
          .send({ targetType: 'variant', targetId: otherCar.variantId, body: uniqueText() })
          .expect(422);
        await t.prisma.vehicleVariant.update({
          where: { id: otherCar.variantId },
          data: { status: 'published' },
        });
      },
    );

    step('articles with comments turned off → 409 COMMUNITY_COMMENTS_CLOSED', async () => {
      await t.prisma.article.update({ where: { id: article.id }, data: { allowComments: false } });
      const res = await t
        .http()
        .post('/api/v1/comments')
        .set(bob.auth)
        .send({ targetType: 'article', targetId: article.id, body: uniqueText() })
        .expect(409);
      expect(res.body.error.code).toBe('COMMUNITY_COMMENTS_CLOSED');
      await t.prisma.article.update({ where: { id: article.id }, data: { allowComments: true } });
    });

    step('comments on car model and variant pages', async () => {
      await t
        .http()
        .post('/api/v1/comments')
        .set(bob.auth)
        .send({ targetType: 'model', targetId: car.modelId, body: uniqueText('Model') })
        .expect(201);
      const list = await t
        .http()
        .get(`/api/v1/comments?targetType=model&targetId=${car.modelId}`)
        .expect(200);
      expect(list.body.meta.total).toBe(1);
    });

    step(
      'a comment with a link is held for review (invisible publicly, visible to its author)',
      async () => {
        const res = await t
          .http()
          .post('/api/v1/comments')
          .set(carol.auth)
          .send({
            targetType: 'variant',
            targetId: car.variantId,
            body: 'Details at https://example.com/test',
          })
          .expect(201);
        expect(res.body.data.status).toBe('pending');
        const list = await t
          .http()
          .get(`/api/v1/comments?targetType=variant&targetId=${car.variantId}`)
          .expect(200);
        expect(list.body.data.map((c: { id: string }) => c.id)).not.toContain(res.body.data.id);
        const mine = await t
          .http()
          .get('/api/v1/me/community/content?type=comment')
          .set(carol.auth)
          .expect(200);
        expect(mine.body.data).toContainEqual(
          expect.objectContaining({ id: res.body.data.id, status: 'pending' }),
        );
        const signal = await t.prisma.spamSignal.findFirst({
          where: { targetType: 'comment', targetId: res.body.data.id, signal: 'link_spam' },
        });
        expect(signal).not.toBeNull();
      },
    );

    step(
      'hidden content is invisible publicly (list, detail, replies); the author sees "hidden"',
      async () => {
        await moderate(t, mod, 'comments', commentId, 'hide', 'Test hide');
        const list = await t
          .http()
          .get(`/api/v1/comments?targetType=article&targetId=${article.id}`)
          .expect(200);
        expect(list.body.data).toEqual([]);
        await t.http().get(`/api/v1/comments/${commentId}`).expect(404);
        await t.http().get(`/api/v1/comments/${commentId}`).set(bob.auth).expect(404);
        const own = await t.http().get(`/api/v1/comments/${commentId}`).set(alice.auth).expect(200);
        expect(own.body.data.status).toBe('hidden');
        const replies = await t
          .http()
          .get(`/api/v1/comments/${commentId}/replies`)
          .set(alice.auth)
          .expect(200);
        expect(replies.body.data).toEqual([]);
        // Hidden content cannot be edited by its author.
        await t
          .http()
          .patch(`/api/v1/comments/${commentId}`)
          .set(alice.auth)
          .send({ body: uniqueText() })
          .expect(409);
        await moderate(t, mod, 'comments', commentId, 'restore');
        const back = await t
          .http()
          .get(`/api/v1/comments?targetType=article&targetId=${article.id}`)
          .expect(200);
        expect(back.body.data).toHaveLength(1);
      },
    );
    it('workflow: the steps above, in order', () => run(), run.timeout);
  });

  describe('questions & answers', () => {
    const { step, run } = orderedSteps();
    let questionId: string;
    let answerId: string;

    step('asks a question about a car model and gets answers', async () => {
      const q = await t
        .http()
        .post('/api/v1/questions')
        .set(alice.auth)
        .send({
          targetType: 'model',
          targetId: car.modelId,
          title: uniqueText('How long does charging take'),
        })
        .expect(201);
      questionId = q.body.data.id;
      expect(q.body.data).toMatchObject({
        status: 'approved',
        target: { type: 'model', id: car.modelId },
        answerCount: 0,
        acceptedAnswer: null,
      });
      const a = await t
        .http()
        .post(`/api/v1/questions/${questionId}/answers`)
        .set(bob.auth)
        .send({ body: uniqueText('Answer') })
        .expect(201);
      answerId = a.body.data.id;
      const unanswered = await t
        .http()
        .get(`/api/v1/questions?targetType=model&targetId=${car.modelId}&answered=false`)
        .expect(200);
      expect(unanswered.body.data).toEqual([]);
      const listed = await t
        .http()
        .get(`/api/v1/questions?targetType=model&targetId=${car.modelId}`)
        .expect(200);
      expect(listed.body.data[0]).toMatchObject({ id: questionId, answerCount: 1 });
    });

    step('targetType and targetId go together (422)', async () => {
      await t.http().get(`/api/v1/questions?targetType=model`).expect(422);
    });

    step('only the asker accepts an answer', async () => {
      await t
        .http()
        .post(`/api/v1/questions/${questionId}/accept`)
        .set(bob.auth)
        .send({ answerId })
        .expect(403);
      const res = await t
        .http()
        .post(`/api/v1/questions/${questionId}/accept`)
        .set(alice.auth)
        .send({ answerId })
        .expect(200);
      expect(res.body.data.acceptedAnswerId).toBe(answerId);
      expect(res.body.data.acceptedAnswer).toMatchObject({ id: answerId, isAccepted: true });
      const answers = await t.http().get(`/api/v1/questions/${questionId}/answers`).expect(200);
      expect(answers.body.data[0]).toMatchObject({ id: answerId, isAccepted: true });
    });

    step('helpful votes: once per user, changeable, removable, never on own posts', async () => {
      const url = '/api/v1/community/votes';
      await t
        .http()
        .post(url)
        .send({ targetType: 'answer', targetId: answerId, value: 1 })
        .expect(401);
      const self = await t
        .http()
        .post(url)
        .set(bob.auth)
        .send({ targetType: 'answer', targetId: answerId, value: 1 })
        .expect(422);
      expect(self.body.error.code).toBe('COMMUNITY_SELF_VOTE');
      const up = await t
        .http()
        .post(url)
        .set(alice.auth)
        .send({ targetType: 'answer', targetId: answerId, value: 1 })
        .expect(200);
      expect(up.body.data.votes).toMatchObject({ up: 1, down: 0, score: 1, myVote: 1 });
      await t
        .http()
        .post(url)
        .set(alice.auth)
        .send({ targetType: 'answer', targetId: answerId, value: 1 })
        .expect(200);
      const down = await t
        .http()
        .post(url)
        .set(alice.auth)
        .send({ targetType: 'answer', targetId: answerId, value: -1 })
        .expect(200);
      expect(down.body.data.votes).toMatchObject({ up: 0, down: 1, myVote: -1 });
      await t
        .http()
        .post(url)
        .set(carol.auth)
        .send({ targetType: 'answer', targetId: answerId, value: 1 })
        .expect(200);
      const cleared = await t
        .http()
        .post(url)
        .set(alice.auth)
        .send({ targetType: 'answer', targetId: answerId, value: 0 })
        .expect(200);
      expect(cleared.body.data.votes).toMatchObject({ up: 1, down: 0, myVote: null });
      // myVote is personal.
      const asCarol = await t
        .http()
        .get(`/api/v1/questions/${questionId}/answers`)
        .set(carol.auth)
        .expect(200);
      expect(asCarol.body.data[0].votes.myVote).toBe(1);
      expect(asCarol.headers['cache-control']).toContain('no-store');
      const asGuest = await t.http().get(`/api/v1/questions/${questionId}/answers`).expect(200);
      expect(asGuest.body.data[0].votes.myVote).toBeNull();
    });

    step('votes on hidden content → 404; deleting an accepted answer clears it', async () => {
      await moderate(t, mod, 'answers', answerId, 'hide');
      await t
        .http()
        .post('/api/v1/community/votes')
        .set(carol.auth)
        .send({ targetType: 'answer', targetId: answerId, value: -1 })
        .expect(404);
      await moderate(t, mod, 'answers', answerId, 'restore');
      await t.http().delete(`/api/v1/answers/${answerId}`).set(bob.auth).expect(204);
      const q = await t.http().get(`/api/v1/questions/${questionId}`).expect(200);
      expect(q.body.data).toMatchObject({
        acceptedAnswerId: null,
        acceptedAnswer: null,
        answerCount: 0,
      });
    });
    it('workflow: the steps above, in order', () => run(), run.timeout);
  });

  describe('user mutes ("block this user" for me)', () => {
    let target: string;

    beforeAll(async () => {
      const m = await t.prisma.carModel.findUniqueOrThrow({ where: { id: otherCar.modelId } });
      target = m.id;
      await t
        .http()
        .post('/api/v1/comments')
        .set(bob.auth)
        .send({ targetType: 'model', targetId: target, body: uniqueText('Bob says') })
        .expect(201);
      await t
        .http()
        .post('/api/v1/comments')
        .set(carol.auth)
        .send({ targetType: 'model', targetId: target, body: uniqueText('Carol says') })
        .expect(201);
    });

    it('hides the muted user’s content for the muting user only', async () => {
      await t.http().put(`/api/v1/me/mutes/${alice.userId}`).set(alice.auth).expect(422);
      await t.http().put(`/api/v1/me/mutes/${bob.userId}`).set(alice.auth).expect(200);
      await t.http().put(`/api/v1/me/mutes/${bob.userId}`).set(alice.auth).expect(200); // idempotent
      const url = `/api/v1/comments?targetType=model&targetId=${target}`;
      const forAlice = await t.http().get(url).set(alice.auth).expect(200);
      expect(forAlice.body.data.map((c: { author: { id: string } }) => c.author.id)).toEqual([
        carol.userId,
      ]);
      const forGuest = await t.http().get(url).expect(200);
      expect(forGuest.body.meta.total).toBe(2);
      const mutes = await t.http().get('/api/v1/me/mutes').set(alice.auth).expect(200);
      expect(mutes.body.data).toEqual([expect.objectContaining({ userId: bob.userId })]);
      await t.http().delete(`/api/v1/me/mutes/${bob.userId}`).set(alice.auth).expect(204);
      const again = await t.http().get(url).set(alice.auth).expect(200);
      expect(again.body.meta.total).toBe(2);
    });
  });

  it('GET /community/report-reasons lists the DB labels', async () => {
    const res = await t.http().get('/api/v1/community/report-reasons?lang=en').expect(200);
    const codes = (res.body.data as { code: string }[]).map((r) => r.code);
    expect(codes).toEqual(expect.arrayContaining(['spam', 'abuse', 'other']));
    expect(res.body.data.find((r: { code: string }) => r.code === 'other').requiresDetails).toBe(
      true,
    );
  });

  it('GET /me/community/status', async () => {
    const res = await t.http().get('/api/v1/me/community/status').set(alice.auth).expect(200);
    expect(res.body.data).toMatchObject({
      canPost: true,
      emailVerified: true,
      isNewAccount: false,
      block: null,
    });
    await t.http().get('/api/v1/me/community/status').expect(401);
  });
});
