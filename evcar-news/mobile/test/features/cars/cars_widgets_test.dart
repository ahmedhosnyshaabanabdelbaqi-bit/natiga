import 'package:evcar_news/features/cars/domain/catalog_models.dart';
import 'package:evcar_news/features/cars/domain/variant_sheet.dart';
import 'package:evcar_news/features/cars/presentation/widgets/charging_section.dart';
import 'package:evcar_news/features/cars/presentation/widgets/price_section.dart';
import 'package:evcar_news/features/cars/presentation/widgets/spec_sections.dart';
import 'package:evcar_news/features/cars/presentation/widgets/tours_section.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/kit_harness.dart';
import 'cars_fixtures.dart';

VariantSheet _sheet([void Function(Map<String, dynamic> d)? edit]) {
  final json = copyJson(fixture('variant'));
  final data = json['data'] as Map<String, dynamic>;
  edit?.call(data);
  return VariantSheet.fromData(data);
}

void main() {
  testWidgets('a foreign-currency figure is labelled as a converted estimate, never as an official price', (
    tester,
  ) async {
    final sheet = _sheet((d) {
      final current = (d['price'] as Map)['current'] as Map;
      current['inMarketCurrency'] = false;
      current['priceType'] = 'market_estimate';
      current['amount'] = {'amount': '40000.00', 'currency': 'USD'};
    });
    await pumpKit(tester, PriceSection(sheet: sheet));
    expect(find.text('Estimate after conversion'), findsWidgets);
    expect(find.text('Official price (MSRP)'), findsNothing);
  });

  testWidgets('no local price: said plainly (never 0)', (tester) async {
    final sheet = VariantSheet.fromData(fixture('variant_sa')['data']);
    await pumpKit(tester, PriceSection(sheet: sheet));
    expect(find.text('Price not available'), findsOneWidget);
    expect(find.textContaining('not sold in Saudi Arabia'), findsOneWidget);
    expect(find.textContaining(' 0'), findsNothing);
  });

  testWidgets('self-charging hybrids show a note instead of charging data', (tester) async {
    final sheet = _sheet((d) => d['powertrainType'] = 'HEV');
    await pumpKit(tester, ChargingSection(sheet: sheet));
    expect(find.textContaining('without a charging port'), findsOneWidget);
  });

  testWidgets('reference tours say which trim was photographed', (tester) async {
    await pumpKit(
      tester,
      const ToursSection(
        carSlug: 'demo',
        toursEnabled: true,
        images: [],
        tours: [
          TourSummary(
            id: 't1',
            variantId: 'v1',
            isReferenceForSimilarTrim: true,
            referenceVariantName: 'Long Range (demo)',
            differenceNote: 'Different seat fabric (demo note)',
            isDemo: true,
          ),
        ],
      ),
    );
    expect(find.text('360° interior tour'), findsOneWidget);
    expect(find.textContaining('Photographed in a similar trim: Long Range (demo)'), findsOneWidget);
    expect(find.textContaining('Different seat fabric'), findsOneWidget);
  });

  testWidgets('no tour for the trim: honest message + gallery fallback', (tester) async {
    await pumpKit(tester, const ToursSection(carSlug: 'demo', toursEnabled: true, images: [], tours: []));
    expect(find.text('The interior tour is not available for this trim'), findsOneWidget);
    expect(find.text('No photos yet'), findsOneWidget);
  });

  testWidgets('an OTHER cycle keeps its note next to the value', (tester) async {
    final sheet = _sheet((d) {
      final r = (d['ranges'] as List).first as Map;
      r['cycle'] = 'OTHER';
      r['cycleNote'] = 'Demo cycle';
    });
    await pumpKit(tester, RangesCard(sheet: sheet));
    expect(find.text('Other cycle: Demo cycle'), findsOneWidget);
  });

  for (final config in kitMatrix) {
    testWidgets('spec sections in every language/theme/text size ($config)', (tester) async {
      final sheet = _sheet();
      await pumpKit(
        tester,
        Column(
          children: [
            KeyFactsGrid(sheet: sheet),
            RangesCard(sheet: sheet),
            ChargingSection(sheet: sheet),
            SpecGroupsView(groups: sheet.specGroups, forceTable: false),
          ],
        ),
        config: config,
      );
      expect(tester.takeException(), isNull);
      expect(find.text(config.lang == 'ar' ? 'غير متوفر' : 'Not available'), findsWidgets);
    });
  }

  testWidgets('landscape table layout has reliability and source columns', (tester) async {
    final sheet = _sheet();
    await pumpKit(tester, SpecGroupsView(groups: sheet.specGroups, forceTable: true), size: const Size(800, 400));
    expect(find.byType(Table), findsWidgets);
    expect(find.text('Reliability'), findsWidgets);
    expect(find.text('Unverified'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('"hide unavailable values" hides missing rows only', (tester) async {
    final sheet = _sheet();
    await pumpKit(tester, SpecGroupsView(groups: sheet.specGroups, forceTable: false));
    final before = find.text('Not available').evaluate().length;
    await tester.tap(find.text('Hide unavailable values'));
    await tester.pumpAndSettle();
    expect(find.text('Not available').evaluate().length, lessThan(before));
  });
}
