import { Injectable } from '@nestjs/common';
import {
  AppConfigService,
  SettingsService,
  type FeatureFlag,
  type HomeSection,
} from '../../settings';

/**
 * Home inputs owned by the settings module: section order/visibility and
 * the EFFECTIVE feature flags announced in /app-config (a section whose
 * feature is off is hidden, so the app never links to a disabled feature).
 * Separate provider so tests can override the flags.
 */
@Injectable()
export class HomeFlagsService {
  constructor(
    private readonly appConfig: AppConfigService,
    private readonly settings: SettingsService,
  ) {}

  async features(): Promise<Partial<Record<FeatureFlag, boolean>>> {
    return (await this.appConfig.get()).body.features;
  }

  sections(): Promise<HomeSection[]> {
    return this.settings.get('home.sections');
  }
}
