import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { buildLoggerParams } from './common/logging/logging';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { RedisModule } from './common/redis/redis.module';
import { ThrottleModule } from './common/throttle/throttle.module';
import { AppConfig } from './config/app-config';
import { AppConfigModule } from './config/app-config.module';
import { JobsModule } from './jobs/jobs.module';
import { FEATURE_MODULES } from './modules/feature-modules';
import { PrismaModule } from './prisma/prisma.module';
import { ProvidersModule } from './providers/providers.module';

/**
 * Root module. Feature modules are listed in src/modules/feature-modules.ts;
 * infrastructure (config, logging, prisma, redis, rate limiting, jobs,
 * providers, error envelope, validation) is wired here.
 */
@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({ inject: [AppConfig], useFactory: buildLoggerParams }),
    PrismaModule,
    RedisModule,
    CommonModule,
    ThrottleModule,
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
    JobsModule,
    ProvidersModule,
    ...FEATURE_MODULES,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
