import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ok, type DataResponse } from '../../common/http/responses';
import { ApiDataResponse } from '../../common/swagger/api-responses';
import { Public } from '../auth/decorators/public.decorator';
import { HealthDto, LivenessDto } from './health.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Readiness: database, Redis and storage checks (503 when the database is down)',
  })
  @ApiDataResponse(HealthDto)
  @ApiServiceUnavailableResponse({ description: 'Database unreachable; same body shape.' })
  async check(@Res({ passthrough: true }) res: Response): Promise<DataResponse<HealthDto>> {
    const result = await this.health.check();
    res.setHeader('Cache-Control', 'no-store');
    if (result.status === 'error') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return ok(result);
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness: the process is up (no dependency checks)' })
  @ApiDataResponse(LivenessDto)
  live(@Res({ passthrough: true }) res: Response): DataResponse<LivenessDto> {
    res.setHeader('Cache-Control', 'no-store');
    return ok({ status: 'ok' });
  }
}
