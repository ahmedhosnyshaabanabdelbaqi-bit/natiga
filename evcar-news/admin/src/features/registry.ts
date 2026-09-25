import { NAV_GROUPS, type FeatureDefinition } from '@/app/features';
import { checkPermissions, isStaff } from '@/app/permissions';
import type { AuthUser } from '@/api/types';
import { adsFeature } from './ads/routes';
import { articlesFeature } from './articles/routes';
import { auditLogFeature } from './audit-log/routes';
import { dashboardFeature } from './dashboard/routes';
import { encyclopediaFeature } from './encyclopedia/routes';
import { importsFeature } from './imports/routes';
import { marketsFeature } from './markets/routes';
import { mediaFeature } from './media/routes';
import { moderationFeature } from './moderation/routes';
import { notificationsFeature } from './notifications/routes';
import { pricesFeature } from './prices/routes';
import { reportsFeature } from './reports/routes';
import { rssSourcesFeature } from './rss-sources/routes';
import { servicesDirectoryFeature } from './services-directory/routes';
import { settingsFeature } from './settings/routes';
import { specsFeature } from './specs/routes';
import { stationReportsFeature } from './station-reports/routes';
import { stationsFeature } from './stations/routes';
import { systemFeature } from './system/routes';
import { taxonomyFeature } from './taxonomy/routes';
import { toursFeature } from './tours/routes';
import { translationsFeature } from './translations/routes';
import { usersFeature } from './users/routes';
import { vehiclesFeature } from './vehicles/routes';

/**
 * Every admin section. To add one: create src/features/<name>/routes.ts,
 * the locale files src/locales/{ar,en}/<key>.json, and add it here.
 */
export const features: readonly FeatureDefinition[] = [
  dashboardFeature,
  reportsFeature,
  articlesFeature,
  taxonomyFeature,
  rssSourcesFeature,
  encyclopediaFeature,
  vehiclesFeature,
  specsFeature,
  pricesFeature,
  mediaFeature,
  toursFeature,
  stationsFeature,
  stationReportsFeature,
  servicesDirectoryFeature,
  moderationFeature,
  notificationsFeature,
  adsFeature,
  usersFeature,
  auditLogFeature,
  marketsFeature,
  translationsFeature,
  importsFeature,
  settingsFeature,
  systemFeature,
];

export function canSeeFeature(
  feature: FeatureDefinition,
  user: Pick<AuthUser, 'permissions' | 'roles'> | null,
): boolean {
  if (!user) return false;
  if (!feature.permission) return isStaff(user.roles);
  return checkPermissions(user.permissions, feature.permission);
}

export interface NavGroupEntry {
  group: (typeof NAV_GROUPS)[number];
  items: FeatureDefinition[];
}

/** Features visible to the user, grouped and ordered for the sidebar. */
export function buildNavigation(
  user: Pick<AuthUser, 'permissions' | 'roles'> | null,
  list: readonly FeatureDefinition[] = features,
): NavGroupEntry[] {
  return NAV_GROUPS.map((group) => ({
    group,
    items: list
      .filter((f) => f.group === group && canSeeFeature(f, user))
      .sort((a, b) => a.order - b.order),
  })).filter((g) => g.items.length > 0);
}

/**
 * Whether the account may use the admin at all: a staff role or at least one
 * permission used by an admin section. The backend is the real gate.
 */
export function hasAdminAccess(
  user: Pick<AuthUser, 'permissions' | 'roles'> | null,
  list: readonly FeatureDefinition[] = features,
): boolean {
  if (!user) return false;
  if (isStaff(user.roles)) return true;
  return list.some((f) => f.permission && checkPermissions(user.permissions, f.permission));
}

export function featurePath(feature: FeatureDefinition): string {
  return `/${feature.path}`;
}
