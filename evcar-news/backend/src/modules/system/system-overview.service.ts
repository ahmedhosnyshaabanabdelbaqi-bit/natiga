import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { JobsService } from '../../jobs/jobs.service';
import { ProviderRegistry } from '../../providers/provider-registry';
import { PrismaService } from '../../prisma/prisma.service';
import { toImportJobView } from './import-job.view';
import type { SystemOverviewDto } from './system.dto';

const DAY = 24 * 3600_000;
export const STALE_THRESHOLDS = {
  stationVerificationDays: 180,
  priceAgeDays: 180,
  rssSuccessHours: 48,
  mediaStuckHours: 1,
} as const;

function byKey<T extends Record<string, unknown>>(
  groups: T[],
  key: keyof T,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of groups) {
    const count = (g as unknown as { _count: { _all: number } })._count._all;
    out[String(g[key])] = count;
  }
  return out;
}

/** GET /api/v1/admin/system/overview: counts, stale data, failed jobs, imports. */
@Injectable()
export class SystemOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly providers: ProviderRegistry,
    private readonly config: AppConfig,
  ) {}

  async overview(): Promise<SystemOverviewDto> {
    const now = Date.now();
    const p = this.prisma;
    const stationCutoff = new Date(now - STALE_THRESHOLDS.stationVerificationDays * DAY);
    const priceCutoff = new Date(now - STALE_THRESHOLDS.priceAgeDays * DAY);
    const rssCutoff = new Date(now - STALE_THRESHOLDS.rssSuccessHours * 3600_000);
    const mediaCutoff = new Date(now - STALE_THRESHOLDS.mediaStuckHours * 3600_000);

    const [
      users,
      articles,
      brands,
      models,
      variants,
      stationsByPublication,
      stationsBySource,
      tours,
      media,
      openStationReports,
      pendingReviews,
      pendingComments,
      demoArticles,
      demoStations,
      demoVariants,
      demoPrices,
      stationsNotRecentlyVerified,
      pricesOutdated,
      specsUnverified,
      rssFeedsFailing,
      mediaStuck,
      running,
      failedLast7Days,
      recent,
    ] = await Promise.all([
      p.user.count(),
      p.article.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      p.brand.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      p.carModel.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      p.vehicleVariant.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      p.chargingStation.groupBy({
        by: ['publicationStatus'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      p.chargingStation.groupBy({
        by: ['dataSource'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      p.interiorTour.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      p.mediaAsset.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      p.stationReport.count({ where: { status: { in: ['open', 'in_review'] } } }),
      p.review.count({ where: { status: 'pending', deletedAt: null } }),
      p.comment.count({ where: { status: 'pending', deletedAt: null } }),
      p.article.count({ where: { isDemo: true } }),
      p.chargingStation.count({ where: { isDemo: true } }),
      p.vehicleVariant.count({ where: { isDemo: true } }),
      p.priceHistory.count({ where: { isDemo: true } }),
      p.chargingStation.count({
        where: {
          deletedAt: null,
          publicationStatus: 'published',
          OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: stationCutoff } }],
        },
      }),
      p.priceHistory.count({ where: { effectiveTo: null, effectiveFrom: { lt: priceCutoff } } }),
      p.vehicleSpecification.count({ where: { reliability: 'unverified' } }),
      p.rssFeed.count({
        where: {
          isActive: true,
          OR: [
            { consecutiveFailures: { gte: 3 } },
            { lastSuccessAt: { lt: rssCutoff } },
            { lastSuccessAt: null, createdAt: { lt: rssCutoff } },
          ],
        },
      }),
      p.mediaAsset.count({
        where: {
          deletedAt: null,
          status: { in: ['uploading', 'processing'] },
          updatedAt: { lt: mediaCutoff },
        },
      }),
      p.importJob.count({ where: { status: { in: ['running', 'validating'] } } }),
      p.importJob.count({
        where: { status: 'failed', createdAt: { gte: new Date(now - 7 * DAY) } },
      }),
      p.importJob.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);

    const [jobs, integrations] = await Promise.all([
      this.jobs.overview(),
      this.providers.statuses(),
    ]);
    const failedJobs =
      jobs.redis === 'up' ? jobs.queues.reduce((sum, q) => sum + (q.counts?.failed ?? 0), 0) : null;
    const notConfigured = integrations.filter((i) => !i.configured).map((i) => i.id);

    const demoRows = {
      articles: demoArticles,
      stations: demoStations,
      variants: demoVariants,
      prices: demoPrices,
    };
    const warnings: string[] = [];
    if (this.config.isProduction && Object.values(demoRows).some((n) => n > 0)) {
      warnings.push('demo_data_in_production');
    }
    if (jobs.redis === 'down') warnings.push('redis_down_jobs_paused');
    if (failedJobs) warnings.push('failed_background_jobs');
    if (failedLast7Days > 0) warnings.push('failed_imports');
    if (stationsNotRecentlyVerified > 0) warnings.push('stations_not_recently_verified');
    if (pricesOutdated > 0) warnings.push('outdated_prices');
    if (rssFeedsFailing > 0) warnings.push('rss_feeds_failing');
    if (mediaStuck > 0) warnings.push('media_processing_stuck');
    if (integrations.some((i) => i.id === 'storage.s3' && !i.configured)) {
      warnings.push('storage_not_configured');
    }

    return {
      generatedAt: new Date(now).toISOString(),
      environment: this.config.env,
      counts: {
        users,
        articles: byKey(articles, 'status'),
        vehicles: {
          brands: byKey(brands, 'status'),
          models: byKey(models, 'status'),
          variants: byKey(variants, 'status'),
        },
        stationsByPublication: byKey(stationsByPublication, 'publicationStatus'),
        stationsBySource: byKey(stationsBySource, 'dataSource'),
        tours: byKey(tours, 'status'),
        media: byKey(media, 'status'),
        openStationReports,
        pendingReviews,
        pendingComments,
        demoRows,
      },
      staleData: {
        thresholds: { ...STALE_THRESHOLDS },
        stationsNotRecentlyVerified,
        pricesOutdated,
        specsUnverified,
        rssFeedsFailing,
        mediaStuck,
      },
      jobs: { redis: jobs.redis, failedJobs, queues: jobs.queues },
      imports: { running, failedLast7Days, recent: recent.map(toImportJobView) },
      integrations: { total: integrations.length, notConfigured },
      warnings,
    };
  }
}
