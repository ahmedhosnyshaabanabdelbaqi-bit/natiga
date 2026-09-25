import { IconHistory } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

export const auditLogFeature: FeatureDefinition = {
  key: 'audit-log',
  path: 'audit-log',
  group: 'administration',
  order: 20,
  icon: IconHistory,
  permission: { anyOf: ['audit.*'] },
  status: 'implemented',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/AuditLogPage')) }],
};
