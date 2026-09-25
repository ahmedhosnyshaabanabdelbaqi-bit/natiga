import { IconReceipt2 } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

/** PLACEHOLDER — replace the page and set status to 'implemented' when built. */
export const pricesFeature: FeatureDefinition = {
  key: 'prices',
  path: 'prices',
  group: 'vehicles',
  order: 30,
  icon: IconReceipt2,
  permission: { anyOf: ['prices.*', 'vehicles.*'] },
  status: 'placeholder',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/PricesPage')) }],
};
