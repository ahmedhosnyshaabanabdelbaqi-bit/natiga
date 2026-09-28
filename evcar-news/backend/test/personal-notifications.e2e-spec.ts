/**
 * Notifications: in-app center, dedupe, preferences (types, unsubscribe
 * all, quiet hours), topic subscriptions, device tokens, push delivery
 * through a FAKE push gateway (FCM "configured", APNs not), the
 * article-published trigger, and per-user isolation. Synthetic data only.
 */
import { randomBytes } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationService } from '../src/modules/notifications/notification.service';
import { PushDispatchService } from '../src/modules/notifications/push-dispatch.service';
import { PUSH_GATEWAY } from '../src/providers';
import { PushGateway } from '../src/providers/push/push.gateway';
import type {
  PushMessage,
  PushProviderName,
  PushSendOutcome,
} from '../src/providers/push/push.types';
import { bearer, createAndLogin, type LoggedIn } from './auth-test-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

class FakePushChannel {
  readonly sent: { token: string; message: PushMessage }[] = [];
  constructor(
    readonly name: PushProviderName,
    readonly configured: boolean,
  ) {}
  send(tokens: string[], message: PushMessage): Promise<PushSendOutcome[]> {
    return Promise.resolve(
      tokens.map((token) => {
        if (!this.configured)
          return { token, provider: this.name, status: 'not_configured' as const };
        if (token.startsWith('bad'))
          return {
            token,
            provider: this.name,
            status: 'invalid_token' as const,
            error: 'UNREGISTERED',
          };
        this.sent.push({ token, message });
        return {
          token,
          provider: this.name,
          status: 'sent' as const,
          providerMessageId: `fake-${this.sent.length}`,
        };
      }),
    );
  }
  status() {
    return { type: 'push', name: this.name, configured: this.configured };
  }
  check() {
    return Promise.resolve({ ok: this.configured });
  }
}

const token = (prefix = 'tok') => `${prefix}-${randomBytes(12).toString('hex')}`;

