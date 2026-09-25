import { IconChartBar } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

/** PLACEHOLDER — replace the page and set status to 'implemented' when built. */
export const reportsFeature: FeatureDefinition = {
  key: 'reports',
  path: 'reports',
  group: 'overview',
  order: 20,
  icon: IconChartBar,
  permission: { anyOf: ['analytics.*'] },
  status: 'placeholder',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/ReportsPage')) }],
};
