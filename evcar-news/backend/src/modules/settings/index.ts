/**
 * Public API of the settings module:
 *
 *   import { SettingsService } from '../settings';
 *   const appLinks = await this.settings.get('app_links');
 *
 * After changing data that /app-config exposes (e.g. markets), emit
 * CONFIG_CHANGED_EVENT (EventEmitter2) or call SettingsService.invalidate().
 */
export { SettingsService, CONFIG_CHANGED_EVENT } from './settings.service';
export { AppConfigService, buildAppConfig } from './app-config.service';
export {
  FEATURE_FLAGS,
  HOME_SECTION_KEYS,
  SETTING_DEFAULTS,
  SETTING_KEYS,
  type AppLinksSettings,
  type BrandingSettings,
  type DefaultsSettings,
  type FeatureFlag,
  type FeaturesSettings,
  type HomeSection,
  type LegalSettings,
  type MapSettings,
  type SettingKey,
  type SettingValues,
  type ShareSettings,
} from './settings.types';
export type { AppConfigDto } from './settings.dto';
