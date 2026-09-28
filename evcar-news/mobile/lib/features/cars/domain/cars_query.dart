import 'package:collection/collection.dart';
import 'package:flutter/foundation.dart';

/// `GET /cars` sort orders.
enum CarSort {
  newest('newest'),
  priceAsc('price_asc'),
  priceDesc('price_desc'),
  rangeDesc('range_desc'),
  name('name');

  const CarSort(this.apiValue);

  final String apiValue;
}

/// Range test cycles the catalog filters by (a minimum range is only
/// meaningful together with its cycle — the API answers 422 otherwise).
const rangeCycles = ['WLTP', 'EPA', 'CLTC', 'NEDC'];

const powertrainCodes = ['BEV', 'PHEV', 'EREV', 'HEV'];

const bodyTypeCodes = [
  'sedan',
  'hatchback',
  'suv',
  'crossover',
  'coupe',
  'convertible',
  'wagon',
  'pickup',
  'van',
  'mpv',
];

/// Catalog filters (market comes from the request headers).
@immutable
class CarsQuery {
  const CarsQuery({
    this.q,
    this.brand,
    this.powertrains = const {},
    this.bodies = const {},
    this.minPrice,
    this.maxPrice,
    this.minRangeKm,
    this.rangeCycle = 'WLTP',
    this.minSeats,
    this.sort = CarSort.newest,
  });

  final String? q;

  /// Brand slug (brand page).
  final String? brand;
  final Set<String> powertrains;
  final Set<String> bodies;

  /// Whole amounts in the market currency (compared with local prices only).
  final int? minPrice;
  final int? maxPrice;
  final int? minRangeKm;

  /// Always sent with [minRangeKm] and with `range_desc`.
  final String rangeCycle;
  final int? minSeats;
  final CarSort sort;

  static const _setEq = SetEquality<String>();

  /// Number of filters set in the filter sheet (search text and brand excluded).
  int get activeCount =>
      (powertrains.isNotEmpty ? 1 : 0) +
      (bodies.isNotEmpty ? 1 : 0) +
      (minPrice != null || maxPrice != null ? 1 : 0) +
      (minRangeKm != null ? 1 : 0) +
      (minSeats != null ? 1 : 0) +
      (sort != CarSort.newest ? 1 : 0);

  bool get hasFilters => activeCount > 0 || (q?.trim().isNotEmpty ?? false);

  CarsQuery copyWith({
    String? Function()? q,
    String? Function()? brand,
    Set<String>? powertrains,
    Set<String>? bodies,
    int? Function()? minPrice,
    int? Function()? maxPrice,
    int? Function()? minRangeKm,
    String? rangeCycle,
    int? Function()? minSeats,
    CarSort? sort,
  }) => CarsQuery(
    q: q != null ? q() : this.q,
    brand: brand != null ? brand() : this.brand,
    powertrains: powertrains ?? this.powertrains,
    bodies: bodies ?? this.bodies,
    minPrice: minPrice != null ? minPrice() : this.minPrice,
    maxPrice: maxPrice != null ? maxPrice() : this.maxPrice,
    minRangeKm: minRangeKm != null ? minRangeKm() : this.minRangeKm,
    rangeCycle: rangeCycle ?? this.rangeCycle,
    minSeats: minSeats != null ? minSeats() : this.minSeats,
    sort: sort ?? this.sort,
  );

  /// Clears the sheet filters, keeps search text and brand.
  CarsQuery cleared() => CarsQuery(q: q, brand: brand);

  Map<String, dynamic> toQueryParameters({int page = 1, int pageSize = 20}) {
    final text = q?.trim();
    return {
      if (text != null && text.isNotEmpty) 'q': text,
      if (brand != null) 'brand': brand,
      if (powertrains.isNotEmpty) 'powertrain': (powertrains.toList()..sort()).join(','),
      if (bodies.isNotEmpty) 'body': (bodies.toList()..sort()).join(','),
      if (minPrice != null) 'minPrice': '$minPrice',
      if (maxPrice != null) 'maxPrice': '$maxPrice',
      if (minRangeKm != null) 'minRange': minRangeKm,
      if (minRangeKm != null || sort == CarSort.rangeDesc) 'rangeCycle': rangeCycle,
      if (minSeats != null) 'minSeats': minSeats,
      if (sort != CarSort.newest) 'sort': sort.apiValue,
      'page': page,
      'pageSize': pageSize,
    };
  }

  /// Stable cache discriminator.
  String get cacheKey {
    final p = toQueryParameters()..remove('page');
    final keys = p.keys.toList()..sort();
    return keys.map((k) => '$k=${p[k]}').join('&');
  }

  @override
  bool operator ==(Object other) =>
      other is CarsQuery &&
      other.q == q &&
      other.brand == brand &&
      _setEq.equals(other.powertrains, powertrains) &&
      _setEq.equals(other.bodies, bodies) &&
      other.minPrice == minPrice &&
      other.maxPrice == maxPrice &&
      other.minRangeKm == minRangeKm &&
      other.rangeCycle == rangeCycle &&
      other.minSeats == minSeats &&
      other.sort == sort;

  @override
  int get hashCode => Object.hash(
    q,
    brand,
    _setEq.hash(powertrains),
    _setEq.hash(bodies),
    minPrice,
    maxPrice,
    minRangeKm,
    rangeCycle,
    minSeats,
    sort,
  );
}
