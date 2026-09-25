/**
 * RSS import against a local HTTPS feed fixture (synthetic test data, never
 * real news): SSRF protection, licence modes, de-duplication, import job
 * logs, scheduled + manual fetch, drafts that respect the licence and are
 * never published automatically (REQUIREMENTS §5, §19).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SafeFetcher } from '../src/common/security/safe-fetch';
import { SafeFetchService } from '../src/common/security/safe-fetch.service';
import { RssSchedulerService } from '../src/modules/rss-import/rss-scheduler.service';
import { newsStaff, type NewsStaff } from './articles-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

const HOST = 'feeds.test';
const INTERNAL = 'internal.test';

/** Synthetic RSS 2.0 fixture — invented titles for tests only. */
function rss(
  port: number,
  items: Array<{ guid: string; path: string; title: string; description: string }>,
) {
  const base = `https://${HOST}:${port}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Test Feed (synthetic fixture)</title><link>${base}/</link><language>en</language>
${items
  .map(
    (i) => `<item><title>${i.title}</title><link>${base}${i.path}</link><guid>${i.guid}</guid>
<description>${i.description}</description><pubDate>Thu, 24 Sep 2026 10:00:00 GMT</pubDate>
<enclosure url="${base}/img/${i.guid}.jpg" type="image/jpeg" length="1"/></item>`,
  )
  .join('\n')}
</channel></rss>`;
}

