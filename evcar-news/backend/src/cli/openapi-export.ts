/**
 * Writes backend/openapi.json without a database or Redis:
 * the Nest app is created in *preview* mode (modules and routes are scanned,
 * providers are not instantiated), so no connections are opened.
 *
 *   npm run openapi:export            → ./openapi.json
 *   npm run openapi:export -- out.json
 */
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../app.module';
import { applyGlobalPrefix } from '../bootstrap/configure-app';
import { buildOpenApiDocument } from '../bootstrap/swagger';

async function main(): Promise<void> {
  const out = resolve(process.argv[2] ?? 'openapi.json');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    preview: true,
    logger: ['error'],
    abortOnError: false,
    bodyParser: false,
  });
  applyGlobalPrefix(app);
  const document = buildOpenApiDocument(app);
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  const paths = Object.keys(document.paths ?? {}).length;
  console.log(`OpenAPI document written to ${out} (${paths} paths)`);
}

main().catch((err: unknown) => {
  console.error('openapi:export failed', err);
  process.exit(1);
});
