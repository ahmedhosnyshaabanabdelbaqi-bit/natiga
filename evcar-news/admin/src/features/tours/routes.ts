import { IconView360 } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

/** PLACEHOLDER — replace the page and set status to 'implemented' when built. */
export const toursFeature: FeatureDefinition = {
  key: 'tours',
  path: 'tours',
  group: 'media',
  order: 20,
  icon: IconView360,
  permission: { anyOf: ['tours.*'] },
  status: 'placeholder',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/ToursPage')) }],
};
