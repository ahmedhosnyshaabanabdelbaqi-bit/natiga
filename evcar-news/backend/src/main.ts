import 'reflect-metadata';
import { Logger as NestLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { API_PREFIX, configureApp, NEST_APP_OPTIONS } from './bootstrap/configure-app';
import { SWAGGER_UI_PATH } from './bootstrap/swagger';
import { AppConfig } from './config/app-config';
import { EnvValidationError } from './config/env.validation';
import { loadEnvFiles } from './config/load-env';

const SHUTDOWN_GRACE_MS = 25_000;

async function bootstrap(): Promise<void> {
  loadEnvFiles();
  // Validate configuration before building the app to fail fast with a clear message.
  AppConfig.fromEnv(process.env);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, NEST_APP_OPTIONS);
  app.useLogger(app.get(Logger));
  const config = app.get(AppConfig);
  configureApp(app, config);

  const server = await app.listen(config.http.port, config.http.host);
  // Keep-alive slightly above typical load balancer idle timeouts.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  const logger = new NestLogger('Bootstrap');
  logger.log(
    `EV Car News API listening on http://${config.http.host}:${config.http.port}/${API_PREFIX} (${config.env})`,
  );
  if (config.http.swaggerEnabled) logger.log(`OpenAPI UI at /${SWAGGER_UI_PATH}`);

  // Nest closes the app on SIGTERM/SIGINT (enableShutdownHooks); force-exit if that hangs.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      setTimeout(() => {
        logger.error(`Graceful shutdown exceeded ${SHUTDOWN_GRACE_MS} ms, forcing exit`);
        process.exit(1);
      }, SHUTDOWN_GRACE_MS).unref();
    });
  }
}

bootstrap().catch((err: unknown) => {
  if (err instanceof EnvValidationError) {
    console.error(err.message);
  } else {
    console.error('Fatal error during bootstrap', err);
  }
  process.exit(1);
});
