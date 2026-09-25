import { IconSettings } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

export const settingsFeature: FeatureDefinition = {
  key: 'settings',
  path: 'settings',
  group: 'administration',
  order: 60,
  icon: IconSettings,
  permission: { anyOf: ['settings.*'] },
  status: 'implemented',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/SettingsPage')) }],
};
