import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { SupportedLanguage } from '../../config/app-config';
import { PrismaService } from '../../prisma/prisma.service';
import { serverMessageText } from '../i18n/server-messages';
import { pick } from '../stations/common/values';
import { NotificationService, type NotifyResult } from './notification.service';

/** Event name emitted by the articles module (ArticlesAdminService). */
export const ARTICLE_PUBLISHED = 'article.published';

interface ArticleStatusEvent {
  articleId: string;
  slug: string;
}

type Named = { ar: string | null; en: string | null };

const TOPIC_KEY = {
  variant: 'variantId',
  model: 'modelId',
  brand: 'brandId',
  category: 'categoryId',
} as const;

/**
 * Article published → notify the users who FOLLOW (notification
 * subscriptions) one of its linked variants / models / brands or its
 * category, in the article's markets. Each user gets one notification
 * (dedupe `article.published:<id>`, so re-publishing never repeats it), with
 * the most specific subject they follow. Demo or unpublished articles notify
 * nobody.
 */
@Injectable()
export class ArticlePublishedListener {
  private readonly logger = new Logger(ArticlePublishedListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  @OnEvent(ARTICLE_PUBLISHED, { async: true, promisify: true })
  async onPublished(event: ArticleStatusEvent): Promise<NotifyResult | null> {
    try {
      return await this.handle(event.articleId);
    } catch (err) {
      this.logger.warn(
        `article.published notifications failed for ${event.articleId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async handle(articleId: string): Promise<NotifyResult | null> {
    const a = await this.prisma.article.findFirst({
      where: { id: articleId, status: 'published', deletedAt: null, isDemo: false },
      select: {
        id: true,
        slug: true,
        originalLanguage: true,
        categoryId: true,
        translations: { select: { locale: true, title: true } },
        markets: { select: { marketCode: true } },
        category: { select: { translations: { select: { locale: true, name: true } } } },
        vehicleLinks: {
          select: {
            brand: { select: { id: true, nameAr: true, nameEn: true } },
            model: {
              select: {
                id: true,
                nameAr: true,
                nameEn: true,
                brand: { select: { id: true, nameAr: true, nameEn: true } },
              },
            },
            variant: {
              select: {
                id: true,
                nameAr: true,
                nameEn: true,
                modelYear: {
                  select: {
                    year: true,
                    generation: {
                      select: {
                        model: {
                          select: {
                            id: true,
                            nameAr: true,
                            nameEn: true,
                            brand: { select: { id: true, nameAr: true, nameEn: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!a) return null;

    // Subjects, most specific first: variant → model → brand → category.
    const subjects: {
      topic: 'variant' | 'model' | 'brand' | 'category';
      id: string;
      name: Named;
    }[] = [];
    const add = (topic: (typeof subjects)[number]['topic'], id: string, name: Named) => {
      if (!subjects.some((s) => s.topic === topic && s.id === id))
        subjects.push({ topic, id, name });
    };
    const both = (x: { nameAr: string; nameEn: string }): Named => ({ ar: x.nameAr, en: x.nameEn });
    for (const l of a.vehicleLinks) {
      if (l.variant) {
        const m = l.variant.modelYear.generation.model;
        add('variant', l.variant.id, {
          ar: `${m.nameAr} ${l.variant.modelYear.year} ${l.variant.nameAr}`,
          en: `${m.nameEn} ${l.variant.modelYear.year} ${l.variant.nameEn}`,
        });
      }
    }
    for (const l of a.vehicleLinks) {
      const m = l.model ?? l.variant?.modelYear.generation.model;
      if (m)
        add('model', m.id, {
          ar: `${m.brand.nameAr} ${m.nameAr}`,
          en: `${m.brand.nameEn} ${m.nameEn}`,
        });
    }
    for (const l of a.vehicleLinks) {
      const b = l.brand ?? l.model?.brand ?? l.variant?.modelYear.generation.model.brand;
      if (b) add('brand', b.id, both(b));
    }
    if (a.categoryId && a.category) {
      const tr = a.category.translations;
      add('category', a.categoryId, {
        ar: tr.find((x) => x.locale === 'ar')?.name ?? null,
        en: tr.find((x) => x.locale === 'en')?.name ?? null,
      });
    }
    if (!subjects.length) return null;

    const markets = a.markets.map((m) => m.marketCode);
    const subs = await this.prisma.notificationSubscription.findMany({
      where: {
        OR: subjects.map((s) => ({ topicType: s.topic, [`${s.topic}Id`]: s.id })),
        ...(markets.length
          ? { AND: [{ OR: [{ marketCode: null }, { marketCode: { in: markets } }] }] }
          : {}),
      },
      select: {
        userId: true,
        topicType: true,
        brandId: true,
        modelId: true,
        variantId: true,
        categoryId: true,
      },
    });
    if (!subs.length) return null;

    const titleOf = (lang: SupportedLanguage) =>
      a.translations.find((t) => t.locale === lang)?.title ??
      a.translations.find((t) => t.locale === a.originalLanguage)?.title ??
      a.translations[0]?.title ??
      '';

    const total: NotifyResult = {
      created: 0,
      duplicates: 0,
      skippedByPreference: 0,
      push: { queued: 0, scheduledForQuietHours: 0, skippedNotConfigured: 0 },
    };
    const done = new Set<string>();
    for (const s of subjects) {
      const key = TOPIC_KEY[s.topic];
      const users = [
        ...new Set(
          subs.filter((x) => x.topicType === s.topic && x[key] === s.id).map((x) => x.userId),
        ),
      ].filter((u) => !done.has(u));
      if (!users.length) continue;
      users.forEach((u) => done.add(u));
      const content = (lang: SupportedLanguage) => ({
        title:
          serverMessageText('notifications.article_published.title', lang, {
            subject: pick(lang, s.name.ar, s.name.en) ?? '',
          }) ?? titleOf(lang),
        body:
          serverMessageText('notifications.article_published.body', lang, {
            title: titleOf(lang),
          }) ?? titleOf(lang),
      });
      const r = await this.notifications.notify({
        userIds: users,
        type: 'article.published',
        category: 'news',
        dedupeKey: `article.published:${a.id}`,
        content: { ar: content('ar'), en: content('en') },
        deepLink: `/news/${encodeURIComponent(a.slug)}`,
        data: { articleId: a.id, slug: a.slug, topic: s.topic, topicId: s.id },
      });
      total.created += r.created;
      total.duplicates += r.duplicates;
      total.skippedByPreference += r.skippedByPreference;
      total.push.queued += r.push.queued;
      total.push.scheduledForQuietHours += r.push.scheduledForQuietHours;
      total.push.skippedNotConfigured += r.push.skippedNotConfigured;
    }
    return total;
  }
}
