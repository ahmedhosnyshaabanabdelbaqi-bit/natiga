import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { ContentStatus, FavoriteTargetType } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { SERVABLE_TRANSLATION_WHERE, visibleArticleWhere } from '../../articles/common/visibility';
import { publicTourWhere } from '../../tours';
import {
  IMAGE_ASSET_INCLUDE,
  MediaUrlService,
  PUBLIC_MODEL_WHERE,
  PUBLIC_VARIANT_WHERE,
} from '../../vehicles';

export const FAVORITE_TYPES = Object.values(FavoriteTargetType) as FavoriteTargetType[];

/** favorites column holding the target id of each type. */
export const TARGET_COLUMN = {
  article: 'articleId',
  model: 'modelId',
  variant: 'variantId',
  station: 'stationId',
  comparison: 'comparisonId',
  tour: 'tourId',
} as const satisfies Record<FavoriteTargetType, string>;

export interface TargetInfo {
  /** Currently visible to this user (published / own comparison). */
  available: boolean;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  slug: string | null;
  shareId: string | null;
  isDemo: boolean;
}

const pick = (
  lang: SupportedLanguage,
  ar: string | null | undefined,
  en: string | null | undefined,
) => (lang === 'ar' ? (ar ?? en) : (en ?? ar)) ?? null;

/**
 * Resolves favorite targets of every type: existence, public visibility for
 * this user and the display fields of a favorites list row. Read-only.
 */
