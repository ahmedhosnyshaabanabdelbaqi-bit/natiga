import { Injectable } from '@nestjs/common';
import { toPageRequest } from '../../../common/http/pagination';
import { Prisma } from '../../../generated/prisma/client';
import {
  ContentStatus,
  PowertrainType,
  RangeType,
  ConsumptionKind,
  type BodyType,
  type DriveType,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit';
import { CatalogErrors, fieldError } from '../common/catalog-errors';
import { can, type Actor } from '../common/data-point';
import { IMAGE_ASSET_INCLUDE, MediaUrlService } from '../common/media-urls';
import { latinSlug, resolveSlug } from '../common/slugs';
import { cleanText, toIso } from '../common/values';
import { visibilityBlockers } from '../common/visibility';
import type {
  AdminBrandDto,
  AdminCatalogListQueryDto,
  AdminGenerationDto,
  AdminModelDetailDto,
  AdminModelDto,
  AdminModelListQueryDto,
  AdminModelYearDto,
  AdminVariantDto,
  AdminVariantListQueryDto,
  CreateBrandDto,
  CreateGenerationDto,
  CreateModelDto,
  CreateModelYearDto,
  CreateVariantDto,
  UpdateBrandDto,
  UpdateGenerationDto,
  UpdateModelDto,
  UpdateVariantDto,
} from '../dto/admin-catalog.dto';
import { VehicleSearchIndexer } from '../search/vehicle-search-indexer';
import { AssetGuard } from './asset-guard';

export const PUBLISH_PERMISSION = 'vehicles.publish';

/** Status changes (anything but creating a draft / keeping the status) need vehicles.publish. */
export function assertStatusChange(
  actor: Actor,
  from: ContentStatus | null,
  to: string | undefined,
): void {
  if (to === undefined || to === from) return;
  if (from === null && to === ContentStatus.draft) return;
  if (!can(actor, PUBLISH_PERMISSION)) throw CatalogErrors.publishPermission();
}

function containsQ(q: string | undefined, fields: string[]): Prisma.BrandWhereInput[] | undefined {
  if (!q) return undefined;
  return fields.map((f) => ({ [f]: { contains: q, mode: 'insensitive' } }));
}

const BRAND_INCLUDE = {
  logoAsset: { include: IMAGE_ASSET_INCLUDE },
  _count: { select: { models: { where: { deletedAt: null } } } },
} satisfies Prisma.BrandInclude;
type BrandRow = Prisma.BrandGetPayload<{ include: typeof BRAND_INCLUDE }>;

const MODEL_INCLUDE = {
  brand: true,
  heroAsset: { include: IMAGE_ASSET_INCLUDE },
} satisfies Prisma.CarModelInclude;
type ModelRow = Prisma.CarModelGetPayload<{ include: typeof MODEL_INCLUDE }>;

const VARIANT_INCLUDE = {
  modelYear: { include: { generation: { include: { model: { include: { brand: true } } } } } },
  markets: { select: { marketCode: true, availability: true } },
} satisfies Prisma.VehicleVariantInclude;
type VariantRow = Prisma.VehicleVariantGetPayload<{ include: typeof VARIANT_INCLUDE }>;

/**
 * Admin CRUD of the catalog hierarchy (brands, models, generations, model
 * years, variants). Deletion is soft (deleted_at) for brands, models,
 * generations and variants and refused while live children exist; a model
 * year without variants is deleted for real. Every change is annotated on
 * the automatic audit record and refreshes the search index.
 */
@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaUrlService,
    private readonly assets: AssetGuard,
    private readonly search: VehicleSearchIndexer,
  ) {}

  // ---------------------------------------------------------------- brands

  private brandView(b: BrandRow): AdminBrandDto {
    return {
      id: b.id,
      slug: b.slug,
      nameEn: b.nameEn,
      nameAr: b.nameAr,
      countryCode: b.countryCode,
      websiteUrl: b.websiteUrl,
      logoAssetId: b.logoAssetId,
      logo: this.media.image(b.logoAsset, 'en'),
      descriptionEn: b.descriptionEn,
      descriptionAr: b.descriptionAr,
      sortOrder: b.sortOrder,
      modelCount: b._count.models,
      status: b.status,
      isDemo: b.isDemo,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      deletedAt: toIso(b.deletedAt),
    };
  }

  async listBrands(query: AdminCatalogListQueryDto) {
    const page = toPageRequest(query);
    const where: Prisma.BrandWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.status ? { status: query.status as ContentStatus } : {}),
      ...(query.q ? { OR: containsQ(query.q, ['nameEn', 'nameAr', 'slug']) } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.brand.findMany({
        where,
        include: BRAND_INCLUDE,
        orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.brand.count({ where }),
    ]);
    return { items: rows.map((b) => this.brandView(b)), total, page };
  }

  async getBrand(id: string): Promise<AdminBrandDto> {
    const b = await this.prisma.brand.findUnique({ where: { id }, include: BRAND_INCLUDE });
    if (!b) throw CatalogErrors.notFound('brand');
    return this.brandView(b);
  }

  async createBrand(dto: CreateBrandDto, actor: Actor): Promise<AdminBrandDto> {
    assertStatusChange(actor, null, dto.status);
    if (dto.logoAssetId) await this.assets.assertImage(dto.logoAssetId, 'logoAssetId');
    const slug = await resolveSlug(dto.slug, latinSlug(dto.nameEn), async (s) =>
      Boolean(await this.prisma.brand.findUnique({ where: { slug: s }, select: { id: true } })),
    );
    const created = await this.prisma.brand.create({
      data: {
        slug,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        countryCode: dto.countryCode ?? null,
        websiteUrl: dto.websiteUrl ?? null,
        logoAssetId: dto.logoAssetId ?? null,
        descriptionEn: cleanText(dto.descriptionEn, true),
        descriptionAr: cleanText(dto.descriptionAr, true),
        status: (dto.status as ContentStatus | undefined) ?? ContentStatus.draft,
        sortOrder: dto.sortOrder ?? 0,
        createdById: actor.id,
        updatedById: actor.id,
      },
      include: BRAND_INCLUDE,
    });
    this.audit.annotate({
      entityType: 'brand',
      entityId: created.id,
      after: stripInclude(created),
    });
    await this.search.reindexBrand(created.id);
    return this.brandView(created);
  }

  async updateBrand(id: string, dto: UpdateBrandDto, actor: Actor): Promise<AdminBrandDto> {
    const before = await this.prisma.brand.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('brand');
    assertStatusChange(actor, before.status, dto.status);
    if (dto.logoAssetId) await this.assets.assertImage(dto.logoAssetId, 'logoAssetId');
    let slug: string | undefined;
    if (dto.slug !== undefined && dto.slug !== before.slug) {
      slug = await resolveSlug(dto.slug, dto.slug, async (s) =>
        Boolean(await this.prisma.brand.findUnique({ where: { slug: s }, select: { id: true } })),
      );
    }
    const updated = await this.prisma.brand.update({
      where: { id },
      data: {
        slug,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        countryCode: dto.countryCode,
        websiteUrl: dto.websiteUrl,
        logoAssetId: dto.logoAssetId,
        descriptionEn:
          dto.descriptionEn === undefined ? undefined : cleanText(dto.descriptionEn, true),
        descriptionAr:
          dto.descriptionAr === undefined ? undefined : cleanText(dto.descriptionAr, true),
        status: dto.status as ContentStatus | undefined,
        sortOrder: dto.sortOrder,
        updatedById: actor.id,
      },
      include: BRAND_INCLUDE,
    });
    this.audit.annotate({
      entityType: 'brand',
      entityId: id,
      before,
      after: stripInclude(updated),
    });
    await this.search.reindexBrand(id);
    return this.brandView(updated);
  }

  async deleteBrand(id: string): Promise<void> {
    const before = await this.prisma.brand.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('brand');
    if (before.deletedAt) return;
    const models = await this.prisma.carModel.count({ where: { brandId: id, deletedAt: null } });
    if (models > 0) throw CatalogErrors.inUse('brand', { models });
    await this.prisma.brand.update({ where: { id }, data: { deletedAt: new Date() } });
    this.audit.annotate({ entityType: 'brand', entityId: id, action: 'brands.delete', before });
    await this.search.reindexBrand(id);
  }

  async restoreBrand(id: string): Promise<AdminBrandDto> {
    const before = await this.prisma.brand.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('brand');
    const b = await this.prisma.brand.update({
      where: { id },
      data: { deletedAt: null },
      include: BRAND_INCLUDE,
    });
    this.audit.annotate({ entityType: 'brand', entityId: id, before, after: stripInclude(b) });
    await this.search.reindexBrand(id);
    return this.brandView(b);
  }

  // ---------------------------------------------------------------- models

  private async variantCounts(modelIds: string[]): Promise<Map<string, number>> {
    if (modelIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<{ model_id: string; n: number }[]>(Prisma.sql`
      SELECT g.model_id, count(*)::int AS n
      FROM vehicle_variants v
      JOIN model_years my ON my.id = v.model_year_id
      JOIN generations g ON g.id = my.generation_id
      WHERE g.model_id = ANY(${modelIds}::uuid[]) AND v.deleted_at IS NULL
      GROUP BY g.model_id`);
    return new Map(rows.map((r) => [r.model_id, r.n]));
  }

  private modelView(m: ModelRow, variantCount: number): AdminModelDto {
    return {
      id: m.id,
      brandId: m.brandId,
      brandName: m.brand.nameEn,
      slug: m.slug,
      nameEn: m.nameEn,
      nameAr: m.nameAr,
      bodyType: m.bodyType,
      segment: m.segment,
      descriptionEn: m.descriptionEn,
      descriptionAr: m.descriptionAr,
      heroAssetId: m.heroAssetId,
      heroImage: this.media.image(m.heroAsset, 'en'),
      sortOrder: m.sortOrder,
      variantCount,
      visibilityBlockers: visibilityBlockers({ brand: m.brand, model: m }),
      status: m.status,
      isDemo: m.isDemo,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      deletedAt: toIso(m.deletedAt),
    };
  }

  async listModels(query: AdminModelListQueryDto) {
    const page = toPageRequest(query);
    const where: Prisma.CarModelWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.status ? { status: query.status as ContentStatus } : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.q
        ? {
            OR: [
              ...(containsQ(query.q, ['nameEn', 'nameAr', 'slug']) as Prisma.CarModelWhereInput[]),
              { brand: { OR: containsQ(query.q, ['nameEn', 'nameAr']) } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.carModel.findMany({
        where,
        include: MODEL_INCLUDE,
        orderBy: [{ brand: { nameEn: 'asc' } }, { sortOrder: 'asc' }, { nameEn: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.carModel.count({ where }),
    ]);
    const counts = await this.variantCounts(rows.map((r) => r.id));
    return { items: rows.map((m) => this.modelView(m, counts.get(m.id) ?? 0)), total, page };
  }

  async getModel(id: string): Promise<AdminModelDetailDto> {
    const m = await this.prisma.carModel.findUnique({
      where: { id },
      include: {
        ...MODEL_INCLUDE,
        competitors: { orderBy: { sortOrder: 'asc' }, select: { competitorModelId: true } },
        generations: {
          orderBy: [{ startYear: 'desc' }, { createdAt: 'desc' }],
          include: {
            modelYears: {
              orderBy: { year: 'desc' },
              include: {
                variants: {
                  orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
                  include: { markets: { select: { marketCode: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!m) throw CatalogErrors.notFound('model');
    const counts = await this.variantCounts([m.id]);
    const generations: AdminGenerationDto[] = m.generations.map((g) => ({
      id: g.id,
      modelId: g.modelId,
      slug: g.slug,
      nameEn: g.nameEn,
      nameAr: g.nameAr,
      code: g.code,
      startYear: g.startYear,
      endYear: g.endYear,
      isDemo: g.isDemo,
      deletedAt: toIso(g.deletedAt),
      modelYears: g.modelYears.map((y): AdminModelYearDto => ({
        id: y.id,
        generationId: y.generationId,
        year: y.year,
        isDemo: y.isDemo,
        variants: y.variants.map((v) => ({
          id: v.id,
          slug: v.slug,
          nameEn: v.nameEn,
          nameAr: v.nameAr,
          trimCode: v.trimCode,
          powertrainType: v.powertrainType,
          status: v.status,
          sortOrder: v.sortOrder,
          marketCodes: v.markets.map((x) => x.marketCode).sort(),
          deletedAt: toIso(v.deletedAt),
        })),
      })),
    }));
    return {
      ...this.modelView(m, counts.get(m.id) ?? 0),
      generations,
      competitorModelIds: m.competitors.map((c) => c.competitorModelId),
    };
  }

  private async assertBrandUsable(brandId: string, field = 'brandId'): Promise<void> {
    const b = await this.prisma.brand.findUnique({
      where: { id: brandId },
      select: { deletedAt: true },
    });
    if (!b) {
      throw fieldError(field, 'exists', { ar: 'الماركة غير موجودة.', en: 'Unknown brand.' });
    }
    if (b.deletedAt) throw CatalogErrors.deleted('brand');
  }

  private async modelSlugTaken(slug: string): Promise<boolean> {
    return Boolean(
      await this.prisma.carModel.findUnique({ where: { slug }, select: { id: true } }),
    );
  }

  async createModel(dto: CreateModelDto, actor: Actor): Promise<AdminModelDto> {
    assertStatusChange(actor, null, dto.status);
    await this.assertBrandUsable(dto.brandId);
    if (dto.heroAssetId) await this.assets.assertImage(dto.heroAssetId, 'heroAssetId');
    const brand = await this.prisma.brand.findUniqueOrThrow({ where: { id: dto.brandId } });
    const slug = await resolveSlug(dto.slug, latinSlug(brand.slug, dto.nameEn), (s) =>
      this.modelSlugTaken(s),
    );
    const m = await this.prisma.carModel.create({
      data: {
        brandId: dto.brandId,
        slug,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        bodyType: (dto.bodyType as BodyType | null | undefined) ?? null,
        segment: cleanText(dto.segment),
        descriptionEn: cleanText(dto.descriptionEn, true),
        descriptionAr: cleanText(dto.descriptionAr, true),
        heroAssetId: dto.heroAssetId ?? null,
        status: (dto.status as ContentStatus | undefined) ?? ContentStatus.draft,
        sortOrder: dto.sortOrder ?? 0,
        createdById: actor.id,
        updatedById: actor.id,
      },
      include: MODEL_INCLUDE,
    });
    this.audit.annotate({ entityType: 'model', entityId: m.id, after: stripInclude(m) });
    await this.search.reindexModel(m.id);
    return this.modelView(m, 0);
  }

  async updateModel(id: string, dto: UpdateModelDto, actor: Actor): Promise<AdminModelDto> {
    const before = await this.prisma.carModel.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('model');
    assertStatusChange(actor, before.status, dto.status);
    if (dto.brandId && dto.brandId !== before.brandId) await this.assertBrandUsable(dto.brandId);
    if (dto.heroAssetId) await this.assets.assertImage(dto.heroAssetId, 'heroAssetId');
    let slug: string | undefined;
    if (dto.slug !== undefined && dto.slug !== before.slug) {
      slug = await resolveSlug(dto.slug, dto.slug, (s) => this.modelSlugTaken(s));
    }
    const m = await this.prisma.carModel.update({
      where: { id },
      data: {
        brandId: dto.brandId,
        slug,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        bodyType: dto.bodyType as BodyType | null | undefined,
        segment: dto.segment === undefined ? undefined : cleanText(dto.segment),
        descriptionEn:
          dto.descriptionEn === undefined ? undefined : cleanText(dto.descriptionEn, true),
        descriptionAr:
          dto.descriptionAr === undefined ? undefined : cleanText(dto.descriptionAr, true),
        heroAssetId: dto.heroAssetId,
        status: dto.status as ContentStatus | undefined,
        sortOrder: dto.sortOrder,
        updatedById: actor.id,
      },
      include: MODEL_INCLUDE,
    });
    this.audit.annotate({ entityType: 'model', entityId: id, before, after: stripInclude(m) });
    await this.search.reindexModel(id);
    if (dto.brandId && dto.brandId !== before.brandId)
      await this.search.reindexBrand(before.brandId);
    const counts = await this.variantCounts([id]);
    return this.modelView(m, counts.get(id) ?? 0);
  }

  async deleteModel(id: string): Promise<void> {
    const before = await this.prisma.carModel.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('model');
    if (before.deletedAt) return;
    const counts = await this.variantCounts([id]);
    const variants = counts.get(id) ?? 0;
    if (variants > 0) throw CatalogErrors.inUse('model', { variants });
    await this.prisma.carModel.update({ where: { id }, data: { deletedAt: new Date() } });
    this.audit.annotate({ entityType: 'model', entityId: id, before });
    await this.search.reindexModel(id);
  }

  async restoreModel(id: string): Promise<AdminModelDto> {
    const before = await this.prisma.carModel.findUnique({
      where: { id },
      include: { brand: { select: { deletedAt: true } } },
    });
    if (!before) throw CatalogErrors.notFound('model');
    if (before.brand.deletedAt) throw CatalogErrors.deleted('brand');
    const m = await this.prisma.carModel.update({
      where: { id },
      data: { deletedAt: null },
      include: MODEL_INCLUDE,
    });
    this.audit.annotate({ entityType: 'model', entityId: id, after: stripInclude(m) });
    await this.search.reindexModel(id);
    const counts = await this.variantCounts([id]);
    return this.modelView(m, counts.get(id) ?? 0);
  }

  async replaceCompetitors(id: string, ids: string[]): Promise<string[]> {
    const model = await this.prisma.carModel.findUnique({
      where: { id },
      include: { competitors: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!model) throw CatalogErrors.notFound('model');
    if (ids.includes(id)) {
      throw fieldError('competitorModelIds', 'notSelf', {
        ar: 'لا يمكن أن تكون السيارة منافسة لنفسها.',
        en: 'A model cannot be its own competitor.',
      });
    }
    const found = await this.prisma.carModel.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      const missing = ids.filter((x) => !found.some((f) => f.id === x));
      throw fieldError('competitorModelIds', 'exists', {
        ar: `موديلات غير موجودة: ${missing.join(', ')}`,
        en: `Unknown models: ${missing.join(', ')}`,
      });
    }
    await this.prisma.$transaction([
      this.prisma.modelCompetitor.deleteMany({ where: { modelId: id } }),
      this.prisma.modelCompetitor.createMany({
        data: ids.map((competitorModelId, i) => ({
          modelId: id,
          competitorModelId,
          sortOrder: i,
        })),
      }),
    ]);
    this.audit.annotate({
      entityType: 'model',
      entityId: id,
      action: 'models.competitors.update',
      before: { competitorModelIds: model.competitors.map((c) => c.competitorModelId) },
      after: { competitorModelIds: ids },
    });
    return ids;
  }

  // ---------------------------------------------------------------- generations & years

  private async generationView(id: string): Promise<AdminGenerationDto> {
    const g = await this.prisma.generation.findUnique({
      where: { id },
      include: {
        modelYears: {
          orderBy: { year: 'desc' },
          include: {
            variants: {
              orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
              include: { markets: { select: { marketCode: true } } },
            },
          },
        },
      },
    });
    if (!g) throw CatalogErrors.notFound('generation');
    return {
      id: g.id,
      modelId: g.modelId,
      slug: g.slug,
      nameEn: g.nameEn,
      nameAr: g.nameAr,
      code: g.code,
      startYear: g.startYear,
      endYear: g.endYear,
      isDemo: g.isDemo,
      deletedAt: toIso(g.deletedAt),
      modelYears: g.modelYears.map((y) => ({
        id: y.id,
        generationId: y.generationId,
        year: y.year,
        isDemo: y.isDemo,
        variants: y.variants.map((v) => ({
          id: v.id,
          slug: v.slug,
          nameEn: v.nameEn,
          nameAr: v.nameAr,
          trimCode: v.trimCode,
          powertrainType: v.powertrainType,
          status: v.status,
          sortOrder: v.sortOrder,
          marketCodes: v.markets.map((x) => x.marketCode).sort(),
          deletedAt: toIso(v.deletedAt),
        })),
      })),
    };
  }

  getGeneration(id: string): Promise<AdminGenerationDto> {
    return this.generationView(id);
  }

  private assertYearOrder(start: number | null | undefined, end: number | null | undefined) {
    if (start !== null && start !== undefined && end !== null && end !== undefined && start > end) {
      throw fieldError('endYear', 'order', {
        ar: 'سنة النهاية يجب ألا تسبق سنة البداية.',
        en: 'The end year cannot be before the start year.',
      });
    }
  }

  async createGeneration(dto: CreateGenerationDto): Promise<AdminGenerationDto> {
    const model = await this.prisma.carModel.findUnique({ where: { id: dto.modelId } });
    if (!model) {
      throw fieldError('modelId', 'exists', { ar: 'الموديل غير موجود.', en: 'Unknown model.' });
    }
    if (model.deletedAt) throw CatalogErrors.deleted('model');
    this.assertYearOrder(dto.startYear, dto.endYear);
    const slug = await resolveSlug(dto.slug, latinSlug(dto.nameEn), async (s) =>
      Boolean(
        await this.prisma.generation.findUnique({
          where: { modelId_slug: { modelId: dto.modelId, slug: s } },
          select: { id: true },
        }),
      ),
    );
    const g = await this.prisma.generation.create({
      data: {
        modelId: dto.modelId,
        slug,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        code: cleanText(dto.code),
        startYear: dto.startYear ?? null,
        endYear: dto.endYear ?? null,
      },
    });
    this.audit.annotate({ entityType: 'generation', entityId: g.id, after: g });
    return this.generationView(g.id);
  }

  async updateGeneration(id: string, dto: UpdateGenerationDto): Promise<AdminGenerationDto> {
    const before = await this.prisma.generation.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('generation');
    if (dto.modelId !== undefined && dto.modelId !== before.modelId) {
      throw fieldError('modelId', 'immutable', {
        ar: 'لا يمكن نقل الجيل إلى موديل آخر.',
        en: 'A generation cannot be moved to another model.',
      });
    }
    this.assertYearOrder(
      dto.startYear !== undefined ? dto.startYear : before.startYear,
      dto.endYear !== undefined ? dto.endYear : before.endYear,
    );
    let slug: string | undefined;
    if (dto.slug !== undefined && dto.slug !== before.slug) {
      slug = await resolveSlug(dto.slug, dto.slug, async (s) =>
        Boolean(
          await this.prisma.generation.findUnique({
            where: { modelId_slug: { modelId: before.modelId, slug: s } },
            select: { id: true },
          }),
        ),
      );
    }
    const g = await this.prisma.generation.update({
      where: { id },
      data: {
        slug,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        code: dto.code === undefined ? undefined : cleanText(dto.code),
        startYear: dto.startYear,
        endYear: dto.endYear,
      },
    });
    this.audit.annotate({ entityType: 'generation', entityId: id, before, after: g });
    await this.search.reindexModel(g.modelId);
    return this.generationView(id);
  }

  async deleteGeneration(id: string): Promise<void> {
    const before = await this.prisma.generation.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('generation');
    if (before.deletedAt) return;
    const variants = await this.prisma.vehicleVariant.count({
      where: { deletedAt: null, modelYear: { generationId: id } },
    });
    if (variants > 0) throw CatalogErrors.inUse('generation', { variants });
    await this.prisma.generation.update({ where: { id }, data: { deletedAt: new Date() } });
    this.audit.annotate({ entityType: 'generation', entityId: id, before });
    await this.search.reindexModel(before.modelId);
  }

  async restoreGeneration(id: string): Promise<AdminGenerationDto> {
    const before = await this.prisma.generation.findUnique({
      where: { id },
      include: { model: { select: { deletedAt: true } } },
    });
    if (!before) throw CatalogErrors.notFound('generation');
    if (before.model.deletedAt) throw CatalogErrors.deleted('model');
    await this.prisma.generation.update({ where: { id }, data: { deletedAt: null } });
    this.audit.annotate({ entityType: 'generation', entityId: id, after: { deletedAt: null } });
    await this.search.reindexModel(before.modelId);
    return this.generationView(id);
  }

  async createModelYear(dto: CreateModelYearDto): Promise<AdminModelYearDto> {
    const g = await this.prisma.generation.findUnique({ where: { id: dto.generationId } });
    if (!g) {
      throw fieldError('generationId', 'exists', {
        ar: 'الجيل غير موجود.',
        en: 'Unknown generation.',
      });
    }
    if (g.deletedAt) throw CatalogErrors.deleted('generation');
    const existing = await this.prisma.modelYear.findUnique({
      where: { generationId_year: { generationId: dto.generationId, year: dto.year } },
    });
    if (existing) throw CatalogErrors.exists('model_year', { id: existing.id, year: dto.year });
    const y = await this.prisma.modelYear.create({
      data: { generationId: dto.generationId, year: dto.year },
    });
    this.audit.annotate({ entityType: 'model_year', entityId: y.id, after: y });
    return { id: y.id, generationId: y.generationId, year: y.year, isDemo: y.isDemo, variants: [] };
  }

  async deleteModelYear(id: string): Promise<void> {
    const before = await this.prisma.modelYear.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('model_year');
    const variants = await this.prisma.vehicleVariant.count({ where: { modelYearId: id } });
    if (variants > 0) throw CatalogErrors.inUse('model_year', { variants });
    await this.prisma.modelYear.delete({ where: { id } });
    this.audit.annotate({ entityType: 'model_year', entityId: id, before });
  }

  // ---------------------------------------------------------------- variants

  variantView(v: VariantRow): AdminVariantDto {
    const g = v.modelYear.generation;
    return {
      id: v.id,
      slug: v.slug,
      nameEn: v.nameEn,
      nameAr: v.nameAr,
      trimCode: v.trimCode,
      powertrainType: v.powertrainType,
      bodyType: v.bodyType,
      driveType: v.driveType,
      seats: v.seats,
      doors: v.doors,
      sortOrder: v.sortOrder,
      publishedAt: toIso(v.publishedAt),
      modelYearId: v.modelYearId,
      year: v.modelYear.year,
      generationId: g.id,
      generationName: g.nameEn,
      modelId: g.model.id,
      modelSlug: g.model.slug,
      modelName: g.model.nameEn,
      brandId: g.model.brand.id,
      brandName: g.model.brand.nameEn,
      marketCodes: v.markets.map((m) => m.marketCode).sort(),
      visibilityBlockers: visibilityBlockers({
        brand: g.model.brand,
        model: g.model,
        generation: g,
        variant: v,
        marketAvailabilities: v.markets.map((m) => m.availability),
      }),
      status: v.status,
      isDemo: v.isDemo,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
      deletedAt: toIso(v.deletedAt),
    };
  }

  async listVariants(query: AdminVariantListQueryDto) {
    const page = toPageRequest(query);
    const where: Prisma.VehicleVariantWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.status ? { status: query.status as ContentStatus } : {}),
      ...(query.powertrainType ? { powertrainType: query.powertrainType as PowertrainType } : {}),
      ...(query.modelYearId ? { modelYearId: query.modelYearId } : {}),
      ...(query.marketCode ? { markets: { some: { marketCode: query.marketCode } } } : {}),
      modelYear: {
        ...(query.year ? { year: query.year } : {}),
        ...(query.generationId ? { generationId: query.generationId } : {}),
        generation: {
          ...(query.modelId ? { modelId: query.modelId } : {}),
          ...(query.brandId ? { model: { brandId: query.brandId } } : {}),
        },
      },
      ...(query.q
        ? {
            OR: [
              { nameEn: { contains: query.q, mode: 'insensitive' } },
              { nameAr: { contains: query.q, mode: 'insensitive' } },
              { slug: { contains: query.q, mode: 'insensitive' } },
              { trimCode: { contains: query.q, mode: 'insensitive' } },
              {
                modelYear: {
                  generation: {
                    model: {
                      OR: [
                        { nameEn: { contains: query.q, mode: 'insensitive' } },
                        { nameAr: { contains: query.q, mode: 'insensitive' } },
                        { brand: { nameEn: { contains: query.q, mode: 'insensitive' } } },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.vehicleVariant.findMany({
        where,
        include: VARIANT_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.vehicleVariant.count({ where }),
    ]);
    return { items: rows.map((v) => this.variantView(v)), total, page };
  }

  async getVariantRow(id: string): Promise<VariantRow> {
    const v = await this.prisma.vehicleVariant.findUnique({
      where: { id },
      include: VARIANT_INCLUDE,
    });
    if (!v) throw CatalogErrors.notFound('variant');
    return v;
  }

  private async assertVariantUnique(
    modelYearId: string,
    powertrainType: string,
    nameEn: string,
    exceptId?: string,
  ): Promise<void> {
    const dup = await this.prisma.vehicleVariant.findFirst({
      where: {
        modelYearId,
        powertrainType: powertrainType as PowertrainType,
        nameEn,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true, deletedAt: true },
    });
    if (dup) {
      throw CatalogErrors.exists('variant', {
        id: dup.id,
        deleted: dup.deletedAt !== null,
        rule: 'model year + powertrain + English name',
      });
    }
  }

  private async variantSlugTaken(slug: string): Promise<boolean> {
    return Boolean(
      await this.prisma.vehicleVariant.findUnique({ where: { slug }, select: { id: true } }),
    );
  }

  async createVariant(dto: CreateVariantDto, actor: Actor): Promise<AdminVariantDto> {
    assertStatusChange(actor, null, dto.status);
    const year = await this.prisma.modelYear.findUnique({
      where: { id: dto.modelYearId },
      include: { generation: { include: { model: true } } },
    });
    if (!year) {
      throw fieldError('modelYearId', 'exists', {
        ar: 'سنة الموديل غير موجودة.',
        en: 'Unknown model year.',
      });
    }
    if (year.generation.deletedAt) throw CatalogErrors.deleted('generation');
    if (year.generation.model.deletedAt) throw CatalogErrors.deleted('model');
    await this.assertVariantUnique(dto.modelYearId, dto.powertrainType, dto.nameEn);
    const slug = await resolveSlug(
      dto.slug,
      latinSlug(year.generation.model.slug, year.year, dto.nameEn, dto.powertrainType),
      (s) => this.variantSlugTaken(s),
    );
    const status = (dto.status as ContentStatus | undefined) ?? ContentStatus.draft;
    const created = await this.prisma.vehicleVariant.create({
      data: {
        modelYearId: dto.modelYearId,
        slug,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        trimCode: cleanText(dto.trimCode),
        powertrainType: dto.powertrainType as PowertrainType,
        bodyType: (dto.bodyType as BodyType | null | undefined) ?? null,
        driveType: (dto.driveType as DriveType | null | undefined) ?? null,
        seats: dto.seats ?? null,
        doors: dto.doors ?? null,
        sortOrder: dto.sortOrder ?? 0,
        status,
        publishedAt: status === ContentStatus.published ? new Date() : null,
        createdById: actor.id,
        updatedById: actor.id,
      },
      include: VARIANT_INCLUDE,
    });
    this.audit.annotate({
      entityType: 'variant',
      entityId: created.id,
      after: stripInclude(created),
    });
    await this.search.reindexModel(year.generation.modelId);
    return this.variantView(created);
  }

  /** Refuses powertrain changes that would mix BEV / hybrid-only data. */
  private async assertPowertrainChange(variantId: string, to: PowertrainType): Promise<void> {
    if (to === PowertrainType.BEV) {
      const [ranges, fuel] = await Promise.all([
        this.prisma.rangeMeasurement.count({
          where: { variantId, rangeType: { not: RangeType.electric } },
        }),
        this.prisma.consumptionMeasurement.count({
          where: { variantId, kind: { not: ConsumptionKind.electricity } },
        }),
      ]);
      if (ranges + fuel > 0) {
        throw CatalogErrors.notApplicable('bev_has_hybrid_data', {
          ar: 'لا يمكن تحويل الفئة إلى كهربائية بالكامل (BEV) لأن لها مدى إجماليًا أو استهلاك وقود. احذف هذه البيانات أو أنشئ فئة منفصلة.',
          en: 'The variant has total-range or fuel-consumption data and cannot become a BEV. Remove that data or create a separate variant.',
        });
      }
    }
    if (to === PowertrainType.HEV) {
      const [inlets, times, curves, electricRanges] = await Promise.all([
        this.prisma.variantMarketInlet.count({ where: { variantMarket: { variantId } } }),
        this.prisma.chargingTimeMeasurement.count({ where: { variantId } }),
        this.prisma.chargingCurve.count({ where: { variantId } }),
        this.prisma.rangeMeasurement.count({ where: { variantId, rangeType: RangeType.electric } }),
      ]);
      if (inlets + times + curves + electricRanges > 0) {
        throw CatalogErrors.notApplicable('hev_has_charging_data', {
          ar: 'الهجينة العادية (HEV) لا تُشحن من الخارج: احذف منافذ الشحن وأزمنة ومنحنيات الشحن والمدى الكهربائي أولًا.',
          en: 'A self-charging hybrid (HEV) has no plug: remove its inlets, charging times/curves and electric range first.',
        });
      }
    }
  }

  async updateVariant(id: string, dto: UpdateVariantDto, actor: Actor): Promise<AdminVariantDto> {
    const before = await this.prisma.vehicleVariant.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('variant');
    assertStatusChange(actor, before.status, dto.status);
    const modelYearId = dto.modelYearId ?? before.modelYearId;
    let modelIdChanged: string | null = null;
    if (dto.modelYearId && dto.modelYearId !== before.modelYearId) {
      const year = await this.prisma.modelYear.findUnique({
        where: { id: dto.modelYearId },
        include: { generation: { include: { model: { select: { deletedAt: true } } } } },
      });
      if (!year) {
        throw fieldError('modelYearId', 'exists', {
          ar: 'سنة الموديل غير موجودة.',
          en: 'Unknown model year.',
        });
      }
      if (year.generation.deletedAt) throw CatalogErrors.deleted('generation');
      if (year.generation.model.deletedAt) throw CatalogErrors.deleted('model');
      const old = await this.prisma.modelYear.findUniqueOrThrow({
        where: { id: before.modelYearId },
        include: { generation: true },
      });
      if (old.generation.modelId !== year.generation.modelId) {
        modelIdChanged = old.generation.modelId;
      }
    }
    const powertrainType =
      (dto.powertrainType as PowertrainType | undefined) ?? before.powertrainType;
    if (powertrainType !== before.powertrainType) {
      await this.assertPowertrainChange(id, powertrainType);
    }
    const nameEn = dto.nameEn ?? before.nameEn;
    if (
      modelYearId !== before.modelYearId ||
      powertrainType !== before.powertrainType ||
      nameEn !== before.nameEn
    ) {
      await this.assertVariantUnique(modelYearId, powertrainType, nameEn, id);
    }
    let slug: string | undefined;
    if (dto.slug !== undefined && dto.slug !== before.slug) {
      slug = await resolveSlug(dto.slug, dto.slug, (s) => this.variantSlugTaken(s));
    }
    const status = dto.status as ContentStatus | undefined;
    const updated = await this.prisma.vehicleVariant.update({
      where: { id },
      data: {
        modelYearId: dto.modelYearId,
        slug,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        trimCode: dto.trimCode === undefined ? undefined : cleanText(dto.trimCode),
        powertrainType: dto.powertrainType as PowertrainType | undefined,
        bodyType: dto.bodyType as BodyType | null | undefined,
        driveType: dto.driveType as DriveType | null | undefined,
        seats: dto.seats,
        doors: dto.doors,
        sortOrder: dto.sortOrder,
        status,
        publishedAt:
          status === ContentStatus.published && !before.publishedAt ? new Date() : undefined,
        updatedById: actor.id,
      },
      include: VARIANT_INCLUDE,
    });
    this.audit.annotate({
      entityType: 'variant',
      entityId: id,
      before,
      after: stripInclude(updated),
    });
    await this.search.reindexModel(updated.modelYear.generation.modelId);
    if (modelIdChanged) await this.search.reindexModel(modelIdChanged);
    return this.variantView(updated);
  }

  async deleteVariant(id: string): Promise<void> {
    const before = await this.prisma.vehicleVariant.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('variant');
    if (before.deletedAt) return;
    await this.prisma.vehicleVariant.update({ where: { id }, data: { deletedAt: new Date() } });
    this.audit.annotate({ entityType: 'variant', entityId: id, before });
    await this.search.reindexVariant(id);
  }

  async restoreVariant(id: string): Promise<AdminVariantDto> {
    const v = await this.getVariantRow(id);
    if (v.modelYear.generation.deletedAt) throw CatalogErrors.deleted('generation');
    if (v.modelYear.generation.model.deletedAt) throw CatalogErrors.deleted('model');
    const updated = await this.prisma.vehicleVariant.update({
      where: { id },
      data: { deletedAt: null },
      include: VARIANT_INCLUDE,
    });
    this.audit.annotate({ entityType: 'variant', entityId: id, after: stripInclude(updated) });
    await this.search.reindexVariant(id);
    return this.variantView(updated);
  }
}

/** Removes relation payloads from a row before it goes into the audit log. */
export function stripInclude<T extends object>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    if (k.startsWith('_')) continue;
    if (v !== null && typeof v === 'object' && !(v instanceof Date) && !isDecimalLike(v)) continue;
    out[k] = v;
  }
  return out;
}

function isDecimalLike(v: object): boolean {
  return typeof (v as { toFixed?: unknown }).toFixed === 'function';
}
