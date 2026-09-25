import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfig } from '../config/app-config';
import { PrismaClient, type Prisma } from '../generated/prisma/client';
import { nearbyQuery, type GeoTable, type LatLng, type NearbyRow } from './geo';

/**
 * Prisma client (Prisma 7 + driver adapter `pg`). Connects lazily on the
 * first query, so the app (and `npm run openapi:export`) can boot without a
 * database; `/api/v1/health` reports DB reachability.
 *
 * Import types/enums from `src/generated/prisma/client`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfig) {
    const adapter = new PrismaPg({
      connectionString: config.database.url,
      max: config.database.poolMax,
      ...(config.database.statementTimeoutMs > 0
        ? { statement_timeout: config.database.statementTimeoutMs }
        : {}),
      application_name: `evcar-backend-${config.env}`,
    });
    super({
      adapter,
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
    (this as unknown as PrismaClient<'warn' | 'error'>).$on('warn', (e: Prisma.LogEvent) =>
      this.logger.warn(e.message),
    );
    (this as unknown as PrismaClient<'warn' | 'error'>).$on('error', (e: Prisma.LogEvent) =>
      this.logger.error(e.message),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Runs `SELECT 1` and returns the round-trip latency in ms. */
  async ping(): Promise<number> {
    const started = performance.now();
    await this.$queryRaw`SELECT 1`;
    return Math.round((performance.now() - started) * 100) / 100;
  }

  /** Nearest rows of a geo table within a radius (ids + distance in meters). */
  async findNearby(opts: {
    table: GeoTable;
    center: LatLng;
    radiusMeters: number;
    limit: number;
    where?: Prisma.Sql;
  }): Promise<NearbyRow[]> {
    const rows = await this.$queryRaw<{ id: string; distanceMeters: number | string }[]>(
      nearbyQuery(opts),
    );
    return rows.map((r) => ({ id: r.id, distanceMeters: Number(r.distanceMeters) }));
  }
}
