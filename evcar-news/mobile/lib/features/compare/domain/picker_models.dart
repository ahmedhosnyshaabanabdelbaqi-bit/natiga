import 'package:flutter/foundation.dart';

import '../../../core/json/json_readers.dart';

/// Levels of the `GET /cars/pickers` cascade: brand → model → year → trim →
/// market. Year, trim and market are all mandatory for a comparison
/// (REQUIREMENTS §7).
enum PickerLevel {
  brand('brand'),
  model('model'),
  year('year'),
  variant('variant'),
  market('market');

  const PickerLevel(this.apiValue);

  final String apiValue;

  static PickerLevel? fromApi(String? v) {
    for (final l in values) {
      if (l.apiValue == v) return l;
    }
    return null;
  }
}

/// One step of the cascade as a request (what has been chosen so far).
@immutable
class PickerQuery {
  const PickerQuery({this.brand, this.model, this.year, this.variant, required this.market, this.allMarkets = false});

  /// Brand id/slug (→ models).
  final String? brand;

  /// Model id (→ years; with [year] → trims).
  final String? model;
  final int? year;

  /// Variant id (→ markets).
  final String? variant;

  /// Market whose catalog is browsed (`scope=market`).
  final String market;

  /// `scope=all`: every public trim, not only those listed in [market].
  final bool allMarkets;

  PickerLevel get level {
    if (variant != null) return PickerLevel.market;
    if (model != null && year != null) return PickerLevel.variant;
    if (model != null) return PickerLevel.year;
    if (brand != null) return PickerLevel.model;
    return PickerLevel.brand;
  }

  Map<String, dynamic> toQueryParameters() => {
    // The deepest selection decides the level (see backend-vehicles §1).
    if (variant != null)
      'variant': variant
    else if (model != null) ...{
      'model': model,
      'year': ?year,
    } else if (brand != null)
      'brand': brand,
    'market': market,
    'scope': allMarkets ? 'all' : 'market',
  };

  String get cacheKey => Uri(queryParameters: toQueryParameters().map((k, v) => MapEntry(k, '$v'))).query;

  @override
  bool operator ==(Object other) =>
      other is PickerQuery &&
      other.brand == brand &&
      other.model == model &&
      other.year == year &&
      other.variant == variant &&
      other.market == market &&
      other.allMarkets == allMarkets;

  @override
  int get hashCode => Object.hash(brand, model, year, variant, market, allMarkets);
}

@immutable
class PickerMarketAvailability {
  const PickerMarketAvailability(this.code, this.availability);

  final String code;
  final String? availability;
}

/// One entry of a picker level.
@immutable
class PickerItem {
  const PickerItem({
    required this.id,
    required this.label,
    this.slug,
    this.sublabel,
    this.imageUrl,
    this.count,
    this.year,
    this.powertrainType,
    this.modelYear,
    this.modelId,
    this.modelSlug,
    this.title,
    this.markets = const [],
    this.availability,
    this.localName,
    this.currencyCode,
  });

  final String id;
  final String label;
  final String? slug;
  final String? sublabel;
  final String? imageUrl;
  final int? count;

  /// Year level.
  final int? year;

  /// Variant level.
  final String? powertrainType;
  final int? modelYear;
  final String? modelId;
  final String? modelSlug;
  final String? title;
  final List<PickerMarketAvailability> markets;

  /// Market level (id = market code).
  final String? availability;
  final String? localName;
  final String? currencyCode;

  static PickerItem? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('id');
    final label = j.stringOrNull('label');
    if (id == null || label == null) return null;
    return PickerItem(
      id: id,
      label: label,
      slug: j.stringOrNull('slug'),
      sublabel: j.stringOrNull('sublabel'),
      imageUrl: j.stringOrNull('imageUrl'),
      count: j.intOrNull('count'),
      year: j.intOrNull('year') ?? int.tryParse(label),
      powertrainType: j.stringOrNull('powertrainType'),
      modelYear: j.intOrNull('modelYear'),
      modelId: j.stringOrNull('modelId'),
      modelSlug: j.stringOrNull('modelSlug'),
      title: j.stringOrNull('title'),
      markets: [
        for (final m in j.objectList('markets', (m) => m))
          if (m.stringOrNull('code') != null)
            PickerMarketAvailability(m.stringOrNull('code')!, m.stringOrNull('availability')),
      ],
      availability: j.stringOrNull('availability'),
      localName: j.stringOrNull('localName'),
      currencyCode: j.stringOrNull('currencyCode'),
    );
  }
}

@immutable
class PickerPage {
  const PickerPage({required this.level, required this.marketCode, required this.items});

  final PickerLevel level;
  final String marketCode;
  final List<PickerItem> items;

  static PickerPage fromData(Object? data, {required PickerLevel expected}) {
    final j = asJsonObject(data, 'pickers');
    return PickerPage(
      level: PickerLevel.fromApi(j.stringOrNull('level')) ?? expected,
      marketCode: j.stringOrNull('marketCode') ?? '',
      items: j.objectList('items', (i) => PickerItem.tryParse(i)).nonNulls.toList(growable: false),
    );
  }
}