describe('RSS import (e2e)', () => {
  let t: TestApp;
  let staff: NewsStaff;
  let server: Server;
  let port: number;
  let dir: string;
  let fetcher: SafeFetcher;
  let feed1Etag = '"v1"';

  const url = (path: string) => `https://${HOST}:${port}${path}`;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'evcar-rss-'));
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-sha256',
        '-days',
        '1',
        '-keyout',
        join(dir, 'key.pem'),
        '-out',
        join(dir, 'cert.pem'),
        '-subj',
        `/CN=${HOST}`,
        '-addext',
        `subjectAltName=DNS:${HOST},DNS:${INTERNAL}`,
      ],
      { stdio: 'ignore' },
    );
    const cert = readFileSync(join(dir, 'cert.pem'));
    server = createServer({ key: readFileSync(join(dir, 'key.pem')), cert }, (req, res) => {
      if (req.url === '/feed.xml') {
        if (req.headers['if-none-match'] === feed1Etag) {
          res.writeHead(304).end();
          return;
        }
        res.writeHead(200, { 'content-type': 'application/rss+xml', etag: feed1Etag }).end(
          rss(port, [
            {
              guid: 'a1',
              path: '/story-a?utm_source=rss',
              title: 'Test story A',
              description: 'Synthetic excerpt A.',
            },
            {
              guid: 'b1',
              path: '/story-b',
              title: 'Test story B',
              description: 'Synthetic excerpt B.',
            },
            // Same title + excerpt as A under another URL → duplicate by content.
            {
              guid: 'c1',
              path: '/mirror/story-a',
              title: 'Test story A',
              description: 'Synthetic excerpt A.',
            },
          ]),
        );
        return;
      }
      if ((req.url ?? '').split('?')[0] === '/feed2.xml') {
        res.writeHead(200, { 'content-type': 'application/rss+xml' }).end(
          rss(port, [
            // Same article URL as A (tracking parameter removed) → duplicate by URL.
            {
              guid: 'x1',
              path: '/story-a',
              title: 'Another headline for A',
              description: 'Other excerpt.',
            },
            {
              guid: 'd1',
              path: '/story-d',
              title: 'Test story D',
              description: 'Synthetic excerpt D.',
            },
          ]),
        );
        return;
      }
      if (req.url === '/redirect-internal') {
        res.writeHead(302, { location: `https://${INTERNAL}:${port}/feed.xml` }).end();
        return;
      }
      if (req.url === '/not-xml') {
        res.writeHead(200, { 'content-type': 'text/html' }).end('<html>no feed</html>');
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;

    // Test SSRF policy: only the fixture (127.0.0.1) is "public"; internal.test
    // resolves to 10.0.0.7 and stays blocked like every private address.
    fetcher = new SafeFetcher({
      timeoutMs: 3000,
      maxBytes: 1024 * 1024,
      maxRedirects: 3,
      userAgent: 'EVCarNewsBot/test',
      allowedPorts: [port],
      ca: cert,
      addressPolicy: (address) => address === '127.0.0.1',
      resolver: (hostname) => {
        const map: Record<string, string> = { [HOST]: '127.0.0.1', [INTERNAL]: '10.0.0.7' };
        const address = map[hostname];
        return address
          ? Promise.resolve([{ address, family: 4 }])
          : Promise.reject(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
      },
    });
    t = await createTestApp({
      override: (b) =>
        b.overrideProvider(SafeFetchService).useValue({
          fetch: (u: string, o?: object) => fetcher.fetch(u, o),
          assertUrlAllowed: (u: string) => fetcher.assertUrlAllowed(u),
          onApplicationShutdown: () => Promise.resolve(),
        }),
    });
    staff = await newsStaff(t);
  });

  afterAll(async () => {
    await t?.close();
    await fetcher?.close();
    server?.closeAllConnections();
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const feeds = '/api/v1/admin/rss-feeds';
  const items = '/api/v1/admin/rss-items';

  it('blocks private / internal / non-https feed URLs (SSRF)', async () => {
    for (const bad of [
      'https://10.0.0.5/feed.xml',
      'https://192.168.1.10/rss',
      'https://169.254.169.254/latest/meta-data/',
      `https://${INTERNAL}:${port}/feed.xml`,
      `http://${HOST}:${port}/feed.xml`,
      'file:///etc/passwd',
    ]) {
      const res = await t
        .http()
        .post(feeds)
        .set(staff.owner.auth)
        .send({ name: 'Bad feed', url: bad });
      expect({ bad, status: res.status }).toEqual({ bad, status: 422 });
      expect(res.body.error.code).toBe('FEED_URL_NOT_ALLOWED');
    }
    // A public feed that redirects to an internal address is refused at fetch time.
    const created = await t
      .http()
      .post(feeds)
      .set(staff.owner.auth)
      .send({ name: 'Redirecting feed', url: url('/redirect-internal') })
      .expect(201);
    const res = await t
      .http()
      .post(`${feeds}/${created.body.data.id}/fetch`)
      .set(staff.owner.auth)
      .expect(422);
    expect(res.body.error.code).toBe('FEED_URL_NOT_ALLOWED');
    const feed = await t.prisma.rssFeed.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(feed.lastError).toContain('BLOCKED_ADDRESS');
    expect(feed.consecutiveFailures).toBe(1);
    const job = await t.prisma.importJob.findFirstOrThrow({
      where: { type: 'rss.fetch', source: url('/redirect-internal') },
    });
    expect(job.status).toBe('failed');
    await t.http().delete(`${feeds}/${created.body.data.id}`).set(staff.owner.auth).expect(204);
  });

  it('licence modes beyond headline + link need a recorded permission', async () => {
    const refused = await t
      .http()
      .post(feeds)
      .set(staff.reviewer.auth)
      .send({ name: 'Summary feed', url: url('/feed2.xml'), licenseMode: 'summary_only' })
      .expect(422);
    expect(refused.body.error.code).toBe('RSS_PERMISSION_REQUIRED');
    await t
      .http()
      .post(feeds)
      .set(staff.reviewer.auth)
      .send({ name: 'Images feed', url: url('/feed2.xml'), allowImages: true })
      .expect(422);
    // Editors can read the queue but not manage feeds.
    await t
      .http()
      .post(feeds)
      .set(staff.editor.auth)
      .send({ name: 'Editor feed', url: url('/feed.xml') })
      .expect(403);
  });

  let feed1: string;
  let feed2: string;

  it('manual fetch: new items, de-duplication by content, import job log', async () => {
    const created = await t
      .http()
      .post(feeds)
      .set(staff.reviewer.auth)
      .send({ name: 'Test Feed', url: url('/feed.xml'), attributionText: 'Source: Test Feed' })
      .expect(201);
    feed1 = created.body.data.id;
    expect(created.body.data).toMatchObject({ licenseMode: 'link_only', allowImages: false });

    const res = await t.http().post(`${feeds}/${feed1}/fetch`).set(staff.reviewer.auth).expect(200);
    expect(res.body.data).toMatchObject({
      outcome: 'completed',
      received: 3,
      created: 2,
      duplicates: 1,
      alreadyKnown: 0,
    });
    const job = await t.prisma.importJob.findUniqueOrThrow({
      where: { id: res.body.data.jobId },
      include: { rows: true },
    });
    expect(job).toMatchObject({ type: 'rss.fetch', status: 'completed', totalRows: 3 });
    expect(job.rows.map((r) => r.status).sort()).toEqual(['duplicate', 'imported', 'imported']);

    const list = await t.http().get(`${items}?feedId=${feed1}`).set(staff.editor.auth).expect(200);
    expect(list.body.meta.total).toBe(3);
    const byTitle = (list.body.data as Array<Record<string, unknown>>).sort((a, b) =>
      String(a.url).localeCompare(String(b.url)),
    );
    const mirror = byTitle.find((i) => String(i.url).includes('/mirror/'))!;
    expect(mirror).toMatchObject({ status: 'duplicate' });
    expect((mirror.duplicateOf as { title: string }).title).toBe('Test story A');
    // Headline + link only: the excerpt and images are not kept.
    for (const i of byTitle) {
      expect(i.summary).toBeNull();
      expect(i.imageUrl).toBeNull();
      expect(i.language).toBe('en');
    }
    const a = byTitle.find((i) => String(i.url).includes('story-a?'))!;
    expect(a.canonicalUrl).toBe(url('/story-a'));
  });

  it('refetch: 304 → not modified; unchanged items are never duplicated', async () => {
    const res = await t.http().post(`${feeds}/${feed1}/fetch`).set(staff.reviewer.auth).expect(200);
    expect(res.body.data.outcome).toBe('not_modified');
    feed1Etag = '"v2"';
    const again = await t
      .http()
      .post(`${feeds}/${feed1}/fetch`)
      .set(staff.reviewer.auth)
      .expect(200);
    expect(again.body.data).toMatchObject({ received: 3, created: 0, alreadyKnown: 3 });
    expect(await t.prisma.rssItem.count({ where: { feedId: feed1 } })).toBe(3);
  });

  it('another feed with the same article URL → duplicate; summaries kept with permission', async () => {
    const created = await t
      .http()
      .post(feeds)
      .set(staff.reviewer.auth)
      .send({
        name: 'Second Test Feed',
        url: url('/feed2.xml'),
        licenseMode: 'summary_only',
        permissionReference: 'Test agreement #1 (synthetic)',
        marketCode: 'EG',
      })
      .expect(201);
    feed2 = created.body.data.id;
    expect(created.body.data.permissionConfirmedById).toBe(staff.reviewer.id);
    expect(created.body.data.permissionConfirmedAt).toBeTruthy();
    const res = await t.http().post(`${feeds}/${feed2}/fetch`).set(staff.reviewer.auth).expect(200);
    expect(res.body.data).toMatchObject({ received: 2, created: 1, duplicates: 1 });
    const d = await t.prisma.rssItem.findFirstOrThrow({ where: { feedId: feed2 } });
    expect(d.summary).toBe('Synthetic excerpt D.');
  });

  it('create draft: licence-respecting, source recorded, never published automatically', async () => {
    const a = await t.prisma.rssItem.findFirstOrThrow({
      where: { feedId: feed1, title: 'Test story A', status: 'new' },
    });
    const res = await t
      .http()
      .post(`${items}/${a.id}/create-draft`)
      .set(staff.editor.auth)
      .send({})
      .expect(201);
    const article = res.body.data.article;
    expect(article).toMatchObject({
      status: 'draft',
      originalLanguage: 'en',
      sourceName: 'Test Feed',
      sourceUrl: a.url,
      rssItemId: a.id,
      author: { id: staff.editor.id },
    });
    expect(article.translations.en).toMatchObject({
      title: 'Test story A',
      summary: null,
      bodyHtml: '',
      isMachineTranslated: false,
    });
    expect(res.body.data.item.status).toBe('drafted');
    expect(article.publishIssues.map((i: { code: string }) => i.code)).toContain('BODY_EMPTY');

    const twice = await t
      .http()
      .post(`${items}/${a.id}/create-draft`)
      .set(staff.editor.auth)
      .send({});
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('RSS_ITEM_ALREADY_DRAFTED');
    // Duplicates must be restored before drafting.
    const dup = await t.prisma.rssItem.findFirstOrThrow({ where: { status: 'duplicate' } });
    const refused = await t
      .http()
      .post(`${items}/${dup.id}/create-draft`)
      .set(staff.editor.auth)
      .send({});
    expect(refused.body.error.code).toBe('RSS_ITEM_NOT_DRAFTABLE');

    // Nobody can publish it before a person writes the body.
    await t
      .http()
      .post(`/api/v1/admin/articles/${article.id}/submit`)
      .set(staff.editor.auth)
      .send({})
      .expect(200);
    const publish = await t
      .http()
      .post(`/api/v1/admin/articles/${article.id}/publish`)
      .set(staff.reviewer.auth)
      .send({})
      .expect(422);
    expect(publish.body.error.code).toBe('ARTICLE_NOT_PUBLISHABLE');
    await t.http().get(`/api/v1/articles/${article.slug}`).expect(404);

    // Summary-only feed: the excerpt becomes the draft summary, market from the feed.
    const d = await t.prisma.rssItem.findFirstOrThrow({ where: { feedId: feed2, status: 'new' } });
    const draftD = await t
      .http()
      .post(`${items}/${d.id}/create-draft`)
      .set(staff.editor.auth)
      .send({})
      .expect(201);
    expect(draftD.body.data.article).toMatchObject({ marketCodes: ['EG'] });
    expect(draftD.body.data.article.translations.en.summary).toBe('Synthetic excerpt D.');
    expect(draftD.body.data.article.translations.en.bodyHtml).toBe('');

    // Deleting a feed with drafts is refused (attribution must stay).
    const del = await t.http().delete(`${feeds}/${feed1}`).set(staff.owner.auth).expect(409);
    expect(del.body.error.code).toBe('RSS_FEED_IN_USE');
  });

  it('ignore / restore items', async () => {
    const b = await t.prisma.rssItem.findFirstOrThrow({ where: { title: 'Test story B' } });
    const ignored = await t
      .http()
      .post(`${items}/${b.id}/ignore`)
      .set(staff.reviewer.auth)
      .send({ reason: 'Not about EVs' })
      .expect(200);
    expect(ignored.body.data).toMatchObject({ status: 'ignored', statusReason: 'Not about EVs' });
    const restored = await t
      .http()
      .post(`${items}/${b.id}/restore`)
      .set(staff.reviewer.auth)
      .expect(200);
    expect(restored.body.data.status).toBe('new');
  });

  it('scheduled fetching picks due feeds only and never publishes', async () => {
    const created = await t
      .http()
      .post(feeds)
      .set(staff.owner.auth)
      .send({ name: 'Scheduled feed', url: url('/feed2.xml?copy=1'), fetchIntervalMinutes: 30 })
      .expect(201);
    const scheduler = t.app.get(RssSchedulerService);
    const fetched = await scheduler.runDue();
    expect(fetched).toContain(created.body.data.id);
    expect(fetched).not.toContain(feed1);
    const feed = await t.prisma.rssFeed.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(feed.lastSuccessAt).toBeTruthy();
    expect(feed.nextFetchAt!.getTime()).toBeGreaterThan(Date.now() + 25 * 60_000);
    expect(await scheduler.runDue()).not.toContain(created.body.data.id);
    const published = await t.prisma.article.count({
      where: { rssItemId: { not: null }, status: 'published' },
    });
    expect(published).toBe(0);
  });

  it('a non-feed answer is reported as FEED_INVALID', async () => {
    const created = await t
      .http()
      .post(feeds)
      .set(staff.owner.auth)
      .send({ name: 'Not a feed', url: url('/not-xml') })
      .expect(201);
    const res = await t.http().post(`${feeds}/${created.body.data.id}/fetch`).set(staff.owner.auth);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FEED_INVALID');
  });
});

describe('RSS feed URLs with the production SSRF policy (e2e)', () => {
  let t: TestApp;
  let staff: NewsStaff;
  beforeAll(async () => {
    t = await createTestApp();
    staff = await newsStaff(t);
  });
  afterAll(async () => {
    await t?.close();
  });

  it.each([
    'https://127.0.0.1/feed.xml',
    'https://localhost/feed.xml',
    'https://[::1]/feed.xml',
    'https://10.1.2.3/feed.xml',
    'https://printer.local/feed.xml',
  ])('refuses %s', async (bad) => {
    const res = await t
      .http()
      .post('/api/v1/admin/rss-feeds')
      .set(staff.owner.auth)
      .send({ name: 'x', url: bad });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FEED_URL_NOT_ALLOWED');
  });
});
