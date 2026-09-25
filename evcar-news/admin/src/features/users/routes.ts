import { IconUsers } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

export const usersFeature: FeatureDefinition = {
  key: 'users',
  path: 'users',
  group: 'administration',
  order: 10,
  icon: IconUsers,
  permission: { anyOf: ['users.*', 'roles.*'] },
  status: 'implemented',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/UsersPage')) }],
};