@Injectable()
export class FavoriteTargetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrlService,
  ) {}

  async resolve(
    type: FavoriteTargetType,
    ids: string[],
    userId: string,
    lang: SupportedLanguage,
  ): Promise<Map<string, TargetInfo>> {
    const out = new Map<string, TargetInfo>();
    if (ids.length === 0) return out;
    const unique = [...new Set(ids)];
    switch (type) {
      case 'article': {
        const [rows, visible] = await Promise.all([
          this.prisma.article.findMany({
            where: { id: { in: unique } },
            select: {
              id: true,
              slug: true,
              isDemo: true,
              coverAsset: { include: IMAGE_ASSET_INCLUDE },
              translations: {
                where: SERVABLE_TRANSLATION_WHERE,
                select: { locale: true, title: true, summary: true },
              },
            },
          }),
          this.prisma.article.findMany({
            where: { id: { in: unique }, ...visibleArticleWhere(null) },
            select: { id: true },
          }),
        ]);
        const vis = new Set(visible.map((v) => v.id));
        for (const a of rows) {
          const t = a.translations.find((x) => x.locale === lang) ?? a.translations[0] ?? null;
          out.set(a.id, {
            available: vis.has(a.id) && !!t,
            title: t?.title ?? a.slug,
            subtitle: t?.summary ?? null,
            imageUrl: this.media.image(a.coverAsset, lang)?.url ?? null,
            slug: a.slug,
            shareId: null,
            isDemo: a.isDemo,
          });
        }
        break;
      }
      case 'model': {
        const [rows, visible] = await Promise.all([
          this.prisma.carModel.findMany({
            where: { id: { in: unique } },
            select: {
              id: true,
              slug: true,
              nameAr: true,
              nameEn: true,
              isDemo: true,
              heroAsset: { include: IMAGE_ASSET_INCLUDE },
              brand: { select: { nameAr: true, nameEn: true } },
            },
          }),
          this.prisma.carModel.findMany({
            where: { id: { in: unique }, ...PUBLIC_MODEL_WHERE },
            select: { id: true },
          }),
        ]);
        const vis = new Set(visible.map((v) => v.id));
        for (const m of rows) {
          const brand = pick(lang, m.brand.nameAr, m.brand.nameEn);
          out.set(m.id, {
            available: vis.has(m.id),
            title: [brand, pick(lang, m.nameAr, m.nameEn)].filter(Boolean).join(' '),
            subtitle: brand,
            imageUrl: this.media.image(m.heroAsset, lang)?.url ?? null,
            slug: m.slug,
            shareId: null,
            isDemo: m.isDemo,
          });
        }
        break;
      }
      case 'variant': {
        const [rows, visible] = await Promise.all([
          this.prisma.vehicleVariant.findMany({
            where: { id: { in: unique } },
            select: {
              id: true,
              slug: true,
              nameAr: true,
              nameEn: true,
              isDemo: true,
              modelYear: {
                select: {
                  year: true,
                  generation: {
                    select: {
                      model: {
                        select: {
                          nameAr: true,
                          nameEn: true,
                          heroAsset: { include: IMAGE_ASSET_INCLUDE },
                          brand: { select: { nameAr: true, nameEn: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          }),
          this.prisma.vehicleVariant.findMany({
            where: { id: { in: unique }, ...PUBLIC_VARIANT_WHERE },
            select: { id: true },
          }),
        ]);
        const vis = new Set(visible.map((v) => v.id));
        for (const v of rows) {
          const model = v.modelYear.generation.model;
          const title = [
            pick(lang, model.brand.nameAr, model.brand.nameEn),
            pick(lang, model.nameAr, model.nameEn),
            pick(lang, v.nameAr, v.nameEn),
          ]
            .filter(Boolean)
            .join(' ');
          out.set(v.id, {
            available: vis.has(v.id),
            title,
            subtitle: String(v.modelYear.year),
            imageUrl: this.media.image(model.heroAsset, lang)?.url ?? null,
            slug: v.slug,
            shareId: null,
            isDemo: v.isDemo,
          });
        }
        break;
      }
      case 'station': {
        const rows = await this.prisma.chargingStation.findMany({
          where: { id: { in: unique } },
          select: {
            id: true,
            slug: true,
            name: true,
            nameAr: true,
            nameEn: true,
            city: true,
            isDemo: true,
            publicationStatus: true,
            deletedAt: true,
            duplicateOfId: true,
          },
        });
        for (const s of rows) {
          out.set(s.id, {
            available:
              s.publicationStatus === 'published' &&
              s.deletedAt === null &&
              s.duplicateOfId === null,
            title: pick(lang, s.nameAr, s.nameEn) ?? s.name,
            subtitle: s.city,
            imageUrl: null,
            slug: s.slug,
            shareId: null,
            isDemo: s.isDemo,
          });
        }
        break;
      }
      case 'comparison': {
        const rows = await this.prisma.comparison.findMany({
          where: { id: { in: unique } },
          select: {
            id: true,
            shareId: true,
            userId: true,
            title: true,
            titleAr: true,
            titleEn: true,
            isCurated: true,
            curatedStatus: true,
            isDemo: true,
            _count: { select: { items: true } },
          },
        });
        for (const c of rows) {
          const allowed = c.isCurated
            ? c.curatedStatus === ContentStatus.published
            : c.userId === null || c.userId === userId;
          // Never expose another user's private label.
          const title =
            (c.isCurated
              ? pick(lang, c.titleAr, c.titleEn)
              : c.userId === userId
                ? c.title
                : null) ??
            (lang === 'ar'
              ? `مقارنة ${c._count.items} سيارات`
              : `Comparison of ${c._count.items} cars`);
          out.set(c.id, {
            available: allowed,
            title,
            subtitle: null,
            imageUrl: null,
            slug: null,
            shareId: allowed ? c.shareId : null,
            isDemo: c.isDemo,
          });
        }
        break;
      }
      case 'tour': {
        const [rows, visible] = await Promise.all([
          this.prisma.interiorTour.findMany({
            where: { id: { in: unique } },
            select: {
              id: true,
              slug: true,
              titleAr: true,
              titleEn: true,
              interiorColorNameAr: true,
              interiorColorNameEn: true,
              isDemo: true,
            },
          }),
          this.prisma.interiorTour.findMany({
            where: { id: { in: unique }, ...publicTourWhere() },
            select: { id: true },
          }),
        ]);
        const vis = new Set(visible.map((v) => v.id));
        for (const t of rows) {
          out.set(t.id, {
            available: vis.has(t.id),
            title: pick(lang, t.titleAr, t.titleEn) ?? t.slug,
            subtitle: pick(lang, t.interiorColorNameAr, t.interiorColorNameEn),
            imageUrl: null,
            slug: t.slug,
            shareId: null,
            isDemo: t.isDemo,
          });
        }
        break;
      }
    }
    return out;
  }
}
