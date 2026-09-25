import { createHmac } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { SupportedLanguage } from '../../../config/app-config';
import { AppConfig } from '../../../config/app-config';
import { REDIS } from '../../../common/redis/redis.module';
import { PrismaService } from '../../../prisma/prisma.service';

const DEDUPE_SECONDS = 30 * 60;

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

export interface MostComparedRow {
  variantId: string;
  title: string | null;
  powertrainType: string | null;
  modelYear: number | null;
  published: boolean;
  comparisons: number;
}

/**
 * Anonymous counters (content_daily_stats), no per-user history (§19):
 * - variant.comparisons +1 when a comparison containing it is computed or a
 *   shared comparison is opened;
 * - comparison.views +1 (and comparisons.view_count) when a shared link is
 *   opened; comparison.shares +1 when a guest share link is created.
 * The same client (HMAC of IP + user agent, kept only in Redis with a TTL)
 * is counted once per comparison per 30 minutes. Counting never fails a
 * request.
 */
@Injectable()
export class ComparisonStatsService {
  private readonly logger = new Logger(ComparisonStatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  private async firstInWindow(scope: string, client: ClientInfo): Promise<boolean> {
    const reader = createHmac('sha256', this.config.auth.ipHashSalt || 'evcar-comparisons')
      .update(`${client.ip ?? ''}|${client.userAgent ?? ''}`)
      .digest('base64url')
      .slice(0, 22);
    try {
      const res = await this.redis.set(
        `${this.config.redis.keyPrefix}cmp-count:${scope}:${reader}`,
        '1',
        'EX',
        DEDUPE_SECONDS,
        'NX',
      );
      return res === 'OK';
    } catch {
      // Redis down: count anyway (the routes are rate limited per IP).
      return true;
    }
  }

  /** +1 `comparisons` per distinct variant (deduped per client and comparison signature). */
  async countCompared(variantIds: string[], signature: string, client: ClientInfo): Promise<void> {
    try {
      const ids = [...new Set(variantIds)];
      if (ids.length === 0 || !(await this.firstInWindow(`sig:${signature}`, client))) return;
      await this.prisma.$executeRaw`
        INSERT INTO "content_daily_stats" ("id", "entity_type", "entity_id", "day", "comparisons")
        SELECT gen_random_uuid(), 'variant', v, (now() AT TIME ZONE 'UTC')::date, 1
        FROM unnest(${ids}::uuid[]) AS v
        ON CONFLICT ("entity_type", "entity_id", "day")
        DO UPDATE SET "comparisons" = "content_daily_stats"."comparisons" + 1`;
    } catch (err) {
      this.logger.warn(`Comparison counter failed: ${(err as Error).message}`);
    }
  }

  /** A shared comparison was opened: views + variants' comparisons (deduped per client). */
  async countOpened(
    comparisonId: string,
    variantIds: string[],
    signature: string,
    client: ClientInfo,
  ): Promise<void> {
    try {
      if (!(await this.firstInWindow(`open:${comparisonId}`, client))) return;
      await this.prisma.$transaction([
        this.prisma.$executeRaw`
          UPDATE "comparisons" SET "view_count" = "view_count" + 1, "last_viewed_at" = now()
          WHERE "id" = ${comparisonId}::uuid`,
        this.prisma.$executeRaw`
          INSERT INTO "content_daily_stats" ("id", "entity_type", "entity_id", "day", "views")
          VALUES (gen_random_uuid(), 'comparison', ${comparisonId}::uuid, (now() AT TIME ZONE 'UTC')::date, 1)
          ON CONFLICT ("entity_type", "entity_id", "day")
          DO UPDATE SET "views" = "content_daily_stats"."views" + 1`,
      ]);
    } catch (err) {
      this.logger.warn(`Comparison view counter failed: ${(err as Error).message}`);
    }
    await this.countCompared(variantIds, signature, client);
  }

  /** A guest share link was created (or re-shared). */
  async countShared(comparisonId: string): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "content_daily_stats" ("id", "entity_type", "entity_id", "day", "shares")
        VALUES (gen_random_uuid(), 'comparison', ${comparisonId}::uuid, (now() AT TIME ZONE 'UTC')::date, 1)
        ON CONFLICT ("entity_type", "entity_id", "day")
        DO UPDATE SET "shares" = "content_daily_stats"."shares" + 1`;
    } catch (err) {
      this.logger.warn(`Comparison share counter failed: ${(err as Error).message}`);
    }
  }

  /** "Most compared cars" report (§17): sum of variant.comparisons over the last `days`. */
  async mostCompared(
    days: number,
    limit: number,
    lang: SupportedLanguage,
  ): Promise<{ items: MostComparedRow[]; from: string; to: string }> {
    const to = new Date();
    const from = new Date(
      Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - (days - 1)),
    );
    const rows = await this.prisma.contentDailyStat.groupBy({
      by: ['entityId'],
      where: { entityType: 'variant', day: { gte: from }, comparisons: { gt: 0 } },
      _sum: { comparisons: true },
      orderBy: [{ _sum: { comparisons: 'desc' } }, { entityId: 'asc' }],
      take: limit,
    });
    const variants = await this.prisma.vehicleVariant.findMany({
      where: { id: { in: rows.map((r) => r.entityId) } },
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        powertrainType: true,
        status: true,
        deletedAt: true,
        modelYear: {
          select: {
            year: true,
            generation: {
              select: {
                model: {
                  select: {
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
    });
    const byId = new Map(variants.map((v) => [v.id, v]));
    const name = (ar: string, en: string) => (lang === 'en' ? en || ar : ar || en);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      items: rows.map((r) => {
        const v = byId.get(r.entityId);
        const m = v?.modelYear.generation.model;
        return {
          variantId: r.entityId,
          title:
            v && m
              ? `${name(m.brand.nameAr, m.brand.nameEn)} ${name(m.nameAr, m.nameEn)} ${v.modelYear.year} ${name(v.nameAr, v.nameEn)}`
              : null,
          powertrainType: v?.powertrainType ?? null,
          modelYear: v?.modelYear.year ?? null,
          published: v ? v.status === 'published' && v.deletedAt === null : false,
          comparisons: r._sum.comparisons ?? 0,
        };
      }),
    };
  }
}
