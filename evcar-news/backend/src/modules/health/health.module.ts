import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/** GET /api/v1/health (database, Redis, storage) and /api/v1/health/live. */
@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
