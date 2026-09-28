import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { SupportedLanguage } from '../../../config/app-config';
import { ArticlesPublicService } from '../../articles/services/articles-public.service';
import type {
  PublicArticleQueryDto,
  PublicArticleSummaryDto,
} from '../../articles/dto/public-article.dto';
import { ComparisonsService } from '../../comparisons/services/comparisons.service';
import { EncyclopediaPublicService } from '../../encyclopedia/services/encyclopedia-public.service';
import { CONFIG_CHANGED_EVENT } from '../../settings';
import { StationSearchService } from '../../stations/services/station-search.service';
import { ToursPublicService } from '../../tours';
import { CarPagesService } from '../../vehicles';
import {
  SECTION_DEFS,
  planSections,
  sectionTitle,
  type HomeKey,
  type SectionState,
} from '../domain/sections';
import type { HomeDto, HomeSectionDto } from '../dto/home.dto';
import { HomeFlagsService } from './home-flags.service';
import { InterestsService } from './interests.service';

const CACHE_MS = 60_000;
const NEARBY_RADIUS_KM = 25;
const MAX_INTEREST_QUERIES = 8;

interface Computed {
  at: number;
  state: SectionState;
  items: unknown[];
}

interface HomeContext {
  lang: SupportedLanguage;
  market: string;
  userId?: string;
  point?: { lat: number; lng: number };
}

/**
 * GET /home (REQUIREMENTS §4): sections in the admin-controlled order,
 * hidden when disabled or their feature is off. Personalization only ADDS a
 * "for you" section (regular sections and "see all" links are never
 * filtered). Location is used for this request only (never stored).
 * Sections without user / location data are cached per language + market.
 */
@Injectable()
export class HomeService {
  private readonly logger = new Logger(HomeService.name);
  private readonly cache = new Map<string, Computed>();

  constructor(
    private readonly flags: HomeFlagsService,
    private readonly interests: InterestsService,
    private readonly articles: ArticlesPublicService,
    private readonly cars: CarPagesService,
    private readonly comparisons: ComparisonsService,
    private readonly tours: ToursPublicService,
    private readonly stations: StationSearchService,
    private readonly encyclopedia: EncyclopediaPublicService,
  ) {}

  @OnEvent(CONFIG_CHANGED_EVENT)
  invalidate(): void {
    this.cache.clear();
  }

  async build(ctx: HomeContext): Promise<HomeDto> {
    const [configured, features, interestKeys] = await Promise.all([
      this.flags.sections(),
      this.flags.features(),
      ctx.userId ? this.interests.keys(ctx.userId) : Promise.resolve(null),
    ]);
    const hasInterests =
      !!interestKeys &&
      interestKeys.brandIds.length +
        interestKeys.modelIds.length +
        interestKeys.categoryIds.length >
        0;
    const plan = planSections(configured, features, hasInterests);

    // The top story is computed first so other news sections can skip it.
    const top = plan.visible.some((s) => s.key === 'top_story')
      ? await this.section('top_story', ctx, interestKeys, null)
      : null;
    const topStoryId = (top?.items[0] as PublicArticleSummaryDto | undefined)?.id ?? null;
    const sections: HomeSectionDto[] = [];
    let generatedAt = 0;
    for (const s of plan.visible) {
      const c =
        s.key === 'top_story' && top
          ? top
          : await this.section(s.key, ctx, interestKeys, topStoryId);
      if (s.key !== 'for_you' && s.key !== 'nearby_stations')
        generatedAt = Math.max(generatedAt, c.at);
      const def = SECTION_DEFS[s.key];
      sections.push({
        key: s.key,
        order: s.order,
        title: sectionTitle(s.key, ctx.lang),
        itemType: def.itemType,
        state: c.state,
        items: c.items,
        browse: {
          resource: def.browse.resource,
          params:
            s.key === 'nearby_stations' && ctx.point
              ? { lat: String(ctx.point.lat), lng: String(ctx.point.lng) }
              : { ...def.browse.params },
        },
      });
    }
    return {
      market: ctx.market,
      language: ctx.lang,
      personalized: sections.some((s) => s.key === 'for_you'),
      generatedAt: new Date(generatedAt || Date.now()).toISOString(),
      sections,
      hiddenSections: plan.hidden,
    };
  }

