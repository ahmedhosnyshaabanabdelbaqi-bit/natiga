import { IconBell } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

/** PLACEHOLDER — replace the page and set status to 'implemented' when built. */
export const notificationsFeature: FeatureDefinition = {
  key: 'notifications',
  path: 'notifications',
  group: 'engagement',
  order: 10,
  icon: IconBell,
  permission: { anyOf: ['notifications.*'] },
  status: 'placeholder',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/NotificationsPage')) }],
};
