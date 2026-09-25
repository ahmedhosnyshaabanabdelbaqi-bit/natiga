import { IconLanguage } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

export const translationsFeature: FeatureDefinition = {
  key: 'translations',
  path: 'translations',
  group: 'administration',
  order: 40,
  icon: IconLanguage,
  permission: { anyOf: ['translations.*', 'settings.*'] },
  status: 'implemented',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/TranslationsPage')) }],
};
