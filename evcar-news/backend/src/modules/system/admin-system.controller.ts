import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppException } from '../../common/errors/app.exception';
import { toPageRequest } from '../../common/http/pagination';
import {
  ok,
  paginated,
  type DataResponse,
  type PaginatedResponse,
} from '../../common/http/responses';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../common/swagger/api-responses';
import { JobsService } from '../../jobs/jobs.service';
import { ProviderRegistry } from '../../providers/provider-registry';
import { Audit } from '../audit';
import { RequireAnyPermission, RequirePermissions } from '../rbac';
import { SystemOverviewService } from './system-overview.service';
import {
  IntegrationsDto,
  JobDetailDto,
  JobsOverviewDto,
  JobViewDto,
  ListJobsQueryDto,
  ProviderCheckDto,
  SystemOverviewDto,
} from './system.dto';

const INTEGRATION_ID = /^[a-z_]+\.[a-z0-9_]+$/;
const JOB_ID = /^[A-Za-z0-9:_-]{1,200}$/;

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
}

@ApiTags('admin-system')
@ApiErrorResponses(401, 403)
@Controller('admin/system')
export class AdminSystemController {
  constructor(
    private readonly providers: ProviderRegistry,
    private readonly overviewService: SystemOverviewService,
    private readonly jobs: JobsService,
  ) {}

  @Get('integrations')
  @RequireAnyPermission('settings.read', 'integrations.read')
  @ApiOperation({
    summary: 'Status of every provider adapter (configured?, reason, last success/error)',
  })
  @ApiDataResponse(IntegrationsDto)
  async integrations(
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<IntegrationsDto>> {
    noStore(res);
    return ok({
      items: await this.providers.statuses(),
      capabilities: this.providers.capabilities(),
      note: 'Last success/error are tracked per API instance since its start.',
    });
  }

  @Post('integrations/:id/check')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPermission('settings.write', 'integrations.write')
  @Audit({ action: 'integrations.check', entityType: 'integration' })
  @ApiOperation({
    summary: 'Runs a live connectivity check of one adapter (e.g. SMTP login, S3 bucket, OCM key)',
  })
  @ApiDataResponse(ProviderCheckDto)
  @ApiErrorResponses(404)
  async check(@Param('id') id: string): Promise<DataResponse<ProviderCheckDto>> {
    if (!INTEGRATION_ID.test(id)) throw notFound();
    return ok(await this.providers.check(id));
  }

  @Get('overview')
  @RequirePermissions('system.read')
  @ApiOperation({
    summary: 'Admin dashboard: counts, stale data, failed jobs, import jobs, unconfigured services',
  })
  @ApiDataResponse(SystemOverviewDto)
  async overview(
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<SystemOverviewDto>> {
    noStore(res);
    return ok(await this.overviewService.overview());
  }

  @Get('jobs')
  @RequirePermissions('system.read')
  @ApiOperation({
    summary: 'Background job queues (BullMQ) with counts; redis=down when Redis is unreachable',
  })
  @ApiDataResponse(JobsOverviewDto)
  async jobsOverview(
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<JobsOverviewDto>> {
    noStore(res);
    return ok(await this.jobs.overview());
  }

  @Get('jobs/:queue')
  @RequirePermissions('system.read')
  @ApiOperation({ summary: 'Jobs of one queue in one state (default failed), newest first' })
  @ApiPaginatedResponse(JobViewDto)
  @ApiErrorResponses(404, 503)
  async listJobs(
    @Param('queue') queue: string,
    @Query() query: ListJobsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<JobViewDto>> {
    noStore(res);
    const page = toPageRequest(query);
    const { items, total } = await this.jobs.list(
      queue,
      query.state ?? 'failed',
      page.page,
      page.pageSize,
    );
    return paginated(items, total, page);
  }

  @Get('jobs/:queue/:jobId')
  @RequirePermissions('system.read')
  @ApiOperation({ summary: 'One job with its last error (data values are not exposed)' })
  @ApiDataResponse(JobDetailDto)
  @ApiErrorResponses(404, 503)
  async getJob(
    @Param('queue') queue: string,
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<JobDetailDto>> {
    noStore(res);
    if (!JOB_ID.test(jobId)) throw notFound();
    return ok(await this.jobs.get(queue, jobId));
  }

  @Post('jobs/:queue/:jobId/retry')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('system.jobs')
  @Audit({ action: 'jobs.retry', entityType: 'job', entityIdParam: 'jobId' })
  @ApiOperation({ summary: 'Retries a failed job' })
  @ApiDataResponse(JobDetailDto)
  @ApiErrorResponses(404, 409, 503)
  async retryJob(
    @Param('queue') queue: string,
    @Param('jobId') jobId: string,
  ): Promise<DataResponse<JobDetailDto>> {
    if (!JOB_ID.test(jobId)) throw notFound();
    return ok(await this.jobs.retry(queue, jobId));
  }

  @Delete('jobs/:queue/:jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('system.jobs')
  @Audit({ action: 'jobs.remove', entityType: 'job', entityIdParam: 'jobId' })
  @ApiOperation({ summary: 'Removes a job that is not running' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409, 503)
  async removeJob(@Param('queue') queue: string, @Param('jobId') jobId: string): Promise<void> {
    if (!JOB_ID.test(jobId)) throw notFound();
    await this.jobs.remove(queue, jobId);
  }
}

function notFound(): AppException {
  return AppException.notFound();
}
