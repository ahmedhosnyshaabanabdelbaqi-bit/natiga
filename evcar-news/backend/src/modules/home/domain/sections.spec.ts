import { planSections } from './sections';

const ALL_ON = {
  news: true,
  cars: true,
  comparisons: true,
  interiorTours: true,
  stations: true,
  encyclopedia: true,
};
const DEFAULT = [
  { key: 'top_story', enabled: true, order: 1 },
  { key: 'latest_news', enabled: true, order: 2 },
  { key: 'interior_tours', enabled: true, order: 3 },
  { key: 'new_cars', enabled: true, order: 4 },
  { key: 'featured_comparisons', enabled: true, order: 5 },
  { key: 'reviews', enabled: true, order: 6 },
  { key: 'nearby_stations', enabled: true, order: 7 },
  { key: 'charging_guides', enabled: true, order: 8 },
] as const;

describe('planSections', () => {
  it('keeps the configured order and numbers visible sections 1..n', () => {
    const { visible, hidden } = planSections([...DEFAULT], ALL_ON, false);
    expect(visible.map((v) => v.key)).toEqual(DEFAULT.map((d) => d.key));
    expect(visible.map((v) => v.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(hidden).toEqual([]);
  });

  it('hides disabled sections and sections of features that are off', () => {
    const sections = DEFAULT.map((d) =>
      d.key === 'reviews' ? { ...d, enabled: false } : { ...d },
    );
    const { visible, hidden } = planSections(sections, { ...ALL_ON, cars: false }, false);
    expect(visible.map((v) => v.key)).not.toContain('reviews');
    expect(visible.map((v) => v.key)).not.toContain('new_cars');
    expect(hidden).toEqual([
      { key: 'new_cars', reason: 'feature_off' },
      { key: 'reviews', reason: 'disabled_by_admin' },
    ]);
  });

  it('inserts for_you after top_story, following latest_news visibility', () => {
    const { visible } = planSections([...DEFAULT], ALL_ON, true);
    expect(visible.slice(0, 3).map((v) => v.key)).toEqual(['top_story', 'for_you', 'latest_news']);
    const off = DEFAULT.map((d) => (d.key === 'latest_news' ? { ...d, enabled: false } : { ...d }));
    expect(planSections(off, ALL_ON, true).visible.map((v) => v.key)).not.toContain('for_you');
  });

  it('appends sections missing from the setting and ignores unknown keys', () => {
    const { visible } = planSections(
      [
        { key: 'charging_guides', enabled: true, order: 1 },
        { key: 'bogus' as never, enabled: true, order: 2 },
      ],
      ALL_ON,
      false,
    );
    expect(visible[0].key).toBe('charging_guides');
    expect(visible).toHaveLength(8);
  });

  it('everything is hidden when all features are off', () => {
    const { visible, hidden } = planSections([...DEFAULT], {}, true);
    expect(visible).toEqual([]);
    expect(hidden.every((h) => h.reason === 'feature_off')).toBe(true);
  });
});
