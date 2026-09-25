import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { toPageRequest } from '../../../common/http/pagination';
import { paginated, type PaginatedResponse } from '../../../common/http/responses';
import { Prisma } from '../../../generated/prisma/client';
import {
  AssetVariantKind,
  ContentStatus,
  HotspotType,
  MediaStatus,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { creditLine, isAllowedEmbedUrl, MediaUrls, metadataOf, todayUtc } from '../../media';
import { pointsByKey, PUBLIC_VARIANT_WHERE } from '../../vehicles';
import { DEMO_TOUR_LABEL, nameIn, positionLabel, textIn } from '../domain/labels';
import type {
  PublicTourCardDto,
  PublicTourDetailDto,
  PublicTourListQueryDto,
  TourAttributionLineDto,
  TourHotspotDto,
  TourRenditionDto,
  TourSceneDto,
} from '../dto/public-tour.dto';
import { TourErrors } from '../tours-errors';

const DEFAULT_MAX_WIDTH = 4096;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A file that must not be shown: deleted, unprocessed, unlicensed or licence not valid today. */
function unusableAsset(today: Date): Prisma.MediaAssetWhereInput {
  return {
    OR: [
      { deletedAt: { not: null } },
      { status: { not: MediaStatus.ready } },
      { licenseId: null },
      { license: { validUntil: { lt: today } } },
      { license: { validFrom: { gt: today } } },
    ],
  };
}

/**
 * Published, not deleted, of a public trim, and every scene panorama and
 * hotspot file usable today (licence dates are time-dependent, so they are
 * checked here in addition to the database publishing rules).
 */
export function publicTourWhere(today: Date = todayUtc()): Prisma.InteriorTourWhereInput {
  const bad = unusableAsset(today);
  return {
    status: ContentStatus.published,
    deletedAt: null,
    initialSceneId: { not: null },
    variant: PUBLIC_VARIANT_WHERE,
    scenes: {
      some: {},
      none: { OR: [{ asset: bad }, { hotspots: { some: { mediaAsset: bad } } }] },
    },
  };
}

const PREVIEW_ONLY = {
  variants: {
    where: { kind: AssetVariantKind.preview },
    select: { kind: true, storageKey: true },
    take: 1,
  },
} satisfies Prisma.MediaAssetSelect;

const CARD_INCLUDE = {
  variant: {
    select: {
      id: true,
      slug: true,
      nameAr: true,
      nameEn: true,
      modelYearId: true,
      modelYear: {
        select: {
          year: true,
          generation: {
            select: {
              model: {
                select: {
                  slug: true,
                  nameAr: true,
                  nameEn: true,
                  brand: { select: { nameAr: true, nameEn: true } },
                },
              },
            },
          },
        },
      },
    },
  },
  referenceVariant: { select: { nameAr: true, nameEn: true } },
  scenes: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      key: true,
      position: true,
      titleAr: true,
      titleEn: true,
      asset: { select: PREVIEW_ONLY },
    },
  },
} satisfies Prisma.InteriorTourInclude;

type CardRow = Prisma.InteriorTourGetPayload<{ include: typeof CARD_INCLUDE }>;

const FILE_ASSET_INCLUDE = {
  license: true,
  variants: {
    where: {
      kind: {
        in: [AssetVariantKind.preview, AssetVariantKind.rendition, AssetVariantKind.thumbnail],
      },
    },
    orderBy: [{ width: 'asc' }, { label: 'asc' }],
  },
} satisfies Prisma.MediaAssetInclude;

const DETAIL_INCLUDE = {
  ...CARD_INCLUDE,
  scenes: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      asset: { include: FILE_ASSET_INCLUDE },
      hotspots: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          translations: true,
          mediaAsset: { include: FILE_ASSET_INCLUDE },
          spec: { select: { key: true, labelAr: true, labelEn: true, unit: true } },
        },
      },
    },
  },
} satisfies Prisma.InteriorTourInclude;

type FileAsset = Prisma.MediaAssetGetPayload<{ include: typeof FILE_ASSET_INCLUDE }>;

