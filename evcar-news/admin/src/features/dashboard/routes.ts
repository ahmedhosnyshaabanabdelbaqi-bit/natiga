import { IconLayoutDashboard } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

export const dashboardFeature: FeatureDefinition = {
  key: 'dashboard',
  path: '',
  group: 'overview',
  order: 10,
  icon: IconLayoutDashboard,
  // Every staff member sees the dashboard; individual widgets are gated.
  status: 'implemented',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/DashboardPage')) }],
};
