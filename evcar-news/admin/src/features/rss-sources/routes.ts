import { IconRss } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

/** PLACEHOLDER — replace the page and set status to 'implemented' when built. */
export const rssSourcesFeature: FeatureDefinition = {
  key: 'rss-sources',
  path: 'rss-sources',
  group: 'content',
  order: 30,
  icon: IconRss,
  permission: { anyOf: ['rss.*'] },
  status: 'placeholder',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/RssSourcesPage')) }],
};
