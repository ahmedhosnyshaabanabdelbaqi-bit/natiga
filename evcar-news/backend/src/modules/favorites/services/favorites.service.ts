import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { toPageRequest } from '../../../common/http/pagination';
import { paginated, type PaginatedResponse } from '../../../common/http/responses';
import { FavoriteTargetType, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { conflict, notFound } from '../../search/common/discovery-http';
import type {
  FavoriteKeyDto,
  FavoriteViewDto,
  MergeFavoritesDto,
  MergeResultDto,
} from '../dto/favorites.dto';
import { FavoriteTargetsService, TARGET_COLUMN } from './favorite-targets.service';

export const FAVORITES_LIMIT = 1000;

type FavRow = {
  id: string;
  targetType: FavoriteTargetType;
  articleId: string | null;
  modelId: string | null;
  variantId: string | null;
  stationId: string | null;
  comparisonId: string | null;
  tourId: string | null;
  createdAt: Date;
};

export function targetIdOf(r: FavRow): string {
  return r[TARGET_COLUMN[r.targetType]] as string;
}

/**
 * Personal favorites (REQUIREMENTS §14). Every query is scoped by the
 * caller's user id (strict isolation); a target can only be added while it
 * is publicly visible (comparisons: curated + published, anonymous shares or
 * the caller's own).
 */
@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: FavoriteTargetsService,
  ) {}

  async list(
    userId: string,
    q: { type?: FavoriteTargetType; page?: number; pageSize?: number },
    lang: SupportedLanguage,
  ): Promise<PaginatedResponse<FavoriteViewDto>> {
    const page = toPageRequest(q);
    const where: Prisma.FavoriteWhereInput = { userId, ...(q.type ? { targetType: q.type } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.favorite.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.favorite.count({ where }),
    ]);
    return paginated(await this.views(rows, userId, lang), total, page);
  }

  async keys(userId: string): Promise<FavoriteKeyDto[]> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: FAVORITES_LIMIT,
    });
    return rows.map((r) => ({
      type: r.targetType,
      id: targetIdOf(r),
      savedAt: r.createdAt.toISOString(),
    }));
  }

  async add(
    userId: string,
    type: FavoriteTargetType,
    id: string,
    lang: SupportedLanguage,
  ): Promise<{ created: boolean; view: FavoriteViewDto }> {
    const existing = await this.findOne(userId, type, id);
    if (existing) return { created: false, view: (await this.views([existing], userId, lang))[0] };
    const info = (await this.targets.resolve(type, [id], userId, lang)).get(id);
    if (!info?.available) throw this.targetNotFound();
    const count = await this.prisma.favorite.count({ where: { userId } });
    if (count >= FAVORITES_LIMIT) throw this.limitReached();
    try {
      const row = await this.prisma.favorite.create({
        data: { userId, targetType: type, [TARGET_COLUMN[type]]: id },
      });
      return { created: true, view: (await this.views([row], userId, lang))[0] };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const row = await this.findOne(userId, type, id);
        if (row) return { created: false, view: (await this.views([row], userId, lang))[0] };
      }
      throw err;
    }
  }

  async remove(userId: string, type: FavoriteTargetType, id: string): Promise<void> {
    await this.prisma.favorite.deleteMany({
      where: { userId, targetType: type, [TARGET_COLUMN[type]]: id },
    });
  }

  /** Guest → account merge: adds what is visible, reports the rest; idempotent. */
  async merge(
    userId: string,
    dto: MergeFavoritesDto,
    lang: SupportedLanguage,
  ): Promise<MergeResultDto> {
    const seen = new Set<string>();
    const items = dto.items.filter((i) => {
      const k = `${i.type}:${i.id.toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const skipped: MergeResultDto['skipped'] = [];
    let added = 0;
    let alreadyPresent = 0;
    const now = Date.now();

    const existing = await this.prisma.favorite.findMany({ where: { userId } });
    const have = new Set(existing.map((r) => `${r.targetType}:${targetIdOf(r)}`));
    let count = existing.length;

    const byType = new Map<FavoriteTargetType, string[]>();
    for (const i of items) byType.set(i.type, [...(byType.get(i.type) ?? []), i.id.toLowerCase()]);
    const infos = new Map<string, boolean>();
    for (const [type, ids] of byType) {
      const res = await this.targets.resolve(type, ids, userId, lang);
      for (const id of ids) infos.set(`${type}:${id}`, !!res.get(id)?.available);
    }

    const toCreate: Prisma.FavoriteCreateManyInput[] = [];
    for (const i of items) {
      const id = i.id.toLowerCase();
      const key = `${i.type}:${id}`;
      if (have.has(key)) {
        alreadyPresent += 1;
        continue;
      }
      if (!infos.get(key)) {
        skipped.push({ type: i.type, id: i.id, reason: 'not_found' });
        continue;
      }
      if (count >= FAVORITES_LIMIT) {
        skipped.push({ type: i.type, id: i.id, reason: 'limit_reached' });
        continue;
      }
      const saved = i.savedAt ? new Date(i.savedAt) : null;
      toCreate.push({
        userId,
        targetType: i.type,
        [TARGET_COLUMN[i.type]]: id,
        createdAt: saved && saved.getTime() <= now ? saved : new Date(now),
      });
      have.add(key);
      count += 1;
    }
    if (toCreate.length) {
      const res = await this.prisma.favorite.createMany({ data: toCreate, skipDuplicates: true });
      added = res.count;
      alreadyPresent += toCreate.length - res.count;
    }
    return { added, alreadyPresent, skipped, keys: await this.keys(userId) };
  }

  // ---------------------------------------------------------------------------------------

  private findOne(userId: string, type: FavoriteTargetType, id: string) {
    return this.prisma.favorite.findFirst({
      where: { userId, targetType: type, [TARGET_COLUMN[type]]: id },
    });
  }

  private async views(rows: FavRow[], userId: string, lang: SupportedLanguage) {
    const byType = new Map<FavoriteTargetType, string[]>();
    for (const r of rows)
      byType.set(r.targetType, [...(byType.get(r.targetType) ?? []), targetIdOf(r)]);
    const infos = new Map<string, Awaited<ReturnType<FavoriteTargetsService['resolve']>>>();
    for (const [type, ids] of byType)
      infos.set(type, await this.targets.resolve(type, ids, userId, lang));
    return rows.map((r): FavoriteViewDto => {
      const id = targetIdOf(r);
      const info = infos.get(r.targetType)?.get(id);
      return {
        type: r.targetType,
        id,
        savedAt: r.createdAt.toISOString(),
        available: info?.available ?? false,
        title: info?.title ?? '',
        subtitle: info?.subtitle ?? null,
        imageUrl: info?.available ? info.imageUrl : null,
        slug: info?.slug ?? null,
        shareId: info?.available ? info.shareId : null,
        isDemo: info?.isDemo ?? false,
      };
    });
  }

  private targetNotFound() {
    return notFound('FAVORITE_TARGET_NOT_FOUND', {
      ar: 'العنصر غير موجود أو غير متاح.',
      en: 'The item does not exist or is not available.',
    });
  }

  private limitReached() {
    return conflict(
      'FAVORITES_LIMIT_REACHED',
      {
        ar: `وصلت إلى الحد الأقصى للمفضلة (${FAVORITES_LIMIT}).`,
        en: `You reached the favorites limit (${FAVORITES_LIMIT}).`,
      },
      { limit: FAVORITES_LIMIT },
    );
  }
}
