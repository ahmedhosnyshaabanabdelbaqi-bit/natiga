import { SpecDataType } from '../../../generated/prisma/enums';
import { AppException } from '../../../common/errors/app.exception';
import { normalizeSpecValue, specAllowsZero } from './spec-values';

const def = (key: string, unit: string | null) => ({
  key,
  group: key.split('.')[0],
  dataType: SpecDataType.number,
  unit,
});

describe('normalizeSpecValue — zero on measured quantities (review 3)', () => {
  it.each([
    ['performance.accel_0_100_s', 's'],
    ['performance.power_kw', 'kW'],
    ['charging.dc_peak_kw', 'kW'],
    ['battery.usable_kwh', 'kWh'],
  ])('%s = 0 is refused (placeholder, not a value)', (key, unit) => {
    let err: unknown;
    try {
      normalizeSpecValue(def(key, unit), { value: 0 }, 'items.0.');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).details).toEqual([
      { field: 'items.0.value', constraints: { positive: expect.any(String) } },
    ]);
  });

  it('0 is allowed where it is a real value (frunk, towing, unit-less counts)', () => {
    for (const d of [
      def('practicality.frunk_l', 'L'),
      def('practicality.towing_braked_kg', 'kg'),
      def('safety.airbags', null),
      def('safety.ncap_rating', null),
    ]) {
      expect(specAllowsZero(d)).toBe(true);
      expect(normalizeSpecValue(d, { value: 0 }).valueNum).toBe(0);
    }
  });

  it('positive values still pass', () => {
    expect(normalizeSpecValue(def('performance.accel_0_100_s', 's'), { value: 3.8 }).valueNum).toBe(
      3.8,
    );
  });
});
