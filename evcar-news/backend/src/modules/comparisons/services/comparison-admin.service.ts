import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { toPageRequest, type PageRequest } from '../../../common/http/pagination';
import { ContentStatus, type Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit';
import { MarketContextService } from '../../vehicles';
import { ComparisonErrors, fieldErrors, ITEM_MESSAGES, type FieldProblem } from '../common/errors';
import type {
  AdminComparisonDto,
  AdminComparisonListQueryDto,
  CreateCuratedComparisonDto,
  UpdateCuratedComparisonDto,
} from '../dto/admin.dto';
import { ComparisonsService, ITEMS_INCLUDE, type ComparisonWithItems } from './comparisons.service';
import { ItemResolverService } from './item-resolver.service';

function snapshot(c: ComparisonWithItems) {
  return {
    titleAr: c.titleAr,
    titleEn: c.titleEn,
    marketCode: c.marketCode,
    status: c.curatedStatus,
    order: c.curatedOrder,
    items: c.items.map((i) => `${i.variantId}@${i.marketCode}`),
  };
}

/**
 * Featured ("مقارنات مختارة") comparisons managed by editors
 * (`comparisons.curate`). No owner; published ones need ar + en titles (also
 * a DB CHECK) and appear on the home page of their market. Every change is
 * audited by the admin interceptor with before / after.
 */
@Injectable()
export class ComparisonAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ItemResolverService,
    private readonly comparisons: ComparisonsService,
    private readonly markets: MarketContextService,
    private readonly audit: AuditService,
  ) {}

  private async view(
    c: ComparisonWithItems,
    lang: SupportedLanguage,
    views?: Awaited<ReturnType<ComparisonsService['itemViews']>>,
  ): Promise<AdminComparisonDto> {
    return {
      ...(await this.comparisons.toDto(c, null, lang, views)),
      titleAr: c.titleAr,
      titleEn: c.titleEn,
      status: c.curatedStatus ?? ContentStatus.draft,
      order: c.curatedOrder,
      viewCount: c.viewCount,
      lastViewedAt: c.lastViewedAt?.toISOString() ?? null,
    };
  }

  private async curated(id: string): Promise<ComparisonWithItems> {
    const c = await this.prisma.comparison.findFirst({
      where: { id, isCurated: true },
      include: ITEMS_INCLUDE,
    });
    if (!c) throw ComparisonErrors.notFound();
    return c;
  }

  private async checkMarket(code: string): Promise<void> {
    if (!(await this.markets.all()).get(code)) {
      throw fieldErrors([
        { field: 'marketCode', rule: 'unknownMarket', message: ITEM_MESSAGES.unknownMarket },
      ]);
    }
  }

  private checkTitles(status: string, titleAr: string | null, titleEn: string | null): void {
    if (status !== ContentStatus.published) return;
    const problems: FieldProblem[] = [];
    if (!titleAr?.trim())
      problems.push({ field: 'titleAr', rule: 'required', message: ITEM_MESSAGES.titlesRequired });
    if (!titleEn?.trim())
      problems.push({ field: 'titleEn', rule: 'required', message: ITEM_MESSAGES.titlesRequired });
    if (problems.length) throw fieldErrors(problems);
  }

  async list(
    q: AdminComparisonListQueryDto,
    lang: SupportedLanguage,
  ): Promise<{ items: AdminComparisonDto[]; total: number; page: PageRequest }> {
    const page = toPageRequest(q);
    const where: Prisma.ComparisonWhereInput = {
      isCurated: true,
      ...(q.status ? { curatedStatus: q.status } : {}),
      ...(q.marketCode ? { marketCode: q.marketCode } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.comparison.findMany({
        where,
        include: ITEMS_INCLUDE,
        orderBy: [{ curatedOrder: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.comparison.count({ where }),
    ]);
    const views = await this.comparisons.itemViewsMany(
      rows.map((c) => c.items),
      lang,
    );
    return {
      items: await Promise.all(rows.map((c, i) => this.view(c, lang, views[i]))),
      total,
      page,
    };
  }

  async get(id: string, lang: SupportedLanguage): Promise<AdminComparisonDto> {
    return this.view(await this.curated(id), lang);
  }

  async create(
    dto: CreateCuratedComparisonDto,
    lang: SupportedLanguage,
  ): Promise<AdminComparisonDto> {
    const status = dto.status ?? ContentStatus.draft;
    await this.checkMarket(dto.marketCode);
    this.checkTitles(status, dto.titleAr ?? null, dto.titleEn ?? null);
    const items = await this.resolver.resolve(dto.items);
    const row = await this.comparisons.createRow({
      userId: null,
      title: null,
      marketCode: dto.marketCode,
      signature: null,
      items,
      curated: {
        titleAr: dto.titleAr ?? null,
        titleEn: dto.titleEn ?? null,
        status,
        order: dto.order ?? null,
      },
    });
    this.audit.annotate({ entityType: 'comparison', entityId: row.id, after: snapshot(row) });
    return this.view(row, lang);
  }

  async update(
    id: string,
    dto: UpdateCuratedComparisonDto,
    lang: SupportedLanguage,
  ): Promise<AdminComparisonDto> {
    const before = await this.curated(id);
    const status = dto.status ?? before.curatedStatus ?? ContentStatus.draft;
    const titleAr = dto.titleAr !== undefined ? dto.titleAr : before.titleAr;
    const titleEn = dto.titleEn !== undefined ? dto.titleEn : before.titleEn;
    if (dto.marketCode) await this.checkMarket(dto.marketCode);
    this.checkTitles(status, titleAr, titleEn);
    const items = dto.items ? await this.resolver.resolve(dto.items) : null;
    const after = await this.prisma.$transaction(async (tx) => {
      if (items) {
        // position is unique: replace the items (2–4 checked at COMMIT).
        await tx.comparisonItem.deleteMany({ where: { comparisonId: id } });
        await tx.comparisonItem.createMany({
          data: items.map((i) => ({
            comparisonId: id,
            variantId: i.variantId,
            marketCode: i.marketCode,
            position: i.position,
          })),
        });
      }
      return tx.comparison.update({
        where: { id },
        data: {
          titleAr: titleAr || null,
          titleEn: titleEn || null,
          curatedStatus: status,
          ...(dto.order !== undefined ? { curatedOrder: dto.order } : {}),
          ...(dto.marketCode ? { marketCode: dto.marketCode } : {}),
          ...(items ? { isDemo: items.some((i) => i.isDemo) } : {}),
        },
        include: ITEMS_INCLUDE,
      });
    });
    this.audit.annotate({
      entityType: 'comparison',
      entityId: id,
      before: snapshot(before),
      after: snapshot(after),
    });
    return this.view(after, lang);
  }

  async remove(id: string): Promise<void> {
    const before = await this.curated(id);
    await this.prisma.comparison.delete({ where: { id } });
    this.audit.annotate({ entityType: 'comparison', entityId: id, before: snapshot(before) });
  }
}
