import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { fieldError } from '../common/discovery-http';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  GROUP_OF_ALIAS_ENTITY,
  SEARCH_GROUPS,
  type RankedRow,
  type SearchGroupKey,
  type SearchGroupResult,
  type SearchHit,
  type SourceContext,
} from '../common/search-types';
import { setWordSimilarityThreshold, variantSql } from '../common/sql-scoring';
import { highlightRanges, tokensOf, type TextRange } from '../common/text-match';
import { buildQueryPlan, type QueryPlan } from '../domain/query-plan';
import { AliasIndexService } from './alias-index.service';
import { DocumentsSource } from './sources/documents.source';
import { EncyclopediaSource } from './sources/encyclopedia.source';
import { ServicesSource } from './sources/services.source';
import { StationsSource } from './sources/stations.source';

export interface SearchParams {
  q: string;
  types?: SearchGroupKey[];
  limit?: number;
  page?: number;
  allMarkets?: boolean;
}

export interface SearchResponseData {
  query: string;
  normalizedQuery: string;
  expansions: { term: string; canonical: string }[];
  totalHits: number;
  groups: SearchGroupResult[];
}

export interface Suggestion {
  text: string;
  kind: 'query' | 'entity';
  type: SearchHit['type'] | null;
  id: string | null;
  slug: string | null;
  highlights: TextRange[];
}

/** SQL group label → group key (index rows use the entity type). */
const GROUP_OF_SQL: Record<string, SearchGroupKey> = {
  article: 'articles',
  brand: 'brands',
  model: 'models',
  variant: 'variants',
  stations: 'stations',
  encyclopedia: 'encyclopedia',
  services: 'services',
};

interface SqlRow {
  grp: string;
  id: string | null;
  score: number | null;
  total: number;
}

