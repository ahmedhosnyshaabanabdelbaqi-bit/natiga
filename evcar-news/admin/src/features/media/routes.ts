import { IconPhoto } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

/** PLACEHOLDER — replace the page and set status to 'implemented' when built. */
export const mediaFeature: FeatureDefinition = {
  key: 'media',
  path: 'media',
  group: 'media',
  order: 10,
  icon: IconPhoto,
  permission: { anyOf: ['media.*'] },
  status: 'placeholder',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/MediaPage')) }],
};
