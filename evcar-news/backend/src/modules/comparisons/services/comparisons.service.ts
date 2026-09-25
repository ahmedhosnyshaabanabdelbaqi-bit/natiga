import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { toPageRequest, type PageRequest } from '../../../common/http/pagination';
import { ContentStatus, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { SettingsService } from '../../settings';
import { IMAGE_ASSET_INCLUDE, MediaUrlService, PUBLIC_VARIANT_WHERE } from '../../vehicles';
import { ComparisonErrors } from '../common/errors';
import type {
  ComparisonDto,
  ComparisonItemViewDto,
  ComparisonView,
  CreateComparisonDto,
  CreatedComparisonDto,
  SharedComparisonDto,
} from '../dto/comparison.dto';
import { ComparisonComputeService } from './comparison-compute.service';
import { ComparisonStatsService, type ClientInfo } from './comparison-stats.service';
import {
  comparisonSignature,
  ItemResolverService,
  type ResolvedItem,
} from './item-resolver.service';

/** Saved comparisons per account (anti-abuse bound; the app shows a clear message). */
export const MAX_SAVED_PER_USER = 200;
const DEFAULT_SHARE_BASE = 'https://evcar.news';
const DEFAULT_SHARE_PATH = '/compare/{shareId}';

export const ITEMS_INCLUDE = {
  items: { orderBy: { position: 'asc' } },
} satisfies Prisma.ComparisonInclude;
export type ComparisonWithItems = Prisma.ComparisonGetPayload<{ include: typeof ITEMS_INCLUDE }>;

const ITEM_VARIANT_SELECT = {
  id: true,
  slug: true,
  nameAr: true,
  nameEn: true,
  powertrainType: true,
  isDemo: true,
  modelYearId: true,
  modelYear: {
    select: {
      year: true,
      generation: {
        select: {
          model: {
            select: {
              id: true,
              slug: true,
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
  markets: { select: { marketCode: true, availability: true } },
} satisfies Prisma.VehicleVariantSelect;

/** Random URL-safe share id (12 chars of base64url, matches `^[A-Za-z0-9_-]{6,24}$`). */
export function newShareId(): string {
  return randomBytes(9).toString('base64url');
}

const nameIn = (lang: SupportedLanguage, ar: string | null, en: string | null): string =>
  ((lang === 'en' ? en || ar : ar || en) ?? '').trim();

interface ItemViews {
  views: ComparisonItemViewDto[];
  /** Short "Brand Model" per available item, for automatic titles. */
  short: Map<number, string>;
}

/**
 * Saved (account), shared (anonymous link) and curated comparisons.
 * A share link never reveals who created it; an owner's own label is only
 * returned to the owner.
 */
@Injectable()
export class ComparisonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ItemResolverService,
    private readonly computer: ComparisonComputeService,
    private readonly stats: ComparisonStatsService,
    private readonly settings: SettingsService,
    private readonly media: MediaUrlService,
  ) {}

  // --- helpers --------------------------------------------------------------------------

  async shareUrl(shareId: string): Promise<string> {
    let base = DEFAULT_SHARE_BASE;
    let path = DEFAULT_SHARE_PATH;
    try {
      const share = await this.settings.get('share');
      base = share.baseUrl?.trim() || base;
      path = share.paths?.comparison?.trim() || path;
    } catch {
      /* defaults */
    }
    const p = path.includes('{shareId}')
      ? path.replace('{shareId}', shareId)
      : `${path.replace(/\/$/, '')}/${shareId}`;
    return `${base.replace(/\/+$/, '')}${p.startsWith('/') ? '' : '/'}${p}`;
  }

  async itemViews(
    items: { variantId: string; marketCode: string; position: number }[],
    lang: SupportedLanguage,
  ): Promise<ItemViews> {
    return (await this.itemViewsMany([items], lang))[0];
  }

  /** Item views of several comparisons with two queries in total (lists, featured). */
  async itemViewsMany(
    lists: { variantId: string; marketCode: string; position: number }[][],
    lang: SupportedLanguage,
  ): Promise<ItemViews[]> {
    const ids = [...new Set(lists.flatMap((items) => items.map((i) => i.variantId)))];
    if (ids.length === 0) return lists.map(() => ({ views: [], short: new Map() }));
    const [rows, publicRows] = await Promise.all([
      this.prisma.vehicleVariant.findMany({
        where: { id: { in: ids } },
        select: ITEM_VARIANT_SELECT,
      }),
      this.prisma.vehicleVariant.findMany({
        where: { ...PUBLIC_VARIANT_WHERE, id: { in: ids } },
        select: { id: true },
      }),
    ]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const isPublic = new Set(publicRows.map((r) => r.id));
    return lists.map((items) => {
      const short = new Map<number, string>();
      const views = items.map((it): ComparisonItemViewDto => {
        const v = byId.get(it.variantId);
        if (!v || !isPublic.has(v.id)) {
          // Unpublished trims: no names or images of draft data leak.
          return {
            position: it.position,
            variantId: it.variantId,
            marketCode: it.marketCode,
            available: false,
            variantSlug: null,
            modelYearId: null,
            modelYear: null,
            modelId: null,
            modelSlug: null,
            title: null,
            powertrainType: null,
            availability: null,
            image: null,
            isDemo: v?.isDemo ?? false,
          };
        }
        const m = v.modelYear.generation.model;
        const brand = nameIn(lang, m.brand.nameAr, m.brand.nameEn);
        const model = nameIn(lang, m.nameAr, m.nameEn);
        short.set(it.position, `${brand} ${model}`);
        return {
          position: it.position,
          variantId: v.id,
          marketCode: it.marketCode,
          available: true,
          variantSlug: v.slug,
          modelYearId: v.modelYearId,
          modelYear: v.modelYear.year,
          modelId: m.id,
          modelSlug: m.slug,
          title: `${brand} ${model} ${v.modelYear.year} ${nameIn(lang, v.nameAr, v.nameEn)}`,
          powertrainType: v.powertrainType,
          availability: v.markets.find((x) => x.marketCode === it.marketCode)?.availability ?? null,
          image: this.media.image(m.heroAsset, lang),
          isDemo: v.isDemo,
        };
      });
      return { views, short };
    });
  }

  async toDto(
    c: ComparisonWithItems,
    viewerId: string | null,
    lang: SupportedLanguage,
    views?: ItemViews,
  ): Promise<ComparisonDto> {
    const iv = views ?? (await this.itemViews(c.items, lang));
    const isMine = viewerId !== null && c.userId === viewerId;
    const auto = [...iv.short.values()].join(lang === 'ar' ? ' مقابل ' : ' vs ');
    const curatedTitle = c.isCurated ? nameIn(lang, c.titleAr, c.titleEn) : '';
    const displayTitle = (c.isCurated ? curatedTitle : isMine ? (c.title ?? '') : '') || auto;
    return {
      id: c.id,
      shareId: c.shareId,
      shareUrl: await this.shareUrl(c.shareId),
      kind: c.isCurated ? 'curated' : c.userId ? 'saved' : 'shared',
      isMine,
      title: isMine ? c.title : null,
      displayTitle,
      marketCode: c.marketCode,
      items: iv.views,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      isDemo: c.isDemo,
    };
  }

  /** Creates a comparison with its items in one statement (2–4 items checked at COMMIT). */
  async createRow(data: {
    userId: string | null;
    title: string | null;
    marketCode: string;
    signature: string | null;
    items: ResolvedItem[];
    curated?: {
      titleAr: string | null;
      titleEn: string | null;
      status: ContentStatus;
      order: number | null;
    };
  }): Promise<ComparisonWithItems> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.comparison.create({
          data: {
            shareId: newShareId(),
            userId: data.userId,
            title: data.title,
            marketCode: data.marketCode,
            signature: data.signature,
            isDemo: data.items.some((i) => i.isDemo),
            ...(data.curated
              ? {
                  isCurated: true,
                  titleAr: data.curated.titleAr,
                  titleEn: data.curated.titleEn,
                  curatedStatus: data.curated.status,
                  curatedOrder: data.curated.order,
                }
              : {}),
            items: {
              create: data.items.map((i) => ({
                variantId: i.variantId,
                marketCode: i.marketCode,
                position: i.position,
              })),
            },
          },
          include: ITEMS_INCLUDE,
        });
      } catch (err) {
        const shareIdClash =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          JSON.stringify(err.meta ?? {}).includes('share_id');
        if (!shareIdClash || attempt >= 5) throw err;
      }
    }
  }

  // --- public ---------------------------------------------------------------------------

  /** POST /comparisons: guest → anonymous share link (reused when identical); user → saved. */
  async create(
    dto: CreateComparisonDto,
    userId: string | null,
    lang: SupportedLanguage,
    requestMarket: string,
  ): Promise<{ data: CreatedComparisonDto; created: boolean }> {
    const items = await this.resolver.resolve(dto.items);
    const signature = comparisonSignature(items);
    if (!userId) {
      const existing = await this.prisma.comparison.findFirst({
        where: { signature, userId: null, isCurated: false },
        include: ITEMS_INCLUDE,
        orderBy: { createdAt: 'asc' },
      });
      const row =
        existing ??
        (await this.createRow({
          userId: null,
          title: null,
          marketCode: requestMarket,
          signature,
          items,
        }));
      await this.stats.countShared(row.id);
      return {
        data: { ...(await this.toDto(row, null, lang)), saved: false, reused: existing !== null },
        created: existing === null,
      };
    }
    const existing = await this.prisma.comparison.findFirst({
      where: { userId, signature },
      include: ITEMS_INCLUDE,
    });
    if (existing) {
      const row =
        dto.title !== undefined && dto.title !== existing.title
          ? await this.prisma.comparison.update({
              where: { id: existing.id },
              data: { title: dto.title || null },
              include: ITEMS_INCLUDE,
            })
          : existing;
      return {
        data: { ...(await this.toDto(row, userId, lang)), saved: true, reused: true },
        created: false,
      };
    }
    const count = await this.prisma.comparison.count({ where: { userId } });
    if (count >= MAX_SAVED_PER_USER) throw ComparisonErrors.limitReached(MAX_SAVED_PER_USER);
    const row = await this.createRow({
      userId,
      title: dto.title || null,
      marketCode: requestMarket,
      signature,
      items,
    });
    return {
      data: { ...(await this.toDto(row, userId, lang)), saved: true, reused: false },
      created: true,
    };
  }

  /** Items of a stored comparison that are still published, as resolved items. */
  private async liveItems(c: ComparisonWithItems): Promise<ResolvedItem[]> {
    const rows = await this.prisma.vehicleVariant.findMany({
      where: { ...PUBLIC_VARIANT_WHERE, id: { in: c.items.map((i) => i.variantId) } },
      select: {
        id: true,
        slug: true,
        isDemo: true,
        modelYearId: true,
        modelYear: { select: { year: true } },
        markets: { select: { marketCode: true, availability: true } },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const out: ResolvedItem[] = [];
    for (const it of c.items) {
      const v = byId.get(it.variantId);
      const vm = v?.markets.find((m) => m.marketCode === it.marketCode);
      if (!v || !vm) continue;
      out.push({
        position: it.position,
        key: `${v.id}@${it.marketCode}`,
        variantId: v.id,
        variantSlug: v.slug,
        modelYearId: v.modelYearId,
        modelYear: v.modelYear.year,
        marketCode: it.marketCode,
        availability: vm.availability,
        isDemo: v.isDemo,
      });
    }
    return out;
  }

  private async withResult(
    c: ComparisonWithItems,
    viewerId: string | null,
    lang: SupportedLanguage,
    requestMarket: string,
    opts: { view?: ComparisonView; differencesOnly?: boolean },
  ): Promise<{ dto: SharedComparisonDto; live: ResolvedItem[] }> {
    const views = await this.itemViews(c.items, lang);
    const live = await this.liveItems(c);
    const result =
      live.length >= 2 ? await this.computer.compute(live, lang, requestMarket, opts) : null;
    const liveKeys = new Set(live.map((l) => l.position));
    return {
      dto: {
        comparison: await this.toDto(c, viewerId, lang, views),
        result,
        unavailableItems: views.views.filter((v) => !liveKeys.has(v.position)),
      },
      live,
    };
  }

  /** GET /comparisons/s/:shareId — shared, curated (published) or saved comparisons. */
  async shared(
    shareId: string,
    viewerId: string | null,
    lang: SupportedLanguage,
    requestMarket: string,
    opts: { view?: ComparisonView; differencesOnly?: boolean },
    client: ClientInfo,
  ): Promise<SharedComparisonDto> {
    if (!/^[A-Za-z0-9_-]{6,24}$/.test(shareId)) throw ComparisonErrors.notFound();
    const c = await this.prisma.comparison.findUnique({
      where: { shareId },
      include: ITEMS_INCLUDE,
    });
    if (!c) throw ComparisonErrors.notFound();
    if (c.isCurated && c.curatedStatus !== ContentStatus.published)
      throw ComparisonErrors.notFound();
    const { dto, live } = await this.withResult(c, viewerId, lang, requestMarket, opts);
    await this.stats.countOpened(
      c.id,
      live.map((l) => l.variantId),
      comparisonSignature(live),
      client,
    );
    return dto;
  }

  /** GET /comparisons/featured — published curated comparisons of the market (home). */
  async featured(market: string, lang: SupportedLanguage, limit = 10): Promise<ComparisonDto[]> {
    const rows = await this.prisma.comparison.findMany({
      where: { isCurated: true, curatedStatus: ContentStatus.published, marketCode: market },
      include: ITEMS_INCLUDE,
      orderBy: [{ curatedOrder: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: limit * 2,
    });
    const all = await this.itemViewsMany(
      rows.map((c) => c.items),
      lang,
    );
    const out: ComparisonDto[] = [];
    for (const [i, c] of rows.entries()) {
      // A featured comparison needs at least two trims that are still published.
      if (all[i].views.filter((v) => v.available).length < 2) continue;
      out.push(await this.toDto(c, null, lang, all[i]));
      if (out.length >= limit) break;
    }
    return out;
  }

  // --- me -------------------------------------------------------------------------------

  async listMine(
    userId: string,
    query: { page?: number; pageSize?: number },
    lang: SupportedLanguage,
  ): Promise<{ items: ComparisonDto[]; total: number; page: PageRequest }> {
    const page = toPageRequest(query);
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.comparison.findMany({
        where,
        include: ITEMS_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.comparison.count({ where }),
    ]);
    const views = await this.itemViewsMany(
      rows.map((c) => c.items),
      lang,
    );
    const items = await Promise.all(rows.map((c, i) => this.toDto(c, userId, lang, views[i])));
    return { items, total, page };
  }

  private async mine(id: string, userId: string): Promise<ComparisonWithItems> {
    const c = await this.prisma.comparison.findFirst({
      where: { id, userId },
      include: ITEMS_INCLUDE,
    });
    // Someone else's comparison is reported exactly like a missing one (no existence leak).
    if (!c) throw ComparisonErrors.notFound();
    return c;
  }

  async getMine(
    id: string,
    userId: string,
    lang: SupportedLanguage,
    requestMarket: string,
    opts: { view?: ComparisonView; differencesOnly?: boolean },
  ): Promise<SharedComparisonDto> {
    const c = await this.mine(id, userId);
    return (await this.withResult(c, userId, lang, requestMarket, opts)).dto;
  }

  async renameMine(
    id: string,
    userId: string,
    title: string | null,
    lang: SupportedLanguage,
  ): Promise<ComparisonDto> {
    await this.mine(id, userId);
    const row = await this.prisma.comparison.update({
      where: { id },
      data: { title: title || null },
      include: ITEMS_INCLUDE,
    });
    return this.toDto(row, userId, lang);
  }

  async deleteMine(id: string, userId: string): Promise<void> {
    const res = await this.prisma.comparison.deleteMany({ where: { id, userId } });
    if (res.count === 0) throw ComparisonErrors.notFound();
  }
}
