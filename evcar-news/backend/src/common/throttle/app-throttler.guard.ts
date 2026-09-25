import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { AppConfig } from '../../config/app-config';

/**
 * ThrottlerGuard that scales every limit by RATE_LIMIT_MULTIPLIER (tests use
 * a large multiplier; production must be <= 1). Clients are tracked by IP
 * (req.ip honours TRUST_PROXY; IPv6 grouped by /64 by the base guard).
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: AppConfig,
  ) {
    super(options, storage, reflector);
  }

  protected override async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    return super.handleRequest({
      ...requestProps,
      limit: Math.max(1, Math.ceil(requestProps.limit * this.config.rateLimit.multiplier)),
    });
  }
}
