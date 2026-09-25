import { IconFileImport } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

/** PLACEHOLDER — replace the page and set status to 'implemented' when built. */
export const importsFeature: FeatureDefinition = {
  key: 'imports',
  path: 'imports',
  group: 'administration',
  order: 50,
  icon: IconFileImport,
  permission: { anyOf: ['imports.*'] },
  status: 'placeholder',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/ImportsPage')) }],
};
