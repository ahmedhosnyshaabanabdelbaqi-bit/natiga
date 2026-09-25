import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ContentStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit';
import { ArticlesAdminService } from './articles-admin.service';

const BATCH = 50;

/**
 * Publishes scheduled articles whose time has come. Idempotent and safe to
 * run on several instances at once: each article is switched with a
 * conditional update (status = scheduled AND scheduled_at <= now), so a
 * second run or instance changes nothing. Publication date = the planned
 * time (or the first publication date of a re-scheduled article).
 */
@Injectable()
export class ArticleSchedulerService {
  private readonly logger = new Logger(ArticleSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly articles: ArticlesAdminService,
    private readonly audit: AuditService,
  ) {}

  async publishDue(now: Date = new Date()): Promise<{ published: string[]; failed: string[] }> {
    const due = await this.prisma.article.findMany({
      where: { status: ContentStatus.scheduled, scheduledAt: { lte: now }, deletedAt: null },
      select: { id: true, slug: true, scheduledAt: true, publishedAt: true },
      orderBy: { scheduledAt: 'asc' },
      take: BATCH,
    });
    const published: string[] = [];
    const failed: string[] = [];
    for (const a of due) {
      try {
        const res = await this.prisma.article.updateMany({
          where: {
            id: a.id,
            status: ContentStatus.scheduled,
            scheduledAt: { lte: now },
            deletedAt: null,
          },
          data: {
            status: ContentStatus.published,
            publishedAt: a.publishedAt ?? a.scheduledAt ?? now,
            scheduledAt: null,
          },
        });
        if (res.count !== 1) continue;
        published.push(a.id);
        await this.audit.recordSafe({
          action: 'articles.publish_scheduled',
          entityType: 'article',
          entityId: a.id,
          actorId: null,
          actorLabel: 'scheduler',
          ip: null,
          userAgent: null,
          before: { status: ContentStatus.scheduled, scheduledAt: a.scheduledAt?.toISOString() },
          after: { status: ContentStatus.published },
        });
        await this.articles.afterStatusChange(
          { id: a.id, slug: a.slug, status: ContentStatus.published },
          ContentStatus.scheduled,
        );
      } catch (err) {
        // e.g. the cover lost its licence meanwhile (database publishing rules).
        failed.push(a.id);
        this.logger.error(
          `Scheduled publication of article ${a.id} failed: ${(err as Error).message}`,
        );
        await this.audit.recordSafe({
          action: 'articles.publish_scheduled_failed',
          entityType: 'article',
          entityId: a.id,
          actorId: null,
          actorLabel: 'scheduler',
          ip: null,
          userAgent: null,
          after: { error: (err as Error).message.slice(0, 500) },
        });
      }
    }
    return { published, failed };
  }
}

/** Runs publishDue() every 30 s on instances with JOBS_ENABLED (see articles.module.ts). */
@Injectable()
export class ArticleSchedulerTrigger {
  private readonly logger = new Logger(ArticleSchedulerTrigger.name);
  private running = false;

  constructor(private readonly scheduler: ArticleSchedulerService) {}

  @Interval('articles-publish-due', 30_000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.scheduler.publishDue();
    } catch (err) {
      this.logger.warn(`Scheduled publishing run failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
