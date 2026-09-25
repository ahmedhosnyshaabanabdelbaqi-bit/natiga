import { randomBytes } from 'node:crypto';
import type { DynamicModule, Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { AppModule } from '../../src/app.module';
import { configureApp, NEST_APP_OPTIONS } from '../../src/bootstrap/configure-app';
import { AppConfig } from '../../src/config/app-config';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createDatabase, databaseUrlFor, dropDatabase } from './db';

export interface TestApp {
  app: NestExpressApplication;
  config: AppConfig;
  prisma: PrismaService;
  /** supertest agent bound to the app's HTTP server. */
  http: () => TestAgent;
  dbName: string;
  databaseUrl: string;
  close: () => Promise<void>;
}

export interface CreateTestAppOptions {
  /** Extra env vars (merged over the test defaults) used to build AppConfig. */
  env?: Record<string, string>;
  /** Extra modules (e.g. test-only controllers). */
  imports?: Array<Type<unknown> | DynamicModule>;
  /** Hook to override providers: (builder) => builder.overrideProvider(X).useValue(y) */
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

let counter = 0;

/**
 * Boots the full AppModule against a fresh database cloned from the
 * migrated + reference-seeded template of this test run. Call `close()` in
 * afterAll (drops the database).
 */
export async function createTestApp(opts: CreateTestAppOptions = {}): Promise<TestApp> {
  const runId = process.env.E2E_RUN_ID;
  const template = process.env.E2E_TEMPLATE_DB;
  if (!runId || !template) throw new Error('e2e global setup did not run (use npm run test:e2e)');

  counter += 1;
  const suffix = `${process.env.JEST_WORKER_ID ?? '0'}_${counter}_${randomBytes(3).toString('hex')}`;
  const dbName = `evcar_test_${runId}_${suffix}`;
  await createDatabase(dbName, template);
  const databaseUrl = databaseUrlFor(dbName);

  const config = AppConfig.fromEnv({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    REDIS_KEY_PREFIX: `evcar_test:${runId}:${suffix}:`,
    BULLMQ_PREFIX: `evcar_test_bull_${runId}_${suffix}`,
    STORAGE_LOCAL_ROOT: `./storage/test/${runId}/${suffix}`,
    ...opts.env,
  });

  let builder = Test.createTestingModule({ imports: [AppModule, ...(opts.imports ?? [])] })
    .overrideProvider(AppConfig)
    .useValue(config);
  if (opts.override) builder = opts.override(builder);

  let app: NestExpressApplication | undefined;
  try {
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication<NestExpressApplication>(NEST_APP_OPTIONS);
    app.useLogger(config.logging.level === 'silent' ? false : ['error', 'warn']);
    configureApp(app, config);
    await app.init();
  } catch (err) {
    await app?.close().catch(() => undefined);
    await dropDatabase(dbName);
    throw err;
  }

  const started = app;
  return {
    app: started,
    config,
    prisma: started.get(PrismaService),
    http: () => request(started.getHttpServer()),
    dbName,
    databaseUrl,
    close: async () => {
      await started.close();
      await dropDatabase(dbName);
    },
  };
}
