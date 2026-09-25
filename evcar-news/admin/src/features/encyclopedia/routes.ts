import { IconBook } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

/** PLACEHOLDER — replace the page and set status to 'implemented' when built. */
export const encyclopediaFeature: FeatureDefinition = {
  key: 'encyclopedia',
  path: 'encyclopedia',
  group: 'content',
  order: 40,
  icon: IconBook,
  permission: { anyOf: ['encyclopedia.*'] },
  status: 'placeholder',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/EncyclopediaPage')) }],
};
