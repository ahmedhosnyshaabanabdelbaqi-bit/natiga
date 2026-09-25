/**
 * Phase 2 data model (migration 20260927000000_phase2_content_catalog_comparisons):
 * article publishing rules, corrections, revisions, categories seed, RSS
 * licences + de-duplication, catalog gallery, comparisons (2..4 items bound
 * to an existing variant × market), search markets/aliases and analytics
 * counters. Every refused case is paired with the legitimate write.
 */
import { randomUUID } from 'node:crypto';
import { Prisma } from '../src/generated/prisma/client';
import { DEMO_IDS as I, runDemoSeed } from '../src/cli/seed-data/demo-seed';
import { DEFAULT_CATEGORIES, SEARCH_ALIASES } from '../src/cli/seed-data/reference';
import { runReferenceSeed } from '../src/cli/seed-data/reference-seed';
import { fromPostgresCode } from '../src/common/filters/all-exceptions.filter';
import { createTestApp, type TestApp } from './utils/test-app';

/** Resolves to the thrown error or throws when the write succeeded. */
async function refusal(write: Promise<unknown>): Promise<unknown> {
  try {
    await write;
  } catch (err) {
    return err;
  }
  throw new Error('expected the database to refuse this write');
}

/** Error text (message + driver metadata) of a refused write. */
async function refused(write: Promise<unknown>): Promise<string> {
  const e = (await refusal(write)) as { message?: string; meta?: unknown };
  return `${e.message ?? ''} ${JSON.stringify(e.meta ?? {})}`;
}

const hex64 = (c: string) => c.repeat(64);

