import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { StationAvailabilityService } from './station-availability.service';
import { StationSyncService } from './station-sync.service';

/**
 * Background work of the stations module on JOBS_ENABLED instances:
 * scheduled Open Charge Map syncs (admin schedule in integration_settings
 * "stations.ocm") and purging old availability observations.
 */
@Injectable()
export class StationSyncTrigger {
  private readonly logger = new Logger(StationSyncTrigger.name);
  private running = false;

  constructor(
    private readonly sync: StationSyncService,
    private readonly availability: StationAvailabilityService,
  ) {}

  @Interval('stations-sync-due', 15 * 60_000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.sync.runScheduled();
      await this.availability.purgeOld();
    } catch (err) {
      this.logger.warn(`Stations background run failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
