import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_client.dart';
import '../../../core/json/json_readers.dart';

/// An admin-entered reference price (`GET /calculators/reference-prices`).
/// Never a built-in default: it carries its date, source and age.
@immutable
class ReferencePrice {
  const ReferencePrice({
    required this.id,
    required this.marketCode,
    required this.energyType,
    required this.label,
    required this.amount,
    required this.currency,
    required this.unit,
    required this.effectiveFrom,
    this.effectiveTo,
    this.sourceTitle,
    this.sourcePublisher,
    this.sourceUrl,
    this.ageDays,
    required this.possiblyOutdated,
    required this.isDemo,
  });

  final String id;
  final String marketCode;

  /// e.g. electricity_home, electricity_public, gasoline_92 …
  final String energyType;
  final String label;
  final String amount;
  final String currency;

  /// per_kwh | per_liter.
  final String unit;

  /// `YYYY-MM-DD`.
  final String effectiveFrom;
  final String? effectiveTo;
  final String? sourceTitle;
  final String? sourcePublisher;
  final String? sourceUrl;
  final int? ageDays;
  final bool possiblyOutdated;
  final bool isDemo;

  bool get perKwh => unit == 'per_kwh';

  factory ReferencePrice.fromJson(Map<String, dynamic> j) {
    final price = j.objectOrNull('price') ?? const <String, dynamic>{};
    final source = j.objectOrNull('source');
    final from = j.stringOrNull('effectiveFrom') ?? '';
    return ReferencePrice(
      id: j.requireString('id'),
      marketCode: j.stringOrNull('marketCode') ?? '',
      energyType: j.stringOrNull('energyType') ?? '',
      label: j.stringOrNull('label') ?? j.stringOrNull('energyType') ?? '',
      amount: price.stringOrNull('amount') ?? '',
      currency: price.stringOrNull('currency') ?? '',
      unit: j.stringOrNull('unit') ?? '',
      effectiveFrom: from.length >= 10 ? from.substring(0, 10) : from,
      effectiveTo: j.stringOrNull('effectiveTo'),
      sourceTitle: source?.stringOrNull('title'),
      sourcePublisher: source?.stringOrNull('publisher'),
      sourceUrl: source?.stringOrNull('url'),
      ageDays: j.intOrNull('ageDays'),
      possiblyOutdated: j.boolOr('possiblyOutdated', false),
      isDemo: j.boolOr('isDemo', false),
    );
  }
}

/// Server side of the calculators: the same engine as the app plus catalog
/// values (trim / garage car) and reference prices by id.
class CalculatorsRepository {
  CalculatorsRepository(this._api);

  final ApiClient _api;

  /// `POST /calculators/<kind>` → the raw `data` (same JSON as the local engine + `vehicle`).
  Future<Map<String, dynamic>> compute(String apiKind, Map<String, Object?> body) =>
      _api.postData('/calculators/$apiKind', (d) => asJsonObject(d, 'calculator'), body: body);

  Future<List<ReferencePrice>> referencePrices(String market) async {
    final page = await _api.getPage('/calculators/reference-prices', ReferencePrice.fromJson, query: {'market': market});
    return page.items;
  }
}

final calculatorsRepositoryProvider = Provider<CalculatorsRepository>(
  (ref) => CalculatorsRepository(ref.watch(apiClientProvider)),
);

final referencePricesProvider = FutureProvider.autoDispose.family<List<ReferencePrice>, String>((ref, market) {
  ref.watch(requestLocaleProvider);
  return ref.watch(calculatorsRepositoryProvider).referencePrices(market);
});
