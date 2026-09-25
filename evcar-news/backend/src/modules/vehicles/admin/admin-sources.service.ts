import { Injectable } from '@nestjs/common';
import { toPageRequest } from '../../../common/http/pagination';
import type { Prisma, SpecificationSource } from '../../../generated/prisma/client';
import type { SourceType } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit';
import { CatalogErrors } from '../common/catalog-errors';
import type { Actor } from '../common/data-point';
import { cleanText, parseDateOnly } from '../common/values';
import { sourceView } from '../common/views';
import type {
  AdminSourceDto,
  CreateSourceDto,
  SourceListQueryDto,
  UpdateSourceDto,
} from '../dto/admin-data.dto';
import { AssetGuard } from './asset-guard';

/** Every relation that cites a source (deletion is refused while any is > 0). */
export const SOURCE_RELATIONS = [
  'specifications',
  'rangeMeasurements',
  'consumptionMeasurements',
  'variantMarketInlets',
  'chargingCurves',
  'chargingTimes',
  'prices',
  'variantMarkets',
  'tariffs',
  'energyPrices',
] as const;

/**
 * Data sources ("مصادر البيانات"): where a spec, price, range or tariff
 * came from. Shared with the stations module (tariffs, energy prices), so
 * writes need `sources.write`, not a vehicles permission.
 */
@Injectable()
export class AdminSourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assets: AssetGuard,
  ) {}

  private view(s: SpecificationSource, usage?: Record<string, number>): AdminSourceDto {
    return {
      ...sourceView(s)!,
      language: s.language,
      notes: s.notes,
      isDemo: s.isDemo,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      ...(usage ? { usage } : {}),
    };
  }

  async list(query: SourceListQueryDto) {
    const page = toPageRequest(query);
    const where: Prisma.SpecificationSourceWhereInput = {
      ...(query.type ? { type: query.type as SourceType } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { publisher: { contains: query.q, mode: 'insensitive' } },
              { url: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.specificationSource.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.specificationSource.count({ where }),
    ]);
    return { items: rows.map((s) => this.view(s)), total, page };
  }

  private async usage(id: string): Promise<Record<string, number>> {
    const row = await this.prisma.specificationSource.findUnique({
      where: { id },
      select: { _count: { select: Object.fromEntries(SOURCE_RELATIONS.map((r) => [r, true])) } },
    });
    const counts = (row as { _count?: Record<string, number> } | null)?._count ?? {};
    return Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
  }

  async get(id: string): Promise<AdminSourceDto> {
    const s = await this.prisma.specificationSource.findUnique({ where: { id } });
    if (!s) throw CatalogErrors.notFound('source');
    return this.view(s, await this.usage(id));
  }

  async create(dto: CreateSourceDto, actor: Actor): Promise<AdminSourceDto> {
    if (dto.marketCode) await this.assets.market(dto.marketCode);
    const s = await this.prisma.specificationSource.create({
      data: {
        type: dto.type as SourceType,
        title: dto.title,
        publisher: cleanText(dto.publisher),
        url: dto.url ?? null,
        documentDate: dto.documentDate ? parseDateOnly(dto.documentDate) : null,
        accessedAt: dto.accessedAt ? new Date(dto.accessedAt) : null,
        marketCode: dto.marketCode ?? null,
        language: dto.language ?? null,
        notes: cleanText(dto.notes, true),
        createdById: actor.id,
      },
    });
    this.audit.annotate({ entityType: 'source', entityId: s.id, after: s });
    return this.view(s);
  }

  async update(id: string, dto: UpdateSourceDto): Promise<AdminSourceDto> {
    const before = await this.prisma.specificationSource.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('source');
    if (dto.marketCode) await this.assets.market(dto.marketCode);
    const s = await this.prisma.specificationSource.update({
      where: { id },
      data: {
        type: dto.type as SourceType | undefined,
        title: dto.title,
        publisher: dto.publisher === undefined ? undefined : cleanText(dto.publisher),
        url: dto.url,
        documentDate:
          dto.documentDate === undefined
            ? undefined
            : dto.documentDate
              ? parseDateOnly(dto.documentDate)
              : null,
        accessedAt:
          dto.accessedAt === undefined
            ? undefined
            : dto.accessedAt
              ? new Date(dto.accessedAt)
              : null,
        marketCode: dto.marketCode,
        language: dto.language,
        notes: dto.notes === undefined ? undefined : cleanText(dto.notes, true),
      },
    });
    this.audit.annotate({ entityType: 'source', entityId: id, before, after: s });
    return this.view(s, await this.usage(id));
  }

  async remove(id: string): Promise<void> {
    const before = await this.prisma.specificationSource.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('source');
    const usage = await this.usage(id);
    if (Object.keys(usage).length > 0) throw CatalogErrors.inUse('source', usage);
    await this.prisma.specificationSource.delete({ where: { id } });
    this.audit.annotate({ entityType: 'source', entityId: id, before });
  }
}
