import type { Icon } from '@tabler/icons-react';
import type { RouteObject } from 'react-router';
import type { PermissionRequirement } from './permissions';

export const NAV_GROUPS = [
  'overview',
  'content',
  'vehicles',
  'media',
  'stations',
  'community',
  'engagement',
  'administration',
] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

/**
 * A self-contained admin section. Each feature lives in
 * `src/features/<folder>/` and exports its definition from `routes.ts`;
 * `src/features/registry.ts` aggregates them. Feature agents only edit their own
 * folder (+ their locale files) and, when they add a new feature, one import
 * line in the registry.
 */
export interface FeatureDefinition {
  /** Unique key; also the i18n namespace of the feature (src/locales/{ar,en}/<key>.json). */
  key: string;
  /** Base path without leading slash ('' = the dashboard at "/"). */
  path: string;
  group: NavGroup;
  /** Sort order inside the group. */
  order: number;
  icon: Icon;
  /** Required to see the section; the backend enforces the real check. */
  permission?: PermissionRequirement;
  /** 'placeholder' sections render the honest "not implemented yet" page. */
  status: 'implemented' | 'placeholder';
  /** Child routes relative to `path` (use `lazy` for code-splitting). */
  routes: RouteObject[];
}

/** Helper for lazily loaded default-exported page components. */
export function lazyPage(
  loader: () => Promise<{ default: React.ComponentType }>,
): NonNullable<RouteObject['lazy']> {
  return async () => ({ Component: (await loader()).default });
}
