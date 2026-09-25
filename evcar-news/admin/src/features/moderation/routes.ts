import { IconMessages } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

/** PLACEHOLDER — replace the page and set status to 'implemented' when built. */
export const moderationFeature: FeatureDefinition = {
  key: 'moderation',
  path: 'moderation',
  group: 'community',
  order: 10,
  icon: IconMessages,
  permission: { anyOf: ['community.*', 'reviews.*', 'comments.*'] },
  status: 'placeholder',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/ModerationPage')) }],
};
