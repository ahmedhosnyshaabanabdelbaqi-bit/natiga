import { IconAlertTriangle } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

/** PLACEHOLDER — replace the page and set status to 'implemented' when built. */
export const stationReportsFeature: FeatureDefinition = {
  key: 'station-reports',
  path: 'station-reports',
  group: 'stations',
  order: 20,
  icon: IconAlertTriangle,
  permission: { anyOf: ['reports.*', 'stations.*'] },
  status: 'placeholder',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/StationReportsPage')) }],
};
