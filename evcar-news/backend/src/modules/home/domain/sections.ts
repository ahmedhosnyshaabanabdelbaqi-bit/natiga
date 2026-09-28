import type { SupportedLanguage } from '../../../config/app-config';
import type { LocalizedText } from '../../../common/i18n/localized-text';
import type { FeatureFlag, HomeSection, HomeSectionKey } from '../../settings/settings.types';

export type HomeKey = HomeSectionKey | 'for_you';
export type ItemType = 'article' | 'car' | 'comparison' | 'tour' | 'station' | 'encyclopedia';
export type SectionState = 'ok' | 'empty' | 'location_required' | 'unavailable';
export type BrowseResource =
  'articles' | 'cars' | 'comparisons' | 'tours' | 'stations' | 'encyclopedia';

export interface SectionDef {
  feature: FeatureFlag;
  itemType: ItemType;
  title: LocalizedText;
  browse: { resource: BrowseResource; params: Record<string, string> };
}

export const SECTION_DEFS: Record<HomeKey, SectionDef> = {
  top_story: {
    feature: 'news',
    itemType: 'article',
    title: { ar: 'الخبر الرئيسي', en: 'Top story' },
    browse: { resource: 'articles', params: {} },
  },
  for_you: {
    feature: 'news',
    itemType: 'article',
    title: { ar: 'مختارات لك', en: 'For you' },
    browse: { resource: 'articles', params: {} },
  },
  latest_news: {
    feature: 'news',
    itemType: 'article',
    title: { ar: 'آخر الأخبار', en: 'Latest news' },
    browse: { resource: 'articles', params: { sort: 'latest' } },
  },
  reviews: {
    feature: 'news',
    itemType: 'article',
    title: { ar: 'المراجعات والتجارب', en: 'Reviews & test drives' },
    browse: { resource: 'articles', params: { type: 'review' } },
  },
  new_cars: {
    feature: 'cars',
    itemType: 'car',
    title: { ar: 'سيارات أضيفت حديثًا', en: 'Newly added cars' },
    browse: { resource: 'cars', params: { sort: 'newest' } },
  },
  featured_comparisons: {
    feature: 'comparisons',
    itemType: 'comparison',
    title: { ar: 'مقارنات مختارة', en: 'Featured comparisons' },
    browse: { resource: 'comparisons', params: {} },
  },
  interior_tours: {
    feature: 'interiorTours',
    itemType: 'tour',
    title: { ar: 'جولات داخلية 360°', en: '360° interior tours' },
    browse: { resource: 'tours', params: {} },
  },
  nearby_stations: {
    feature: 'stations',
    itemType: 'station',
    title: { ar: 'محطات شحن قريبة', en: 'Nearby charging stations' },
    browse: { resource: 'stations', params: {} },
  },
  charging_guides: {
    feature: 'encyclopedia',
    itemType: 'encyclopedia',
    title: { ar: 'أدلة الشحن والصيانة', en: 'Charging & maintenance guides' },
    browse: { resource: 'encyclopedia', params: {} },
  },
};

export interface PlannedSection {
  key: HomeKey;
  order: number;
}

export interface HiddenSection {
  key: HomeKey;
  reason: 'disabled_by_admin' | 'feature_off';
}

/**
 * Order + visibility of the home sections from app_settings `home.sections`
 * and the effective feature flags. `for_you` (personalized) is inserted right
 * after `top_story` (or first) when requested, and follows `latest_news`'s
 * visibility. Sections missing from the setting are appended (enabled) so a
 * new section never disappears silently.
 */
export function planSections(
  configured: HomeSection[],
  features: Partial<Record<FeatureFlag, boolean>>,
  withForYou: boolean,
): { visible: PlannedSection[]; hidden: HiddenSection[] } {
  const known = Object.keys(SECTION_DEFS).filter((k) => k !== 'for_you') as HomeSectionKey[];
  const list = [...configured].sort((a, b) => a.order - b.order);
  for (const k of known) {
    if (!list.some((s) => s.key === k))
      list.push({ key: k, enabled: true, order: Number.MAX_SAFE_INTEGER });
  }
  const keys: { key: HomeKey; enabled: boolean }[] = [];
  for (const s of list) {
    if (!known.includes(s.key)) continue;
    keys.push({ key: s.key, enabled: s.enabled });
  }
  if (withForYou) {
    const latest = keys.find((k) => k.key === 'latest_news');
    const at = keys.findIndex((k) => k.key === 'top_story');
    keys.splice(at === -1 ? 0 : at + 1, 0, { key: 'for_you', enabled: latest?.enabled ?? true });
  }
  const visible: PlannedSection[] = [];
  const hidden: HiddenSection[] = [];
  for (const k of keys) {
    if (!k.enabled) hidden.push({ key: k.key, reason: 'disabled_by_admin' });
    else if (features[SECTION_DEFS[k.key].feature] !== true) {
      hidden.push({ key: k.key, reason: 'feature_off' });
    } else visible.push({ key: k.key, order: visible.length + 1 });
  }
  return { visible, hidden };
}

export function sectionTitle(key: HomeKey, lang: SupportedLanguage): string {
  return SECTION_DEFS[key].title[lang];
}