const num = (d: Prisma.Decimal | number | null | undefined): number | null =>
  d === null || d === undefined ? null : Number(d);

/**
 * Public side of 360° interior tours used by the apps (contract:
 * docs/decisions/backend-tours.md §1): list per trim / model year in the
 * request market, the home "featured" strip and the full viewer config
 * (preview first, device-appropriate renditions, Pannellum multires tiles,
 * localized plain-text hotspots, attribution, demo and reference labels).
 */
@Injectable()
export class ToursPublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly urls: MediaUrls,
  ) {}

  card(t: CardRow, lang: SupportedLanguage): PublicTourCardDto {
    const v = t.variant;
    const model = v.modelYear.generation.model;
    const brandName = nameIn(lang, model.brand.nameAr, model.brand.nameEn);
    const modelName = nameIn(lang, model.nameAr, model.nameEn);
    const variantName = nameIn(lang, v.nameAr, v.nameEn);
    const initial = t.scenes.find((s) => s.id === t.initialSceneId) ?? t.scenes[0];
    const reference = t.matchType === 'reference_similar_trim';
    return {
      id: t.id,
      slug: t.slug,
      title: textIn(lang, t.titleAr, t.titleEn),
      variantId: v.id,
      variantSlug: v.slug,
      variantName,
      carName: [brandName, modelName, variantName].filter(Boolean).join(' '),
      brandName,
      modelName,
      modelSlug: model.slug,
      modelYearId: v.modelYearId,
      modelYear: v.modelYear.year,
      marketCode: t.marketCode,
      driveSide: t.driveSide,
      interiorColorName: nameIn(lang, t.interiorColorNameAr, t.interiorColorNameEn),
      interiorColorHex: t.interiorColorHex,
      seatScenes: t.scenes.map((s) => ({
        id: s.id,
        key: s.key,
        position: s.position,
        title: textIn(lang, s.titleAr, s.titleEn) ?? positionLabel(s.position, lang),
      })),
      sceneCount: t.scenes.length,
      isReferenceForSimilarTrim: reference,
      differenceNote: reference ? textIn(lang, t.differenceNoteAr, t.differenceNoteEn) : null,
      referenceVariantName:
        reference && t.referenceVariant
          ? nameIn(lang, t.referenceVariant.nameAr, t.referenceVariant.nameEn)
          : null,
      previewUrl: this.urls.publicUrl(
        initial?.asset.variants.find((v) => v.kind === AssetVariantKind.preview)?.storageKey,
      ),
      isDemo: t.isDemo,
      demoLabel: t.isDemo ? DEMO_TOUR_LABEL[lang] : null,
      publishedAt: (t.publishedAt ?? t.updatedAt).toISOString(),
    };
  }

  async list(
    query: PublicTourListQueryDto,
    market: string,
    lang: SupportedLanguage,
  ): Promise<PaginatedResponse<PublicTourCardDto>> {
    const page = toPageRequest(query);
    const where: Prisma.InteriorTourWhereInput = {
      ...publicTourWhere(),
      marketCode: market,
      ...(query.variantId ? { variantId: query.variantId } : {}),
    };
    if (query.modelYearId) {
      where.AND = [{ variant: { modelYearId: query.modelYearId } }];
    }
    const [rows, total] = await Promise.all([
      this.prisma.interiorTour.findMany({
        where,
        include: CARD_INCLUDE,
        orderBy: [{ matchType: 'asc' }, { publishedAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.interiorTour.count({ where }),
    ]);
    return paginated(
      rows.map((r) => this.card(r, lang)),
      total,
      page,
    );
  }

  async featured(
    limit: number,
    market: string,
    lang: SupportedLanguage,
  ): Promise<PublicTourCardDto[]> {
    const rows = await this.prisma.interiorTour.findMany({
      where: { ...publicTourWhere(), marketCode: market },
      include: CARD_INCLUDE,
      orderBy: [{ isDemo: 'asc' }, { publishedAt: 'desc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map((r) => this.card(r, lang));
  }

  private image(a: FileAsset, lang: SupportedLanguage) {
    const sizes = a.variants
      .filter((v) => v.kind === AssetVariantKind.rendition || v.kind === AssetVariantKind.thumbnail)
      .map((v) => ({ url: this.urls.publicUrl(v.storageKey), width: v.width, height: v.height }))
      .filter((v): v is { url: string; width: number | null; height: number | null } => !!v.url);
    const main = [...sizes].reverse().find((s) => (s.width ?? 0) <= 1600) ?? sizes[0];
    if (!main) return null;
    return {
      url: main.url,
      width: main.width,
      height: main.height,
      sizes,
      alt: textIn(lang, a.altTextAr, a.altTextEn),
      credit: creditLine(a, a.license),
    };
  }

  private video(a: FileAsset) {
    const embed = metadataOf(a).embed;
    const credit = creditLine(a, a.license);
    if (embed) {
      if (!isAllowedEmbedUrl(embed.embedUrl)) return null;
      return {
        kind: 'embed',
        url: embed.embedUrl,
        provider: embed.provider,
        mimeType: null,
        width: null,
        height: null,
        durationSeconds: null,
        credit,
      };
    }
    const file = a.variants.find(
      (v) => v.kind === AssetVariantKind.rendition && v.label === 'source',
    );
    const url = this.urls.publicUrl(file?.storageKey);
    if (!url) return null;
    return {
      kind: 'file',
      url,
      provider: 'self',
      mimeType: file?.mimeType ?? a.mimeType,
      width: a.width,
      height: a.height,
      durationSeconds: num(a.durationSeconds),
      credit,
    };
  }

  private renditions(a: FileAsset, maxWidth: number) {
    const all: TourRenditionDto[] = a.variants
      .filter((v) => v.kind === AssetVariantKind.rendition)
      .map((v) => ({
        url: this.urls.publicUrl(v.storageKey) ?? '',
        width: v.width,
        height: v.height,
        sizeBytes: v.sizeBytes === null ? null : Number(v.sizeBytes),
      }))
      .filter((v) => v.url !== '')
      .sort((x, y) => (x.width ?? 0) - (y.width ?? 0));
    const fitting = all.filter((r) => (r.width ?? 0) <= maxWidth);
    const list = fitting.length > 0 ? fitting : all.slice(0, 1);
    return { list, recommended: list[list.length - 1] ?? null };
  }

  async detail(
    ref: string,
    market: string,
    lang: SupportedLanguage,
    maxWidth = DEFAULT_MAX_WIDTH,
  ): Promise<PublicTourDetailDto> {
    const t = await this.prisma.interiorTour.findFirst({
      where: {
        ...publicTourWhere(),
        ...(UUID_RE.test(ref) ? { id: ref.toLowerCase() } : { slug: ref.toLowerCase() }),
      },
      include: DETAIL_INCLUDE,
    });
    if (!t || !t.initialSceneId) throw TourErrors.notFound();
    const specKeys = [
      ...new Set(
        t.scenes.flatMap((s) =>
          s.hotspots.filter((h) => h.specKey).map((h) => h.specKey as string),
        ),
      ),
    ];
    const specRows =
      specKeys.length > 0
        ? await this.prisma.vehicleSpecification.findMany({
            where: {
              variantId: t.variantId,
              specKey: { in: specKeys },
              OR: [{ marketCode: null }, { marketCode: t.marketCode }],
            },
            include: { source: true },
          })
        : [];
    const points = pointsByKey(specRows, t.marketCode);
    const attributions = new Map<string, TourAttributionLineDto>();
    const note = (a: FileAsset) => {
      const text = creditLine(a, a.license);
      if (text && a.license && !attributions.has(text)) {
        attributions.set(text, {
          text,
          licenseType: a.license.licenseType,
          licenseUrl: a.license.licenseUrl,
          sourceUrl: a.license.sourceUrl,
        });
      }
    };

    const scenes: TourSceneDto[] = t.scenes.map((s) => {
      const a = s.asset;
      note(a);
      const preview = a.variants.find((v) => v.kind === AssetVariantKind.preview);
      const { list, recommended } = this.renditions(a, maxWidth);
      const multires =
        a.multiresConfig && typeof a.multiresConfig === 'object' && !Array.isArray(a.multiresConfig)
          ? (a.multiresConfig as Record<string, unknown>)
          : null;
      const basePath = multires ? this.urls.tilesBaseUrl(a.id) : null;
      const hotspots: TourHotspotDto[] = s.hotspots.map((h) => {
        const tr = (locale: string) => h.translations.find((x) => x.locale === locale);
        const primary = tr(lang) ?? tr(lang === 'ar' ? 'en' : 'ar');
        if (h.mediaAsset) note(h.mediaAsset);
        const point = h.specKey ? points.get(h.specKey) : undefined;
        return {
          id: h.id,
          type: h.type,
          yaw: Number(h.yaw),
          pitch: Number(h.pitch),
          iconKey: h.iconKey,
          title: primary?.title ?? '',
          body: primary?.body ?? null,
          targetSceneId: h.targetSceneId,
          targetYaw: num(h.targetYaw),
          targetPitch: num(h.targetPitch),
          image:
            h.type === HotspotType.detail_image && h.mediaAsset
              ? this.image(h.mediaAsset, lang)
              : null,
          video: h.type === HotspotType.video && h.mediaAsset ? this.video(h.mediaAsset) : null,
          spec:
            h.type === HotspotType.spec_link && h.spec
              ? {
                  key: h.spec.key,
                  label: nameIn(lang, h.spec.labelAr, h.spec.labelEn),
                  unit: point?.unit ?? h.spec.unit,
                  value: point?.value ?? null,
                  reliability: point?.reliability ?? null,
                  variantSlug: t.variant.slug,
                }
              : null,
        };
      });
      return {
        id: s.id,
        key: s.key,
        position: s.position,
        positionLabel: positionLabel(s.position, lang),
        title: textIn(lang, s.titleAr, s.titleEn) ?? positionLabel(s.position, lang),
        sortOrder: s.sortOrder,
        view: {
          yaw: Number(s.initialYaw),
          pitch: Number(s.initialPitch),
          hfov: Number(s.initialHfov),
          minHfov: num(s.minHfov),
          maxHfov: num(s.maxHfov),
          minPitch: num(s.minPitch),
          maxPitch: num(s.maxPitch),
          northOffset: num(s.northOffset),
        },
        panorama: {
          assetId: a.id,
          projection: a.projection ?? 'equirectangular',
          width: a.width,
          height: a.height,
          preview: preview
            ? {
                url: this.urls.publicUrl(preview.storageKey) ?? '',
                width: preview.width,
                height: preview.height,
              }
            : null,
          renditions: list,
          recommendedRendition: recommended,
          multires:
            multires && basePath
              ? {
                  basePath,
                  path: String(multires.path),
                  fallbackPath: String(multires.fallbackPath),
                  extension: String(multires.extension),
                  tileResolution: Number(multires.tileResolution),
                  maxLevel: Number(multires.maxLevel),
                  cubeResolution: Number(multires.cubeResolution),
                }
              : null,
        },
        attribution: {
          credit: creditLine(a, a.license),
          rightsHolder: a.license?.rightsHolder ?? '',
          licenseType: a.license?.licenseType ?? '',
          licenseUrl: a.license?.licenseUrl ?? null,
          sourceUrl: a.license?.sourceUrl ?? null,
        },
        hotspots,
      };
    });

    return {
      ...this.card(t, lang),
      description: textIn(lang, t.descriptionAr, t.descriptionEn),
      updatedAt: t.updatedAt.toISOString(),
      marketMatch: t.marketCode === market,
      mediaOrigin: this.urls.mediaOrigin(),
      initialSceneId: t.initialSceneId,
      matchType: t.matchType,
      scenes,
      attributions: [...attributions.values()],
    };
  }
}