describe('Personal: notifications (e2e)', () => {
  let t: TestApp;
  let alice: LoggedIn;
  let bob: LoggedIn;
  let notifier: NotificationService;
  let dispatch: PushDispatchService;
  const fcm = new FakePushChannel('fcm', true);
  const apns = new FakePushChannel('apns', false);

  beforeAll(async () => {
    t = await createTestApp({
      override: (b) =>
        b.overrideProvider(PUSH_GATEWAY).useValue(new PushGateway(fcm as never, apns as never)),
    });
    alice = await createAndLogin(t, ['user']);
    bob = await createAndLogin(t, ['user']);
    notifier = t.app.get(NotificationService);
    dispatch = t.app.get(PushDispatchService);
  });
  afterAll(async () => {
    await t?.close();
  });

  const content = (title: string) => ({
    ar: { title: `ع ${title}`, body: 'نص' },
    en: { title, body: 'Body' },
  });

  describe('center', () => {
    it('requires sign-in', async () => {
      await t.http().get('/api/v1/me/notifications').expect(401);
    });

    it('notify() creates one localized entry per user, deduped by key', async () => {
      const r1 = await notifier.notify({
        userIds: [alice.userId, bob.userId, alice.userId],
        type: 'test.hello',
        category: 'news',
        dedupeKey: 'test.hello:1',
        content: content('Hello'),
        deepLink: '/news/hello',
      });
      expect(r1).toMatchObject({ created: 2, duplicates: 0 });
      const r2 = await notifier.notify({
        userIds: [alice.userId],
        type: 'test.hello',
        category: 'news',
        dedupeKey: 'test.hello:1',
        content: content('Hello'),
      });
      expect(r2).toMatchObject({ created: 0, duplicates: 1 });

      const list = await t
        .http()
        .get('/api/v1/me/notifications')
        .set(bearer(alice.accessToken))
        .expect(200);
      expect(list.body.meta.total).toBe(1);
      // createUser() stores locale "en"
      expect(list.body.data[0]).toMatchObject({
        type: 'test.hello',
        title: 'Hello',
        body: 'Body',
        deepLink: '/news/hello',
        isRead: false,
        readAt: null,
      });
    });

    it('unsafe deep links are refused', async () => {
      await expect(
        notifier.notify({
          userIds: [alice.userId],
          type: 'test.bad',
          category: 'news',
          dedupeKey: 'test.bad',
          content: content('x'),
          deepLink: '//evil.example',
        }),
      ).rejects.toThrow('Unsafe deep link');
    });

    it('read / unread / read-all / unread-count / delete, isolated per user', async () => {
      await notifier.notify({
        userIds: [alice.userId],
        type: 'test.two',
        category: 'account',
        dedupeKey: 'test.two',
        content: content('Two'),
      });
      const count = await t
        .http()
        .get('/api/v1/me/notifications/unread-count')
        .set(bearer(alice.accessToken))
        .expect(200);
      expect(count.body.data.count).toBe(2);
      const list = await t
        .http()
        .get('/api/v1/me/notifications')
        .set(bearer(alice.accessToken))
        .expect(200);
      const id = list.body.data[0].id as string;

      await t
        .http()
        .post(`/api/v1/me/notifications/${id}/read`)
        .set(bearer(bob.accessToken))
        .expect(404);
      await t
        .http()
        .delete(`/api/v1/me/notifications/${id}`)
        .set(bearer(bob.accessToken))
        .expect(404);

      const read = await t
        .http()
        .post(`/api/v1/me/notifications/${id}/read`)
        .set(bearer(alice.accessToken))
        .expect(200);
      expect(read.body.data.isRead).toBe(true);
      const unread = await t
        .http()
        .get('/api/v1/me/notifications?unread=true')
        .set(bearer(alice.accessToken))
        .expect(200);
      expect(unread.body.meta.total).toBe(1);
      await t
        .http()
        .post(`/api/v1/me/notifications/${id}/unread`)
        .set(bearer(alice.accessToken))
        .expect(200);
      const all = await t
        .http()
        .post('/api/v1/me/notifications/read-all')
        .set(bearer(alice.accessToken))
        .expect(200);
      expect(all.body.data.updated).toBe(2);
      await t
        .http()
        .delete(`/api/v1/me/notifications/${id}`)
        .set(bearer(alice.accessToken))
        .expect(204);
      const bobList = await t
        .http()
        .get('/api/v1/me/notifications')
        .set(bearer(bob.accessToken))
        .expect(200);
      expect(bobList.body.meta.total).toBe(1);
    });
  });

  describe('preferences', () => {
    it('defaults: everything on; push status reflects configuration and devices', async () => {
      const res = await t
        .http()
        .get('/api/v1/me/notification-preferences')
        .set(bearer(alice.accessToken))
        .expect(200);
      expect(res.body.data).toEqual({
        types: {
          news: true,
          priceAlerts: true,
          reminders: true,
          community: true,
          stationAlerts: true,
          campaigns: true,
        },
        channels: { inApp: true, push: true, email: false },
        quietHours: null,
        unsubscribedAll: false,
        unsubscribedAt: null,
        push: { configured: true, registeredDevices: 0, status: 'no_device' },
        // Review 3: only switches / topics with a real producer are announced.
        supported: { types: ['news'], topicTypes: ['brand', 'model', 'variant', 'category'] },
      });
    });

    it('a switched-off type is not delivered; unsubscribe-all mutes everything except account', async () => {
      await t
        .http()
        .patch('/api/v1/me/notification-preferences')
        .set(bearer(bob.accessToken))
        .send({ types: { news: false } })
        .expect(200);
      const r = await notifier.notify({
        userIds: [bob.userId],
        type: 'test.news',
        category: 'news',
        dedupeKey: 'test.news:1',
        content: content('N'),
      });
      expect(r).toMatchObject({ created: 0, skippedByPreference: 1 });

      const unsub = await t
        .http()
        .patch('/api/v1/me/notification-preferences')
        .set(bearer(bob.accessToken))
        .send({ unsubscribeAll: true })
        .expect(200);
      expect(unsub.body.data.unsubscribedAll).toBe(true);
      const r2 = await notifier.notify({
        userIds: [bob.userId],
        type: 'test.rem',
        category: 'reminder',
        dedupeKey: 'test.rem:1',
        content: content('R'),
      });
      expect(r2.created).toBe(0);
      const r3 = await notifier.notify({
        userIds: [bob.userId],
        type: 'test.acc',
        category: 'account',
        dedupeKey: 'test.acc:1',
        content: content('A'),
      });
      expect(r3.created).toBe(1);

      const back = await t
        .http()
        .patch('/api/v1/me/notification-preferences')
        .set(bearer(bob.accessToken))
        .send({ types: { news: true } })
        .expect(200);
      expect(back.body.data).toMatchObject({ unsubscribedAll: false, types: { news: true } });
    });

    it('validates quiet hours', async () => {
      const p = (body: object) =>
        t
          .http()
          .patch('/api/v1/me/notification-preferences')
          .set(bearer(alice.accessToken))
          .send(body);
      await p({ quietHours: { start: '22:00', end: '07:00', timezone: 'Mars/Olympus' } }).expect(
        422,
      );
      await p({ quietHours: { start: '25:00', end: '07:00', timezone: 'Africa/Cairo' } }).expect(
        422,
      );
      await p({ quietHours: { start: '07:00', end: '07:00', timezone: 'Africa/Cairo' } }).expect(
        422,
      );
      await p({ types: { news: null } }).expect(422);
      const ok = await p({
        quietHours: { start: '22:00', end: '07:00', timezone: 'Africa/Cairo' },
      }).expect(200);
      expect(ok.body.data.quietHours).toEqual({
        start: '22:00',
        end: '07:00',
        timezone: 'Africa/Cairo',
      });
      const off = await p({ quietHours: null }).expect(200);
      expect(off.body.data.quietHours).toBeNull();
    });
  });

  describe('devices and push', () => {
    let aliceToken: string;

    it('registers a device (token masked); the same installation replaces its old token', async () => {
      const first = token();
      await t
        .http()
        .post('/api/v1/me/devices')
        .set(bearer(alice.accessToken))
        .send({ token: first, platform: 'android', installationId: 'inst-a', appVersion: '1.0.0' })
        .expect(200);
      aliceToken = token();
      const res = await t
        .http()
        .post('/api/v1/me/devices')
        .set(bearer(alice.accessToken))
        .send({
          token: aliceToken,
          platform: 'android',
          installationId: 'inst-a',
          appVersion: '1.0.1',
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        platform: 'android',
        provider: 'fcm',
        active: true,
        tokenHint: `…${aliceToken.slice(-6)}`,
      });
      expect(JSON.stringify(res.body)).not.toContain(aliceToken);
      const list = await t
        .http()
        .get('/api/v1/me/devices')
        .set(bearer(alice.accessToken))
        .expect(200);
      expect(list.body.data).toHaveLength(1);
      await t
        .http()
        .post('/api/v1/me/devices')
        .set(bearer(alice.accessToken))
        .send({ token: 'short', platform: 'android' })
        .expect(422);
      const prefs = await t
        .http()
        .get('/api/v1/me/notification-preferences')
        .set(bearer(alice.accessToken))
        .expect(200);
      expect(prefs.body.data.push).toMatchObject({ status: 'active', registeredDevices: 1 });
    });

    it('sends push to configured providers only; the in-app entry is always created', async () => {
      await t
        .http()
        .post('/api/v1/me/devices')
        .set(bearer(alice.accessToken))
        .send({ token: token('ios'), platform: 'ios' })
        .expect(200);
      const before = fcm.sent.length;
      const now = new Date('2026-09-25T10:00:00Z'); // 13:00 Cairo, no quiet hours
      const r = await notifier.notify(
        {
          userIds: [alice.userId],
          type: 'test.push',
          category: 'news',
          dedupeKey: 'test.push:1',
          content: content('Push'),
          deepLink: '/news/p',
        },
        now,
      );
      expect(r).toMatchObject({ created: 1, push: { queued: 1, skippedNotConfigured: 1 } });
      await dispatch.flushDue(now);
      expect(fcm.sent.length).toBe(before + 1);
      expect(fcm.sent[fcm.sent.length - 1]).toMatchObject({
        token: aliceToken,
        message: { title: 'Push', deepLink: '/news/p' },
      });
      const n = await t.prisma.notification.findFirstOrThrow({
        where: { userId: alice.userId, dedupeKey: 'test.push:1' },
        include: { deliveries: true },
      });
      const statuses = n.deliveries
        .map((d) => `${d.channel}:${d.status}:${d.skipReason ?? ''}`)
        .sort();
      expect(statuses).toEqual([
        'in_app:sent:',
        'push:sent:',
        'push:skipped:channel_not_configured',
      ]);
    });

    it('quiet hours postpone push until the window ends', async () => {
      await t
        .http()
        .patch('/api/v1/me/notification-preferences')
        .set(bearer(alice.accessToken))
        .send({ quietHours: { start: '22:00', end: '07:00', timezone: 'Africa/Cairo' } })
        .expect(200);
      const night = new Date('2026-09-25T20:30:00Z'); // 23:30 Cairo
      const before = fcm.sent.length;
      const r = await notifier.notify(
        {
          userIds: [alice.userId],
          type: 'test.quiet',
          category: 'news',
          dedupeKey: 'test.quiet:1',
          content: content('Quiet'),
        },
        night,
      );
      expect(r.push.scheduledForQuietHours).toBe(1);
      await dispatch.flushDue(night);
      expect(fcm.sent.length).toBe(before);
      const pending = await t.prisma.notificationDelivery.findFirstOrThrow({
        where: { channel: 'push', status: 'pending', notification: { dedupeKey: 'test.quiet:1' } },
      });
      expect(pending.scheduledFor?.toISOString()).toBe('2026-09-26T04:00:00.000Z');
      await dispatch.flushDue(new Date('2026-09-26T04:01:00Z'));
      expect(fcm.sent.length).toBe(before + 1);
      await t
        .http()
        .patch('/api/v1/me/notification-preferences')
        .set(bearer(alice.accessToken))
        .send({ quietHours: null })
        .expect(200);
    });

    it('an invalid token is revoked; push can be switched off', async () => {
      const bad = token('bad');
      await t
        .http()
        .post('/api/v1/me/devices')
        .set(bearer(bob.accessToken))
        .send({ token: bad, platform: 'android' })
        .expect(200);
      await notifier.notify({
        userIds: [bob.userId],
        type: 'test.bad',
        category: 'account',
        dedupeKey: 'test.badtoken',
        content: content('B'),
      });
      await dispatch.flushDue();
      const row = await t.prisma.deviceToken.findUniqueOrThrow({ where: { token: bad } });
      expect(row.revokedAt).not.toBeNull();

      await t
        .http()
        .patch('/api/v1/me/notification-preferences')
        .set(bearer(alice.accessToken))
        .send({ channels: { push: false } })
        .expect(200);
      const r = await notifier.notify({
        userIds: [alice.userId],
        type: 'test.off',
        category: 'news',
        dedupeKey: 'test.off',
        content: content('Off'),
      });
      expect(r).toMatchObject({ created: 1, push: { queued: 0 } });
      const prefs = await t
        .http()
        .get('/api/v1/me/notification-preferences')
        .set(bearer(alice.accessToken))
        .expect(200);
      expect(prefs.body.data.push.status).toBe('disabled_by_user');
    });

    it('unregister is idempotent and scoped to the caller', async () => {
      await t
        .http()
        .post('/api/v1/me/devices/unregister')
        .set(bearer(bob.accessToken))
        .send({ token: aliceToken })
        .expect(204);
      expect(await t.prisma.deviceToken.count({ where: { token: aliceToken } })).toBe(1);
      await t
        .http()
        .post('/api/v1/me/devices/unregister')
        .set(bearer(alice.accessToken))
        .send({ token: aliceToken })
        .expect(204);
      await t
        .http()
        .post('/api/v1/me/devices/unregister')
        .set(bearer(alice.accessToken))
        .send({ token: aliceToken })
        .expect(204);
      expect(await t.prisma.deviceToken.count({ where: { token: aliceToken } })).toBe(0);
    });
  });

  describe('subscriptions and the article-published trigger', () => {
    let brandId: string;
    let modelId: string;
    let subId: string;
    const tag = randomBytes(4).toString('hex');

    beforeAll(async () => {
      const brand = await t.prisma.brand.create({
        data: {
          slug: `n-brand-${tag}`,
          nameEn: `NBrand ${tag}`,
          nameAr: `ماركة ${tag}`,
          status: 'published',
        },
      });
      brandId = brand.id;
      const model = await t.prisma.carModel.create({
        data: {
          brandId,
          slug: `n-model-${tag}`,
          nameEn: `NModel ${tag}`,
          nameAr: `موديل ${tag}`,
          status: 'published',
        },
      });
      modelId = model.id;
    });

    it('follow a brand (201, then 200 idempotent), validate targets, list with names', async () => {
      const post = (user: LoggedIn, body: object) =>
        t
          .http()
          .post('/api/v1/me/notification-subscriptions?lang=en')
          .set(bearer(user.accessToken))
          .send(body);
      const created = await post(alice, { topicType: 'brand', brandId }).expect(201);
      subId = created.body.data.id;
      expect(created.body.data).toMatchObject({
        topicType: 'brand',
        target: { id: brandId, name: `NBrand ${tag}` },
        marketCode: null,
      });
      const again = await post(alice, { topicType: 'brand', brandId }).expect(200);
      expect(again.body.data.id).toBe(subId);
      await post(alice, { topicType: 'brand' }).expect(422);
      await post(alice, { topicType: 'brand', brandId, modelId }).expect(422);
      await post(alice, {
        topicType: 'brand',
        brandId: '00000000-0000-4000-8000-000000000000',
      }).expect(422);
      await post(alice, { topicType: 'market' }).expect(422);
      await post(alice, { topicType: 'market', marketCode: 'EG' }).expect(201);
      // bob follows the model but only in SA
      await post(bob, { topicType: 'model', modelId, marketCode: 'SA' }).expect(201);
      const list = await t
        .http()
        .get('/api/v1/me/notification-subscriptions?lang=en')
        .set(bearer(alice.accessToken))
        .expect(200);
      expect(list.body.data).toHaveLength(2);
      await t
        .http()
        .delete(`/api/v1/me/notification-subscriptions/${subId}`)
        .set(bearer(bob.accessToken))
        .expect(404);
    });

    async function publishArticle(opts: { isDemo?: boolean; markets?: string[] } = {}) {
      const slug = `n-article-${randomBytes(4).toString('hex')}`;
      const article = await t.prisma.article.create({
        data: {
          slug,
          status: 'published',
          publishedAt: new Date(),
          isDemo: opts.isDemo ?? false,
          translations: {
            create: [
              { locale: 'ar', title: 'خبر اختبار' },
              { locale: 'en', title: 'Test story' },
            ],
          },
          vehicleLinks: { create: [{ modelId }] },
          markets: { create: (opts.markets ?? ['EG']).map((marketCode) => ({ marketCode })) },
        },
      });
      const results = await t.app.get(EventEmitter2).emitAsync('article.published', {
        articleId: article.id,
        slug,
        from: 'scheduled',
        to: 'published',
      });
      return { article, slug, results };
    }

    it('notifies followers of the linked model’s brand in the article market, once', async () => {
      await t
        .http()
        .patch('/api/v1/me/notification-preferences')
        .set(bearer(alice.accessToken))
        .send({ channels: { push: true } })
        .expect(200);
      const { article, slug } = await publishArticle();
      const n = await t.prisma.notification.findMany({
        where: { dedupeKey: `article.published:${article.id}` },
      });
      expect(n.map((x) => x.userId)).toEqual([alice.userId]); // bob follows only in SA
      expect(n[0]).toMatchObject({
        type: 'article.published',
        deepLink: `/news/${slug}`,
        title: `New story about NBrand ${tag}`,
        body: 'Test story',
        locale: 'en',
      });
      // Re-publishing never repeats it.
      await t.app
        .get(EventEmitter2)
        .emitAsync('article.published', { articleId: article.id, slug });
      expect(
        await t.prisma.notification.count({
          where: { dedupeKey: `article.published:${article.id}` },
        }),
      ).toBe(1);
    });

    it('market-narrowed follow matches; demo articles notify nobody', async () => {
      const { article } = await publishArticle({ markets: ['SA'] });
      const n = await t.prisma.notification.findMany({
        where: { dedupeKey: `article.published:${article.id}` },
      });
      expect(n.map((x) => x.userId).sort()).toEqual([alice.userId, bob.userId].sort());
      const bobN = n.find((x) => x.userId === bob.userId)!;
      expect(bobN.title).toBe(`New story about NBrand ${tag} NModel ${tag}`);
      const demo = await publishArticle({ isDemo: true });
      expect(
        await t.prisma.notification.count({
          where: { dedupeKey: `article.published:${demo.article.id}` },
        }),
      ).toBe(0);
    });

    it('unsubscribing stops them', async () => {
      await t
        .http()
        .delete(`/api/v1/me/notification-subscriptions/${subId}`)
        .set(bearer(alice.accessToken))
        .expect(204);
      const { article } = await publishArticle();
      expect(
        await t.prisma.notification.count({
          where: { dedupeKey: `article.published:${article.id}` },
        }),
      ).toBe(0);
    });
  });
});