  private async section(
    key: HomeKey,
    ctx: HomeContext,
    interests: Awaited<ReturnType<InterestsService['keys']>> | null,
    topStoryId: string | null,
  ): Promise<Computed> {
    const personal = key === 'for_you' || key === 'nearby_stations';
    const cacheKey = `${ctx.lang}:${ctx.market}:${key}:${key === 'latest_news' ? (topStoryId ?? '-') : ''}`;
    if (!personal) {
      const hit = this.cache.get(cacheKey);
      if (hit && Date.now() - hit.at < CACHE_MS) return hit;
    }
    let result: Computed;
    try {
      if (key === 'nearby_stations' && !ctx.point) {
        result = { at: Date.now(), state: 'location_required', items: [] };
      } else {
        const items = await this.items(key, ctx, interests, topStoryId);
        result = { at: Date.now(), state: items.length ? 'ok' : 'empty', items };
      }
    } catch (err) {
      this.logger.warn({ err, section: key }, `Home section ${key} failed`);
      return { at: Date.now(), state: 'unavailable', items: [] };
    }
    if (!personal) this.cache.set(cacheKey, result);
    return result;
  }

  private async articleList(
    q: Partial<PublicArticleQueryDto>,
    ctx: HomeContext,
  ): Promise<PublicArticleSummaryDto[]> {
    return (await this.articles.list({ page: 1, ...q }, ctx.lang, ctx.market)).data;
  }

  private async items(
    key: HomeKey,
    ctx: HomeContext,
    interests: Awaited<ReturnType<InterestsService['keys']>> | null,
    topStoryId: string | null,
  ): Promise<unknown[]> {
    const { lang, market } = ctx;
    switch (key) {
      case 'top_story': {
        const featured = await this.articleList({ featured: 'true', pageSize: 1 }, ctx);
        return featured.length ? featured : this.articleList({ pageSize: 1 }, ctx);
      }
      case 'latest_news': {
        // The visible top story is not repeated.
        return (await this.articleList({ pageSize: 11 }, ctx))
          .filter((a) => a.id !== topStoryId)
          .slice(0, 10);
      }
      case 'reviews': {
        const [reviews, drives] = await Promise.all([
          this.articleList({ type: 'review', pageSize: 6 }, ctx),
          this.articleList({ type: 'test_drive', pageSize: 6 }, ctx),
        ]);
        return [...reviews, ...drives]
          .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id))
          .slice(0, 6);
      }
      case 'for_you': {
        if (!interests) return [];
        const queries: Partial<PublicArticleQueryDto>[] = [
          ...interests.modelIds.map((modelId) => ({ modelId })),
          ...interests.brandIds.map((brandId) => ({ brandId })),
          ...interests.categoryIds.map((category) => ({ category })),
        ].slice(0, MAX_INTEREST_QUERIES);
        const lists = await Promise.all(
          queries.map((q) => this.articleList({ ...q, pageSize: 5 }, ctx)),
        );
        const seen = new Set<string>(topStoryId ? [topStoryId] : []);
        return lists
          .flat()
          .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id))
          .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
          .slice(0, 10);
      }
      case 'new_cars':
        return (await this.cars.listCars({ page: 1, pageSize: 10, sort: 'newest' }, market, lang))
          .items;
      case 'featured_comparisons':
        return this.comparisons.featured(market, lang, 6);
      case 'interior_tours':
        return this.tours.featured(10, market, lang);
      case 'nearby_stations': {
        const res = await this.stations.search(
          {
            lat: ctx.point!.lat,
            lng: ctx.point!.lng,
            radiusKm: NEARBY_RADIUS_KM,
            limit: 10,
            sort: 'distance',
          },
          lang,
          market,
          undefined,
        );
        return res.data;
      }
      case 'charging_guides':
        return this.encyclopedia.guides(8, lang);
    }
  }
}
