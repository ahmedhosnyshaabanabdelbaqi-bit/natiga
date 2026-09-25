import { IconTags } from '@tabler/icons-react';
import { type FeatureDefinition, lazyPage } from '@/app/features';

/** PLACEHOLDER — replace the page and set status to 'implemented' when built. */
export const taxonomyFeature: FeatureDefinition = {
  key: 'taxonomy',
  path: 'taxonomy',
  group: 'content',
  order: 20,
  icon: IconTags,
  permission: { anyOf: ['categories.*', 'tags.*'] },
  status: 'placeholder',
  routes: [{ index: true, lazy: lazyPage(() => import('./pages/TaxonomyPage')) }],
};
