import { IconBuildingStore } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

/** PLACEHOLDER — replace the page and set status to 'implemented' when built. */
export const servicesDirectoryFeature: FeatureDefinition = {
  key: 'services-directory',
  path: 'services',
  group: 'stations',
  order: 30,
  icon: IconBuildingStore,
  permission: { anyOf: ['services.*'] },
  status: 'placeholder',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/ServicesDirectoryPage')) }],
};
