import { IconListDetails } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

/** PLACEHOLDER — replace the page and set status to 'implemented' when built. */
export const specsFeature: FeatureDefinition = {
  key: 'specs',
  path: 'specs',
  group: 'vehicles',
  order: 20,
  icon: IconListDetails,
  permission: { anyOf: ['specs.*', 'vehicles.*'] },
  status: 'placeholder',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/SpecsPage')) }],
};
