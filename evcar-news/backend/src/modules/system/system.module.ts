import { Global, Module } from '@nestjs/common';
import { AdminImportJobsController } from './admin-import-jobs.controller';
import { AdminSystemController } from './admin-system.controller';
import { ImportJobsService } from './import-jobs.service';
import { SystemOverviewService } from './system-overview.service';

/**
 * Admin system area (contract §4.2 system/):
 *   GET  /admin/system/integrations           provider statuses (settings.read | integrations.read)
 *   POST /admin/system/integrations/:id/check live "test connection"
 *   GET  /admin/system/overview               counts, stale data, failed jobs, imports (system.read)
 *   GET  /admin/system/jobs[/:queue[/:jobId]] BullMQ status (system.read); retry/remove (system.jobs)
 *   GET  /admin/system/import-jobs[/:id[/rows]] import status (imports.read | system.read)
 * Global so every module can inject ImportJobsService (shared import bookkeeping).
 */
@Global()
@Module({
  controllers: [AdminSystemController, AdminImportJobsController],
  providers: [ImportJobsService, SystemOverviewService],
  exports: [ImportJobsService],
})
export class SystemModule {}
