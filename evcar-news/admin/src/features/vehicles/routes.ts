import { IconCar } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

/** PLACEHOLDER — replace the page and set status to 'implemented' when built. */
export const vehiclesFeature: FeatureDefinition = {
  key: 'vehicles',
  path: 'vehicles',
  group: 'vehicles',
  order: 10,
  icon: IconCar,
  permission: { anyOf: ['vehicles.*'] },
  status: 'placeholder',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/VehiclesPage')) }],
};
