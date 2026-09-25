import { Global, Module } from '@nestjs/common';
import { I18nService } from './i18n.service';
import {
  AdminTranslationsController,
  PublicTranslationsController,
} from './translations.controller';
import { TranslationsService } from './translations.service';

/**
 * Server message catalogs (ar/en: errors, notifications, labels) with
 * admin overrides, and UI translation overrides (translations table):
 *   GET /api/v1/translations                (public bundle per language, ETag)
 *   /api/v1/admin/translations[/:id|/catalog] (translations.write; read also settings.read)
 * Global so every module can inject I18nService.
 */
@Global()
@Module({
  controllers: [PublicTranslationsController, AdminTranslationsController],
  providers: [I18nService, TranslationsService],
  exports: [I18nService],
})
export class I18nModule {}
