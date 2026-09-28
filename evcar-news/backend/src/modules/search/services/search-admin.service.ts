import { Injectable } from '@nestjs/common';
import { toPageRequest } from '../../../common/http/pagination';
import { paginated, type PaginatedResponse } from '../../../common/http/responses';
import { normalizeSearchText } from '../../../common/i18n/arabic-normalize';
import { Prisma, SearchEntityType, type SearchAlias } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit';
import { ArticleSearchIndexService } from '../../articles/services/article-search-index.service';
import { VehicleSearchIndexer } from '../../vehicles';
import { conflict, fieldError, fieldErrors, notFound } from '../common/discovery-http';
import { escapeLike } from '../common/text-match';
import type {
  AliasListQueryDto,
  AliasViewDto,
  CreateAliasDto,
  IndexStatusDto,
  UpdateAliasDto,
} from '../dto/search.dto';
import { AliasIndexService } from './alias-index.service';

const NOT_FOUND = { ar: 'التهجئة البديلة غير موجودة.', en: 'Search alias not found.' };

export function aliasView(a: SearchAlias): AliasViewDto {
  return {
    id: a.id,
    term: a.term,
    canonical: a.canonical,
    termNormalized: a.termNormalized ?? normalizeSearchText(a.term),
    canonicalNormalized: a.canonicalNormalized ?? normalizeSearchText(a.canonical),
    locale: a.locale,
    entityType: a.entityType,
    entityId: a.entityId,
    isActive: a.isActive,
    isSystem: a.isSystem,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

/** Admin management of search aliases + index maintenance (permission search.manage). */
@Injectable()
export class SearchAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliases: AliasIndexService,
    private readonly audit: AuditService,
    private readonly articleIndex: ArticleSearchIndexService,
    private readonly vehicleIndex: VehicleSearchIndexer,
  ) {}

  async list(q: AliasListQueryDto): Promise<PaginatedResponse<AliasViewDto>> {
    const page = toPageRequest(q);
    const and: Prisma.SearchAliasWhereInput[] = [];
    if (q.q) {
      const n = escapeLike(normalizeSearchText(q.q));
      and.push({
        OR: [{ termNormalized: { contains: n } }, { canonicalNormalized: { contains: n } }],
      });
    }
    if (q.active !== undefined) and.push({ isActive: q.active });
    if (q.system !== undefined) and.push({ isSystem: q.system });
    if (q.entityType) and.push({ entityType: q.entityType });
    const where: Prisma.SearchAliasWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.searchAlias.findMany({
        where,
        orderBy: [{ canonicalNormalized: 'asc' }, { termNormalized: 'asc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.searchAlias.count({ where }),
    ]);
    return paginated(rows.map(aliasView), total, page);
  }

  async get(id: string): Promise<AliasViewDto> {
    return aliasView(await this.find(id));
  }

  async create(dto: CreateAliasDto): Promise<AliasViewDto> {
    const entityType = dto.entityType ?? null;
    const entityId = dto.entityId ?? null;
    await this.validate(dto.term, dto.canonical, entityType, entityId, null);
    const row = await this.prisma.searchAlias.create({
      data: {
        term: dto.term,
        canonical: dto.canonical,
        locale: dto.locale ?? null,
        entityType,
        entityId,
        isActive: dto.isActive ?? true,
        isSystem: false,
      },
    });
    this.aliases.invalidate();
    const view = aliasView(row);
    this.audit.annotate({ action: 'search_aliases.create', entityId: row.id, after: view });
    return view;
  }

  async update(id: string, dto: UpdateAliasDto): Promise<AliasViewDto> {
    const current = await this.find(id);
    const keys = Object.keys(dto).filter((k) => (dto as Record<string, unknown>)[k] !== undefined);
    if (current.isSystem && keys.some((k) => k !== 'isActive')) {
      throw conflict('SEARCH_ALIAS_IS_SYSTEM', {
        ar: 'التهجئات الأساسية للنظام لا تُعدّل؛ يمكن فقط تعطيلها أو تفعيلها.',
        en: 'System aliases cannot be edited; they can only be deactivated or activated.',
      });
    }
    const term = dto.term ?? current.term;
    const canonical = dto.canonical ?? current.canonical;
    const entityType = dto.entityType !== undefined ? dto.entityType : current.entityType;
    const entityId = dto.entityId !== undefined ? dto.entityId : current.entityId;
    if (!current.isSystem) await this.validate(term, canonical, entityType, entityId, id);
    const row = await this.prisma.searchAlias.update({
      where: { id },
      data: {
        term,
        canonical,
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
        entityType,
        entityId,
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    this.aliases.invalidate();
    const view = aliasView(row);
    this.audit.annotate({
      action: 'search_aliases.update',
      entityId: id,
      before: aliasView(current),
      after: view,
    });
    return view;
  }

  async remove(id: string): Promise<void> {
    const current = await this.find(id);
    if (current.isSystem) {
      throw conflict('SEARCH_ALIAS_IS_SYSTEM', {
        ar: 'لا يمكن حذف تهجئة أساسية للنظام (يعيد التثبيت إنشاءها)؛ عطّلها بدلًا من ذلك.',
        en: 'System aliases are re-created on deploy and cannot be deleted; deactivate it instead.',
      });
    }
    await this.prisma.searchAlias.delete({ where: { id } });
    this.aliases.invalidate();
    this.audit.annotate({
      action: 'search_aliases.delete',
      entityId: id,
      before: aliasView(current),
    });
  }

  /** Index drift: published index documents vs. publicly visible source rows. */
  async status(): Promise<IndexStatusDto[]> {
    const indexed = await this.prisma.$queryRaw<{ t: string; n: number }[]>`
      SELECT "entity_type"::text AS t, count(DISTINCT "entity_id")::int AS n
        FROM "search_documents" WHERE "is_published" GROUP BY 1`;
    const counts = new Map(indexed.map((r) => [r.t, Number(r.n)]));
    const [visible] = await this.prisma.$queryRaw<
      {
        articles: number;
        brands: number;
        models: number;
        variants: number;
        stations: number;
        encyclopedia: number;
        services: number;
      }[]
    >`SELECT
        (SELECT count(*) FROM "articles" a WHERE a."status" = 'published' AND a."deleted_at" IS NULL AND a."published_at" <= now())::int AS articles,
        (SELECT count(*) FROM "brands" b WHERE b."status" = 'published' AND b."deleted_at" IS NULL)::int AS brands,
        (SELECT count(*) FROM "car_models" m JOIN "brands" b ON b."id" = m."brand_id"
          WHERE m."status" = 'published' AND m."deleted_at" IS NULL AND b."status" = 'published' AND b."deleted_at" IS NULL)::int AS models,
        (SELECT count(*) FROM "vehicle_variants" v
           JOIN "model_years" y ON y."id" = v."model_year_id"
           JOIN "generations" g ON g."id" = y."generation_id"
           JOIN "car_models" m ON m."id" = g."model_id"
           JOIN "brands" b ON b."id" = m."brand_id"
          WHERE v."status" = 'published' AND v."deleted_at" IS NULL AND g."deleted_at" IS NULL
            AND m."status" = 'published' AND m."deleted_at" IS NULL
            AND b."status" = 'published' AND b."deleted_at" IS NULL)::int AS variants,
        (SELECT count(*) FROM "charging_stations" s WHERE s."publication_status" = 'published' AND s."deleted_at" IS NULL AND s."duplicate_of_id" IS NULL)::int AS stations,
        (SELECT count(*) FROM "encyclopedia_entries" e WHERE e."status" = 'published' AND e."deleted_at" IS NULL AND e."published_at" <= now())::int AS encyclopedia,
        (SELECT count(*) FROM "service_providers" p WHERE p."status" = 'published' AND p."deleted_at" IS NULL)::int AS services`;
    const indexRow = (t: string, v: number): IndexStatusDto => {
      const n = counts.get(t) ?? 0;
      return { entityType: t, indexed: n, visible: v, inSync: n === v, source: 'index' };
    };
    const direct = (t: string, v: number): IndexStatusDto => ({
      entityType: t,
      indexed: v,
      visible: v,
      inSync: true,
      source: 'direct',
    });
    return [
      indexRow('article', Number(visible.articles)),
      indexRow('brand', Number(visible.brands)),
      indexRow('model', Number(visible.models)),
      indexRow('variant', Number(visible.variants)),
      direct('station', Number(visible.stations)),
      direct('encyclopedia', Number(visible.encyclopedia)),
      direct('service_provider', Number(visible.services)),
    ];
  }

  async reindex(): Promise<{ articles: number; models: number }> {
    const { indexed } = await this.articleIndex.reindexAll();
    const models = await this.vehicleIndex.rebuildAll();
    this.audit.annotate({ action: 'search.reindex', after: { articles: indexed, models } });
    return { articles: indexed, models };
  }

  // ---------------------------------------------------------------------------------------

  private async find(id: string): Promise<SearchAlias> {
    const row = await this.prisma.searchAlias.findUnique({ where: { id } });
    if (!row) throw notFound('SEARCH_ALIAS_NOT_FOUND', NOT_FOUND);
    return row;
  }

  private async validate(
    term: string,
    canonical: string,
    entityType: SearchEntityType | null,
    entityId: string | null,
    selfId: string | null,
  ): Promise<void> {
    const t = normalizeSearchText(term);
    const c = normalizeSearchText(canonical);
    if (!/[\p{L}\p{N}]/u.test(t) || !/[\p{L}\p{N}]/u.test(c)) {
      throw fieldError(!/[\p{L}\p{N}]/u.test(t) ? 'term' : 'canonical', 'hasLetterOrDigit', {
        ar: 'يجب أن يحتوي النص على حرف أو رقم.',
        en: 'The text must contain a letter or digit.',
      });
    }
    if (t === c) {
      throw fieldError('term', 'differsFromCanonical', {
        ar: 'التهجئة البديلة مطابقة للاسم الأساسي بعد التطبيع.',
        en: 'The term equals the canonical name after normalization.',
      });
    }
    if ((entityType === null) !== (entityId === null)) {
      throw fieldErrors([
        {
          field: entityType === null ? 'entityType' : 'entityId',
          rule: 'bothOrNeither',
          message: {
            ar: 'حدد نوع العنصر ومعرّفه معًا أو اتركهما فارغين.',
            en: 'Set both entityType and entityId, or neither.',
          },
        },
      ]);
    }
    if (entityType && entityId && !(await this.entityExists(entityType, entityId))) {
      throw fieldError('entityId', 'exists', {
        ar: 'العنصر المرتبط غير موجود.',
        en: 'The bound entity does not exist.',
      });
    }
    const dup = await this.prisma.searchAlias.findFirst({
      where: {
        termNormalized: t,
        canonicalNormalized: c,
        ...(selfId ? { id: { not: selfId } } : {}),
      },
      select: { id: true },
    });
    if (dup) {
      throw conflict(
        'SEARCH_ALIAS_EXISTS',
        { ar: 'هذه التهجئة موجودة بالفعل.', en: 'This alias already exists.' },
        { id: dup.id },
      );
    }
  }

  private async entityExists(type: SearchEntityType, id: string): Promise<boolean> {
    const where = { id };
    switch (type) {
      case SearchEntityType.article:
        return !!(await this.prisma.article.findUnique({ where, select: { id: true } }));
      case SearchEntityType.brand:
        return !!(await this.prisma.brand.findUnique({ where, select: { id: true } }));
      case SearchEntityType.model:
        return !!(await this.prisma.carModel.findUnique({ where, select: { id: true } }));
      case SearchEntityType.variant:
        return !!(await this.prisma.vehicleVariant.findUnique({ where, select: { id: true } }));
      case SearchEntityType.station:
        return !!(await this.prisma.chargingStation.findUnique({ where, select: { id: true } }));
      case SearchEntityType.encyclopedia:
        return !!(await this.prisma.encyclopediaEntry.findUnique({ where, select: { id: true } }));
      case SearchEntityType.tour:
        return !!(await this.prisma.interiorTour.findUnique({ where, select: { id: true } }));
      case SearchEntityType.service_provider:
        return !!(await this.prisma.serviceProvider.findUnique({ where, select: { id: true } }));
      default:
        return false;
    }
  }
}
