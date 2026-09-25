import { IconChargingPile } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

/** PLACEHOLDER — replace the page and set status to 'implemented' when built. */
export const stationsFeature: FeatureDefinition = {
  key: 'stations',
  path: 'stations',
  group: 'stations',
  order: 10,
  icon: IconChargingPile,
  permission: { anyOf: ['stations.*'] },
  status: 'placeholder',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/StationsPage')) }],
};
