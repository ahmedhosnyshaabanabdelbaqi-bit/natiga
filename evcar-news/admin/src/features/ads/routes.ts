import { IconSpeakerphone } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

/** PLACEHOLDER — replace the page and set status to 'implemented' when built. */
export const adsFeature: FeatureDefinition = {
  key: 'ads',
  path: 'ads',
  group: 'engagement',
  order: 20,
  icon: IconSpeakerphone,
  permission: { anyOf: ['ads.*'] },
  status: 'placeholder',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/AdsPage')) }],
};
