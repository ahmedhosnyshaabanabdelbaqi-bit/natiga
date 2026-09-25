import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { SettingsService } from '../../settings';
import { toCategoryRef } from '../../categories/categories.service';
import { toTagRef } from '../../tags/tags.service';
import { isServableTranslation } from '../common/visibility';
import { readingMinutes } from '../domain/article-html';
import { toDateOnly } from '../domain/article-snapshot';
import type { PublicArticleSummaryDto } from '../dto/public-article.dto';
import type { ArticleListRow } from './article-includes';
import { ArticleMediaService } from './article-media.service';

export type ShareUrlBuilder = (slug: string) => string;

type TranslationLike = {
  locale: string;
  title: string;
  summary: string | null;
  bodyText: string | null;
  isMachineTranslated: boolean;
  humanReviewedAt: Date | null;
};

/**
 * Chooses the text served to a reader: the requested language when a
 * servable text exists, else the original language (then any servable
 * text). Unreviewed machine translations are never served.
 */
export function chooseTranslation<T extends TranslationLike>(
  translations: readonly T[],
  requested: SupportedLanguage,
  originalLanguage: string,
): { served: T; available: string[] } | null {
  const servable = translations.filter(isServableTranslation);
  if (servable.length === 0) return null;
  const served =
    servable.find((t) => t.locale === requested) ??
    servable.find((t) => t.locale === originalLanguage) ??
    servable[0];
  return { served, available: servable.map((t) => t.locale).sort() };
}

/** Maps article rows to the public DTOs (shared by list, detail, related, preview). */
@Injectable()
export class ArticlePresenter {
  constructor(
    private readonly settings: SettingsService,
    readonly media: ArticleMediaService,
  ) {}

  /** https://evcar.news/n/<slug> (base URL and path template from settings.share). */
  async shareUrlBuilder(): Promise<ShareUrlBuilder> {
    const share = await this.settings.get('share');
    const base = share.baseUrl.replace(/\/+$/, '');
    const template = share.paths?.article ?? '/n/{slug}';
    return (slug) => `${base}${template.replace('{slug}', encodeURIComponent(slug))}`;
  }

  toPublicSummary(
    row: ArticleListRow,
    lang: SupportedLanguage,
    shareUrl: ShareUrlBuilder,
    opts: { includeUnservable?: boolean } = {},
  ): PublicArticleSummaryDto | null {
    const chosen = opts.includeUnservable
      ? chooseAny(row.translations, lang, row.originalLanguage)
      : chooseTranslation(row.translations, lang, row.originalLanguage);
    if (!chosen) return null;
    const t = chosen.served;
    return {
      id: row.id,
      slug: row.slug,
      type: row.type,
      title: t.title,
      summary: t.summary,
      language: t.locale,
      requestedLanguage: lang,
      isFallback: t.locale !== lang,
      availableLanguages: chosen.available,
      category: row.category ? toCategoryRef(row.category, lang) : null,
      tags: row.tags.map((x) => toTagRef(x.tag, lang)),
      coverImage: this.media.toView(row.coverAsset, t.locale === 'en' ? 'en' : 'ar'),
      author: authorOf(row),
      publishedAt: (row.publishedAt ?? row.scheduledAt ?? row.updatedAt).toISOString(),
      contentUpdatedAt: row.contentUpdatedAt?.toISOString() ?? null,
      eventDate: toDateOnly(row.eventDate),
      readingMinutes: readingMinutes(t.bodyText ?? ''),
      isFeatured: row.isFeatured,
      isSponsored: row.isSponsored,
      sponsorName: row.sponsorName,
      isDemo: row.isDemo,
      marketCodes: row.markets.map((m) => m.marketCode).sort(),
      shareUrl: shareUrl(row.slug),
    };
  }
}

function chooseAny<T extends TranslationLike>(
  translations: readonly T[],
  requested: SupportedLanguage,
  originalLanguage: string,
): { served: T; available: string[] } | null {
  if (translations.length === 0) return null;
  const served =
    translations.find((t) => t.locale === requested) ??
    translations.find((t) => t.locale === originalLanguage) ??
    translations[0];
  return { served, available: translations.map((t) => t.locale).sort() };
}

export function authorOf(row: {
  authorName: string | null;
  author: { id: string; displayName: string } | null;
}): { name: string } | null {
  const name = row.authorName?.trim() || row.author?.displayName?.trim();
  return name ? { name } : null;
}