/**
 * Unified search (REQUIREMENTS §4, ARCHITECTURE §4.7): one query plan
 * (Arabic normalization + alias expansions + typo tolerance), one SQL
 * statement per source run in a single transaction (the pg_trgm threshold is
 * set for that transaction only), then hydration per group. Everything is
 * read-only and re-checks public visibility.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliases: AliasIndexService,
    private readonly documents: DocumentsSource,
    private readonly stations: StationsSource,
    private readonly encyclopedia: EncyclopediaSource,
    private readonly services: ServicesSource,
  ) {}

  async plan(q: string): Promise<QueryPlan> {
    const plan = buildQueryPlan(q, await this.aliases.active());
    if (tokensOf(plan.normalized).length === 0) {
      throw fieldError('q', 'hasLetterOrDigit', {
        ar: 'اكتب حرفًا أو رقمًا واحدًا على الأقل.',
        en: 'Type at least one letter or digit.',
      });
    }
    return plan;
  }

  async search(
    params: SearchParams,
    lang: SupportedLanguage,
    market: string,
  ): Promise<SearchResponseData> {
    const plan = await this.plan(params.q);
    const requested = params.types?.length ? params.types : [...SEARCH_GROUPS];
    const groups = SEARCH_GROUPS.filter((g) => requested.includes(g));
    const limit = params.limit ?? 5;
    const page = params.page ?? 1;
    const ctx = this.context(
      plan,
      lang,
      params.allMarkets ? null : market,
      limit,
      (page - 1) * limit,
    );
    const ranked = await this.rank(groups, ctx);

    const out: SearchGroupResult[] = [];
    for (const g of groups) {
      const rows = ranked.rows.filter((r) => r.group === g);
      const total = ranked.totals.get(g) ?? 0;
      const items = await this.hydrate(g, rows, ctx);
      out.push({
        type: g,
        total,
        page,
        pageSize: limit,
        hasMore: page * limit < total,
        items,
      });
    }
    return {
      query: params.q,
      normalizedQuery: plan.normalized,
      expansions: plan.expansions,
      totalHits: out.reduce((n, g) => n + g.total, 0),
      groups: out,
    };
  }

  /**
   * Search-box suggestions: alias spellings starting with the typed text
   * (kind "query") and entities whose title matches it (kind "entity").
   */
  async suggest(q: string, limit: number, lang: SupportedLanguage, market: string) {
    const plan = await this.plan(q);
    const out: Suggestion[] = [];
    const seen = new Set<string>();
    const n = plan.normalized;
    const startsWord = (text: string) => text.startsWith(n) || text.includes(` ${n}`);

    for (const a of await this.aliases.active()) {
      if (out.length >= Math.ceil(limit / 2)) break;
      if (!startsWord(a.termNormalized) && !startsWord(a.canonicalNormalized)) continue;
      const key = `q:${a.canonicalNormalized}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        text: a.canonical,
        kind: 'query',
        type: null,
        id: null,
        slug: null,
        highlights: highlightRanges(a.canonical, plan.needles),
      });
    }

    const perGroup = Math.min(10, limit);
    const ctx = this.context(plan, lang, market, perGroup, 0);
    const ranked = await this.rank([...SEARCH_GROUPS], ctx);
    const hits: SearchHit[] = [];
    for (const g of SEARCH_GROUPS) {
      const rows = ranked.rows.filter((r) => r.group === g);
      hits.push(...(await this.hydrate(g, rows, ctx)));
    }
    hits
      .filter((h) => h.matchedBy !== 'text')
      .sort((a, b) => b.score - a.score || a.title.length - b.title.length)
      .forEach((h) => {
        if (out.length >= limit) return;
        const key = `e:${h.type}:${h.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({
          text: h.title,
          kind: 'entity',
          type: h.type,
          id: h.id,
          slug: h.slug,
          highlights: h.highlights.title,
        });
      });
    return out.slice(0, limit);
  }

  private context(
    plan: QueryPlan,
    lang: SupportedLanguage,
    market: string | null,
    limit: number,
    offset: number,
  ): SourceContext {
    const pinned: SourceContext['pinned'] = {};
    for (const p of plan.pinned) {
      const g = GROUP_OF_ALIAS_ENTITY[p.entityType];
      if (!g) continue;
      (pinned[g] ??= []).push(p.entityId);
    }
    return { plan, variants: variantSql(plan.variants), lang, market, limit, offset, pinned };
  }

  private async rank(
    groups: SearchGroupKey[],
    ctx: SourceContext,
  ): Promise<{ rows: RankedRow[]; totals: Map<SearchGroupKey, number> }> {
    const sqls: Prisma.Sql[] = [];
    const docSql = this.documents.rankSql(this.documents.groupsOf(groups), ctx);
    if (docSql) sqls.push(docSql);
    if (groups.includes('stations')) sqls.push(this.stations.rankSql(ctx));
    if (groups.includes('encyclopedia')) sqls.push(this.encyclopedia.rankSql(ctx));
    if (groups.includes('services')) sqls.push(this.services.rankSql(ctx));
    const [, ...results] = await this.prisma.$transaction([
      this.prisma.$queryRaw(setWordSimilarityThreshold()),
      ...sqls.map((s) => this.prisma.$queryRaw<SqlRow[]>(s)),
    ]);
    const rows: RankedRow[] = [];
    const totals = new Map<SearchGroupKey, number>();
    for (const r of results.flat()) {
      const group = GROUP_OF_SQL[r.grp];
      if (!group) continue;
      if (r.id === null) {
        totals.set(group, Number(r.total));
        continue;
      }
      rows.push({ group, id: r.id, score: Number(r.score), total: Number(r.total) });
    }
    return { rows, totals };
  }

  private hydrate(group: SearchGroupKey, rows: RankedRow[], ctx: SourceContext) {
    switch (group) {
      case 'stations':
        return this.stations.hydrate(rows, ctx);
      case 'encyclopedia':
        return this.encyclopedia.hydrate(rows, ctx);
      case 'services':
        return this.services.hydrate(rows, ctx);
      default:
        return this.documents.hydrate(group, rows, ctx);
    }
  }
}
