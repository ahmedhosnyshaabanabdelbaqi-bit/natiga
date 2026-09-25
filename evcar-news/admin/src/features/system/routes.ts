import { IconPlugConnected } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

export const systemFeature: FeatureDefinition = {
  key: 'system',
  path: 'system',
  group: 'administration',
  order: 70,
  icon: IconPlugConnected,
  permission: { anyOf: ['system.*', 'settings.*', 'integrations.*'] },
  status: 'implemented',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/SystemPage')) }],
};
