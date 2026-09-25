import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './app-config.service';
import { AdminSettingsController, AppConfigController } from './settings.controller';
import { SettingsService } from './settings.service';

/**
 * App settings (branding/logo/colors, defaults, home sections, feature
 * flags, map tiles, share, legal, app links) and GET /api/v1/app-config.
 * Global so other modules can read typed settings (e.g. the share module
 * reads `app_links` and `share`): `settings.get('app_links')`.
 */
@Global()
@Module({
  controllers: [AppConfigController, AdminSettingsController],
  providers: [SettingsService, AppConfigService],
  exports: [SettingsService, AppConfigService],
})
export class SettingsModule {}
