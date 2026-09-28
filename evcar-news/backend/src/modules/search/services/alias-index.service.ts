import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AliasEntry } from '../domain/query-plan';

const CACHE_MS = 60_000;

/**
 * Active search aliases, cached in memory for 60 s (they change rarely and
 * are needed by every search / suggest request). Admin writes call
 * `invalidate()` so the change is visible immediately on this instance.
 */
@Injectable()
export class AliasIndexService {
  private cache?: { at: number; entries: AliasEntry[] };
  private loading?: Promise<AliasEntry[]>;

  constructor(private readonly prisma: PrismaService) {}

  invalidate(): void {
    this.cache = undefined;
  }

  async active(): Promise<AliasEntry[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.entries;
    this.loading ??= (async () => {
      const rows = await this.prisma.searchAlias.findMany({
        where: { isActive: true },
        select: {
          id: true,
          term: true,
          canonical: true,
          termNormalized: true,
          canonicalNormalized: true,
          entityType: true,
          entityId: true,
        },
        orderBy: { id: 'asc' },
      });
      const entries: AliasEntry[] = rows.map((r) => ({
        id: r.id,
        term: r.term,
        canonical: r.canonical,
        termNormalized: r.termNormalized ?? '',
        canonicalNormalized: r.canonicalNormalized ?? '',
        entityType: r.entityType ?? null,
        entityId: r.entityId ?? null,
      }));
      this.cache = { at: Date.now(), entries };
      return entries;
    })().finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }
}
