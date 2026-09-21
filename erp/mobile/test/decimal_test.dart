import 'package:eg_distribution_rep/services/decimal.dart';
import 'package:flutter_test/flutter_test.dart';

/// The device does the same arithmetic as the server. If these diverge, a rep
/// quotes one number and the office invoices another.
void main() {
  group('Dec', () {
    test('adds without binary floating point error', () {
      expect((Dec.parse('0.1') + Dec.parse('0.2')).toMoney(), '0.30');
    });

    test('rounds half away from zero, matching the server', () {
      expect(Dec.parse('2.005').toMoney(), '2.01');
      expect(Dec.parse('-2.005').toMoney(), '-2.01');
      expect(Dec.parse('2.0049').toMoney(), '2.00');
    });

    test('multiplies at full precision before rounding', () {
      // 3 cartons x 173.333333 should not drift.
      final total = Dec.parse('3') * Dec.parse('173.333333');
      expect(total.toMoney(), '520.00');
    });

    test('division by zero yields zero rather than throwing', () {
      expect(Dec.parse('5').divide(Dec.zero).isZero, isTrue);
    });

    test('percentage matches the server line computation', () {
      // 14% VAT on 4500 net.
      expect(Dec.parse('4500').percentOf(Dec.parse('14')).toMoney(), '630.00');
    });

    test('comparison is scale independent', () {
      expect(Dec.parse('10.00').compareTo(Dec.parse('10')), 0);
      expect(Dec.parse('10.01').compareTo(Dec.parse('10')), greaterThan(0));
    });
  });
}
