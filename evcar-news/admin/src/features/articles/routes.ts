import { IconNews } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

/** PLACEHOLDER — replace the page and set status to 'implemented' when built. */
export const articlesFeature: FeatureDefinition = {
  key: 'articles',
  path: 'articles',
  group: 'content',
  order: 10,
  icon: IconNews,
  permission: { anyOf: ['articles.*'] },
  status: 'placeholder',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/ArticlesPage')) }],
};
