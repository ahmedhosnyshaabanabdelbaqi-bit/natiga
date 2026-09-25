import { Global, Module } from '@nestjs/common';
import { AppConfig } from './app-config';

/**
 * Global provider of the typed, validated AppConfig (built from process.env).
 * Validation errors surface at application bootstrap with every problem listed.
 */
@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: () => AppConfig.fromEnv(process.env) }],
  exports: [AppConfig],
})
export class AppConfigModule {}