describe('Phase 2 data model (e2e)', () => {
  let t: TestApp;
  let db: TestApp['prisma'];

  beforeAll(async () => {
    t = await createTestApp();
    db = t.prisma;
    await runDemoSeed(db);
  });
  afterAll(async () => {
    await t?.close();
  });

  const slug = (p: string) => `${p}-${randomUUID()}`;

  describe('articles: publishing rules checked at COMMIT', () => {
    const ar = { locale: 'ar', title: 'عنوان اختباري', bodyHtml: '<p>نص</p>' };
    const en = { locale: 'en', title: 'Test title', bodyHtml: '<p>Text</p>' };
    const published = { status: 'published' as const, publishedAt: new Date() };

    async function image(overrides: Partial<Prisma.MediaAssetUncheckedCreateInput> = {}) {
      return db.mediaAsset.create({
        data: {
          kind: 'image',
          projection: 'flat',
          status: 'ready',
          storageDriver: 'local',
          storageKey: `public/test/${randomUUID()}.jpg`,
          isDemo: true,
          ...overrides,
        },
      });
    }

    it('a nested create (article first, translations after) is accepted', async () => {
      const a = await db.article.create({
        data: { slug: slug('ok'), ...published, translations: { create: [ar, en] } },
        include: { translations: true },
      });
      expect(a.translations).toHaveLength(2);
    });

    it('in review / scheduled / published need the original-language text', async () => {
      const err = await refusal(
        db.article.create({
          data: { slug: slug('no-ar'), ...published, translations: { create: [en] } },
        }),
      );
      expect(String((err as Error).message)).toMatch(/articles_original_translation_chk/);
      // The API maps it to 422 VALIDATION_FAILED with the rule name.
      expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect(fromPostgresCode(err as Prisma.PrismaClientKnownRequestError)).toMatchObject({
        status: 422,
        details: {
          reason: 'constraint_violation',
          constraint: 'articles_original_translation_chk',
        },
      });
      expect(
        await refused(
          db.article.create({
            data: { slug: slug('review'), status: 'in_review', translations: { create: [en] } },
          }),
        ),
      ).toMatch(/articles_original_translation_chk/);
      // Drafts may be empty; an English-original article only needs English.
      await db.article.create({ data: { slug: slug('draft') } });
      await db.article.create({
        data: {
          slug: slug('en'),
          originalLanguage: 'en',
          ...published,
          translations: { create: [en] },
        },
      });
    });

    it('an unreviewed machine translation is never the published text', async () => {
      const mt = { ...ar, isMachineTranslated: true };
      expect(
        await refused(
          db.article.create({
            data: { slug: slug('mt'), ...published, translations: { create: [mt] } },
          }),
        ),
      ).toMatch(/articles_machine_translation_review_chk/);
      // In review it is fine (that is where a human reviews it).
      const a = await db.article.create({
        data: { slug: slug('mt-review'), status: 'in_review', translations: { create: [mt] } },
      });
      // A review needs the reviewer.
      expect(
        await refused(
          db.articleTranslation.update({
            where: { articleId_locale: { articleId: a.id, locale: 'ar' } },
            data: { humanReviewedAt: new Date() },
          }),
        ),
      ).toMatch(/article_translations_reviewer_chk/);
      await db.articleTranslation.update({
        where: { articleId_locale: { articleId: a.id, locale: 'ar' } },
        data: { humanReviewedAt: new Date(), humanReviewedById: randomUUID() },
      });
      await db.article.update({ where: { id: a.id }, data: published });
      // Un-reviewing the published text is refused.
      expect(
        await refused(
          db.articleTranslation.update({
            where: { articleId_locale: { articleId: a.id, locale: 'ar' } },
            data: { humanReviewedAt: null, humanReviewedById: null },
          }),
        ),
      ).toMatch(/articles_machine_translation_review_chk/);
      // Other unreviewed machine translations may exist (hidden by the API).
      await db.articleTranslation.create({
        data: { articleId: a.id, ...en, isMachineTranslated: true },
      });
    });

    it('the original-language text of a live article cannot be deleted', async () => {
      const a = await db.article.create({
        data: { slug: slug('del'), ...published, translations: { create: [ar, en] } },
      });
      expect(
        await refused(
          db.articleTranslation.delete({
            where: { articleId_locale: { articleId: a.id, locale: 'ar' } },
          }),
        ),
      ).toMatch(/articles_original_translation_chk/);
      await db.articleTranslation.delete({
        where: { articleId_locale: { articleId: a.id, locale: 'en' } },
      });
      // Deleting the whole article is fine.
      await db.article.delete({ where: { id: a.id } });
    });

    it('a scheduled / published cover must be a ready, licensed image', async () => {
      const license = await db.assetLicense.create({
        data: { licenseType: 'owned', rightsHolder: 'Test rights holder', isDemo: true },
      });
      const unlicensed = await image();
      const processing = await image({ status: 'processing', licenseId: license.id });
      const good = await image({ licenseId: license.id });
      const scheduled = {
        status: 'scheduled' as const,
        scheduledAt: new Date(Date.now() + 86_400_000),
      };
      for (const cover of [unlicensed, processing]) {
        expect(
          await refused(
            db.article.create({
              data: {
                slug: slug('cover'),
                ...scheduled,
                coverAssetId: cover.id,
                translations: { create: [ar] },
              },
            }),
          ),
        ).toMatch(/articles_cover_rights_chk/);
      }
      const a = await db.article.create({
        data: {
          slug: slug('cover-ok'),
          coverAssetId: unlicensed.id,
          translations: { create: [ar] },
        },
      });
      await db.article.update({
        where: { id: a.id },
        data: { ...scheduled, coverAssetId: good.id },
      });
    });

    it('keeps revision restore trails and a corrections log', async () => {
      const a = await db.article.create({
        data: { slug: slug('rev'), ...published, translations: { create: [ar] } },
      });
      await db.articleRevision.create({
        data: { articleId: a.id, version: 1, status: 'published', snapshot: {} },
      });
      expect(
        await refused(
          db.articleRevision.create({
            data: {
              articleId: a.id,
              version: 2,
              status: 'published',
              snapshot: {},
              restoredFromVersion: 2,
            },
          }),
        ),
      ).toMatch(/article_revisions_restored_from_chk/);
      await db.articleRevision.create({
        data: {
          articleId: a.id,
          version: 2,
          status: 'published',
          snapshot: {},
          restoredFromVersion: 1,
        },
      });
      expect(
        await refused(db.articleCorrection.create({ data: { articleId: a.id, noteAr: '  ' } })),
      ).toMatch(/article_corrections_note_chk/);
      const c = await db.articleCorrection.create({
        data: { articleId: a.id, kind: 'correction', noteAr: 'تم تصحيح رقم.', revisionVersion: 2 },
      });
      expect(c.isPublic).toBe(true);
      await db.article.delete({ where: { id: a.id } });
      expect(await db.articleCorrection.count({ where: { id: c.id } })).toBe(0);
    });
  });

  describe('categories (reference seed)', () => {
    it('seeds the default categories with Arabic and English names', async () => {
      const rows = await db.category.findMany({
        where: { systemKey: { not: null } },
        include: { translations: true },
      });
      expect(rows.map((r) => r.systemKey).sort()).toEqual(
        DEFAULT_CATEGORIES.map((c) => c.systemKey).sort(),
      );
      for (const r of rows) {
        expect(r.isDemo).toBe(false);
        expect(r.translations.map((x) => x.locale).sort()).toEqual(['ar', 'en']);
      }
      const reviews = rows.find((r) => r.systemKey === 'reviews');
      expect(reviews?.defaultArticleType).toBe('review');
      expect(reviews?.translations.find((x) => x.locale === 'ar')?.name).toBe('مراجعات');
    });

    it('re-runs keep admin edits and only restore what is missing', async () => {
      const news = await db.category.findUniqueOrThrow({ where: { systemKey: 'news' } });
      await db.category.update({ where: { id: news.id }, data: { slug: 'akhbar' } });
      await db.categoryTranslation.update({
        where: { categoryId_locale: { categoryId: news.id, locale: 'ar' } },
        data: { name: 'آخر الأخبار' },
      });
      await db.categoryTranslation.delete({
        where: { categoryId_locale: { categoryId: news.id, locale: 'en' } },
      });
      const summary = await runReferenceSeed(db);
      expect(summary.categoriesAdded).toBe(0);
      expect(summary.categoryTranslationsAdded).toBe(1);
      const again = await db.category.findUniqueOrThrow({
        where: { systemKey: 'news' },
        include: { translations: true },
      });
      expect(again.slug).toBe('akhbar');
      expect(again.translations.find((x) => x.locale === 'ar')?.name).toBe('آخر الأخبار');
      expect(await db.category.count({ where: { slug: 'news' } })).toBe(0);
      expect(
        await refused(db.category.create({ data: { slug: slug('bad'), systemKey: 'Bad Key' } })),
      ).toMatch(/categories_system_key_chk/);
    });

    it('demo categories and tags are flagged', async () => {
      expect((await db.category.findUniqueOrThrow({ where: { id: I.category } })).isDemo).toBe(
        true,
      );
      expect((await db.tag.findUniqueOrThrow({ where: { id: I.tag } })).isDemo).toBe(true);
    });
  });

  describe('RSS feeds and items', () => {
    const feedData = () => ({
      name: 'Synthetic feed (e2e)',
      url: `https://feeds.example.invalid/${randomUUID()}.xml`,
    });

    it('anything beyond headline + link (or images) needs a recorded permission', async () => {
      for (const extra of [{ usagePolicy: 'summary_with_link' as const }, { allowImages: true }]) {
        expect(await refused(db.rssFeed.create({ data: { ...feedData(), ...extra } }))).toMatch(
          /rss_feeds_permission_chk/,
        );
      }
      expect(
        await refused(
          db.rssFeed.create({
            data: {
              ...feedData(),
              usagePolicy: 'full_content_licensed',
              permissionConfirmedAt: new Date(),
              permissionReference: '   ',
            },
          }),
        ),
      ).toMatch(/rss_feeds_permission_chk/);
      const f = await db.rssFeed.create({
        data: {
          ...feedData(),
          usagePolicy: 'summary_with_link',
          allowImages: true,
          permissionConfirmedAt: new Date(),
          permissionReference: 'Synthetic licence reference for tests',
          attributionText: 'Source: synthetic feed',
        },
      });
      expect(f.usagePolicy).toBe('summary_with_link');
      // A default feed stays the most restrictive.
      const d = await db.rssFeed.create({ data: feedData() });
      expect([d.usagePolicy, d.allowImages]).toEqual(['headline_link_only', false]);
    });

    it('de-duplicates by guid (per feed), canonical URL (global) and content hash', async () => {
      const f1 = await db.rssFeed.create({ data: feedData() });
      const f2 = await db.rssFeed.create({ data: feedData() });
      const item = (feedId: string, h: string, extra: Record<string, unknown> = {}) => ({
        feedId,
        url: `https://news.example.invalid/${h}`,
        urlHash: hex64(h),
        title: 'Synthetic headline',
        ...extra,
      });
      const first = await db.rssItem.create({
        data: item(f1.id, 'a', {
          guid: 'g1',
          guidHash: hex64('1'),
          contentHash: hex64('c'),
          feedCategories: ['EV'],
        }),
      });
      expect(
        await refused(
          db.rssItem.create({ data: item(f1.id, 'b', { guid: 'g1', guidHash: hex64('1') }) }),
        ),
      ).toMatch(/Unique constraint|guid_hash/);
      // Same guid in another feed is a different item.
      await db.rssItem.create({ data: item(f2.id, 'b', { guid: 'g1', guidHash: hex64('1') }) });
      expect(await refused(db.rssItem.create({ data: item(f2.id, 'a') }))).toMatch(
        /Unique constraint|url_hash/,
      );
      const dup = await db.rssItem.create({
        data: item(f2.id, 'd', {
          contentHash: hex64('c'),
          status: 'duplicate',
          duplicateOfId: first.id,
        }),
      });
      expect(
        (await db.rssItem.findMany({ where: { contentHash: hex64('c') } })).map((x) => x.id).sort(),
      ).toEqual([first.id, dup.id].sort());
      expect(await refused(db.rssItem.create({ data: item(f1.id, 'E') }))).toMatch(
        /rss_items_hashes_chk/,
      );
      expect(
        await refused(db.rssItem.create({ data: item(f1.id, 'e', { guid: 'no-hash' }) })),
      ).toMatch(/rss_items_hashes_chk/);
      expect(
        await refused(
          db.rssItem.create({ data: item(f1.id, 'f', { url: 'javascript:alert(1)' }) }),
        ),
      ).toMatch(/rss_items_urls_chk/);
    });
  });

  describe('catalog gallery', () => {
    async function asset() {
      return db.mediaAsset.create({
        data: {
          kind: 'image',
          storageDriver: 'local',
          storageKey: `public/test/${randomUUID()}.jpg`,
          isDemo: true,
        },
      });
    }

    it('attaches to exactly one of model / generation / variant, one cover each', async () => {
      const a = await asset();
      const g = await db.vehicleMedia.create({
        data: { generationId: I.generation, assetId: a.id, kind: 'exterior', isCover: true },
      });
      expect(g.kind).toBe('exterior');
      expect(
        await refused(
          db.vehicleMedia.create({
            data: { generationId: I.generation, variantId: I.variantBev, assetId: a.id },
          }),
        ),
      ).toMatch(/vehicle_media_target_chk/);
      expect(
        await refused(
          db.vehicleMedia.create({
            data: { generationId: I.generation, assetId: (await asset()).id, isCover: true },
          }),
        ),
      ).toMatch(/vehicle_media_one_cover_generation_uq|Unique constraint/);
      await db.vehicleMedia.create({
        data: { variantId: I.variantBev, assetId: (await asset()).id, isCover: true },
      });
      await db.vehicleMedia.create({
        data: { generationId: I.generation, assetId: (await asset()).id },
      });
    });
  });

  describe('comparisons', () => {
    const two = [
      { variantId: I.variantBev, marketCode: 'EG', position: 1 },
      { variantId: I.variantPhev, marketCode: 'EG', position: 2 },
    ];
    const shareId = () => `t${randomUUID().replace(/-/g, '').slice(0, 12)}`;

    it('needs 2 to 4 items, checked when the transaction commits', async () => {
      const c = await db.comparison.create({
        data: { shareId: shareId(), marketCode: 'EG', items: { create: two } },
        include: { items: true },
      });
      expect(c.items).toHaveLength(2);
      const err = await refusal(
        db.comparison.create({
          data: { shareId: shareId(), marketCode: 'EG', items: { create: [two[0]] } },
        }),
      );
      expect(String((err as Error).message)).toMatch(/comparisons_item_count_chk/);
      expect(fromPostgresCode(err as Prisma.PrismaClientKnownRequestError)).toMatchObject({
        status: 422,
        details: { constraint: 'comparisons_item_count_chk' },
      });
      expect(
        await refused(db.comparison.create({ data: { shareId: shareId(), marketCode: 'EG' } })),
      ).toMatch(/comparisons_item_count_chk/);
      // Removing an item below 2 is refused; replacing items in one transaction works.
      expect(await refused(db.comparisonItem.delete({ where: { id: c.items[1].id } }))).toMatch(
        /comparisons_item_count_chk/,
      );
      await db.$transaction([
        db.comparisonItem.deleteMany({ where: { comparisonId: c.id } }),
        db.comparisonItem.createMany({
          data: [
            { comparisonId: c.id, variantId: I.variantPhev, marketCode: 'EG', position: 1 },
            { comparisonId: c.id, variantId: I.variantBev, marketCode: 'EG', position: 2 },
          ],
        }),
      ]);
      expect(
        await refused(
          db.comparisonItem.create({
            data: { comparisonId: c.id, variantId: I.variantBev, marketCode: 'EG', position: 5 },
          }),
        ),
      ).toMatch(/comparison_items_position_chk/);
      // Deleting the comparison deletes its items without tripping the rule.
      await db.comparison.delete({ where: { id: c.id } });
      expect(await db.comparisonItem.count({ where: { comparisonId: c.id } })).toBe(0);
    });

    it('an item pins a variant in a market where it has a record', async () => {
      // The demo variants only have an EG record.
      expect(
        await refused(
          db.comparison.create({
            data: {
              shareId: shareId(),
              marketCode: 'SA',
              items: {
                create: [
                  { variantId: I.variantBev, marketCode: 'SA', position: 1 },
                  { variantId: I.variantPhev, marketCode: 'EG', position: 2 },
                ],
              },
            },
          }),
        ),
      ).toMatch(/Foreign key|comparison_items_variant_id_market_code_fkey/);
      // ...and the variant × market record cannot be deleted while compared.
      await db.comparison.create({
        data: { shareId: shareId(), marketCode: 'EG', items: { create: two } },
      });
      expect(
        await refused(
          db.variantMarket.delete({
            where: { variantId_marketCode: { variantId: I.variantPhev, marketCode: 'EG' } },
          }),
        ),
      ).toMatch(/Foreign key|foreign key|violates/);
    });

    it('curated comparisons have no owner and bilingual titles when published', async () => {
      const user = await db.user.create({
        data: { email: `cmp-${randomUUID()}@example.test`, displayName: 'Comparison owner' },
      });
      const curated = { isCurated: true, curatedStatus: 'published' as const };
      expect(
        await refused(
          db.comparison.create({
            data: { shareId: shareId(), marketCode: 'EG', ...curated, items: { create: two } },
          }),
        ),
      ).toMatch(/comparisons_curated_titles_chk/);
      expect(
        await refused(
          db.comparison.create({
            data: {
              shareId: shareId(),
              marketCode: 'EG',
              ...curated,
              titleAr: 'عنوان',
              titleEn: 'Title',
              userId: user.id,
              items: { create: two },
            },
          }),
        ),
      ).toMatch(/comparisons_curated_owner_chk/);
      expect(
        await refused(
          db.comparison.create({
            data: { shareId: shareId(), marketCode: 'EG', curatedOrder: 1, items: { create: two } },
          }),
        ),
      ).toMatch(/comparisons_curated_fields_chk/);
      // A saved (owned) comparison with a share signature; view counter.
      const saved = await db.comparison.create({
        data: {
          shareId: shareId(),
          marketCode: 'EG',
          userId: user.id,
          signature: hex64('e'),
          items: { create: two },
        },
      });
      await db.comparison.update({
        where: { id: saved.id },
        data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
      });
      expect(
        await refused(db.comparison.update({ where: { id: saved.id }, data: { viewCount: -1 } })),
      ).toMatch(/comparisons_view_count_chk/);
      expect(
        await refused(
          db.comparison.create({
            data: { shareId: 'bad id!', marketCode: 'EG', items: { create: two } },
          }),
        ),
      ).toMatch(/comparisons_share_id_chk/);
      // Deleting the user deletes their saved comparisons (personal data).
      await db.user.delete({ where: { id: user.id } });
      expect(await db.comparison.count({ where: { id: saved.id } })).toBe(0);
    });

    it('the demo seed adds one labelled, curated demo comparison', async () => {
      const c = await db.comparison.findUniqueOrThrow({
        where: { id: I.comparison },
        include: { items: { orderBy: { position: 'asc' } } },
      });
      expect(c).toMatchObject({ isDemo: true, isCurated: true, curatedStatus: 'published' });
      expect(c.titleEn).toContain('[DEMO]');
      expect(c.titleAr).toContain('[تجريبي]');
      expect(c.items.map((x) => x.variantId)).toEqual([I.variantBev, I.variantPhev]);
    });
  });

  describe('search and analytics', () => {
    it('search.manage is granted to content reviewers and vehicle data managers', async () => {
      const holders = await db.role.findMany({
        where: { permissions: { some: { permission: { key: 'search.manage' } } } },
        select: { key: true },
      });
      expect(holders.map((r) => r.key).sort()).toEqual(
        ['admin', 'content_reviewer', 'owner', 'vehicle_data_manager'].sort(),
      );
    });

    it('a document can be visible in several markets (empty = all)', async () => {
      const doc = (marketCodes: string[]) =>
        db.searchDocument.create({
          data: {
            entityType: 'article',
            entityId: randomUUID(),
            locale: 'en',
            title: `Marketfilter probe ${marketCodes.join(' ')}`,
            marketCodes,
            isPublished: true,
          },
        });
      const egSa = await doc(['EG', 'SA']);
      const all = await doc([]);
      const visibleIn = async (market: string) =>
        (
          await db.$queryRaw<{ id: string }[]>`
            SELECT id::text FROM search_documents
            WHERE normalized_title LIKE 'marketfilter probe%'
              AND (cardinality(market_codes) = 0 OR ${market} = ANY(market_codes))`
        )
          .map((r) => r.id)
          .sort();
      expect(await visibleIn('EG')).toEqual([egSa.id, all.id].sort());
      expect(await visibleIn('AE')).toEqual([all.id]);
      expect(await refused(doc(['eg']))).toMatch(/search_documents_market_codes_chk/);
    });

    it('seeded aliases are system rows, active, and cover the phase 2 spellings', async () => {
      expect(await db.searchAlias.count({ where: { isSystem: true } })).toBe(SEARCH_ALIASES.length);
      const lucid = await db.searchAlias.findFirstOrThrow({ where: { term: 'لوسيد' } });
      expect(lucid).toMatchObject({
        canonical: 'Lucid',
        canonicalNormalized: 'lucid',
        isActive: true,
      });
      // Deactivated aliases survive re-seeding as they are.
      await db.searchAlias.update({ where: { id: lucid.id }, data: { isActive: false } });
      await runReferenceSeed(db);
      expect((await db.searchAlias.findUniqueOrThrow({ where: { id: lucid.id } })).isActive).toBe(
        false,
      );
      expect(
        await refused(
          db.searchAlias.create({ data: { term: 'x1', canonical: 'X', entityType: 'brand' } }),
        ),
      ).toMatch(/search_aliases_entity_chk/);
    });

    it('daily counters take known entity types and increment atomically', async () => {
      const id = randomUUID();
      for (let i = 0; i < 3; i += 1) {
        await db.$executeRaw`
          INSERT INTO content_daily_stats (id, entity_type, entity_id, day, views)
          VALUES (gen_random_uuid(), 'article', ${id}::uuid, CURRENT_DATE, 1)
          ON CONFLICT (entity_type, entity_id, day) DO UPDATE
            SET views = content_daily_stats.views + 1`;
      }
      const row = await db.contentDailyStat.findFirstOrThrow({ where: { entityId: id } });
      expect(row.views).toBe(3);
      expect(
        await refused(
          db.contentDailyStat.create({
            data: { entityType: 'user', entityId: randomUUID(), day: new Date() },
          }),
        ),
      ).toMatch(/content_daily_stats_entity_type_chk/);
    });
  });
});
