import { IconWorld } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

export const marketsFeature: FeatureDefinition = {
  key: 'markets',
  path: 'markets',
  group: 'administration',
  order: 30,
  icon: IconWorld,
  permission: { anyOf: ['markets.*', 'settings.*'] },
  status: 'implemented',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/MarketsPage')) }],
};
