import 'package:flutter/foundation.dart';

import '../../../core/json/json_readers.dart';

/// Models of the public vehicle catalog API (`docs/decisions/backend-vehicles.md` §1).
///
/// Hand-written parsing (no code generation). Every missing value stays
/// `null` so the UI shows "غير متوفر / Not available" — never 0.
/// Unknown enum strings are kept as strings; the UI decides how to label them.

/// `YYYY-MM-DD` → local midnight (a calendar date, never shifted by time zones).
DateTime? parseCalendarDate(String? value) {
  if (value == null || value.length < 10) return null;
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(value);
  if (m == null) return DateTime.tryParse(value);
  return DateTime(int.parse(m.group(1)!), int.parse(m.group(2)!), int.parse(m.group(3)!));
}

@immutable
class CatalogImage {
  const CatalogImage({
    required this.id,
    required this.url,
    this.width,
    this.height,
    this.alt,
    this.caption,
    this.credit,
    this.isDemo = false,
  });

  final String id;
  final String url;
  final int? width;
  final int? height;
  final String? alt;
  final String? caption;
  final String? credit;
  final bool isDemo;

  static CatalogImage? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final url = j.stringOrNull('url');
    if (url == null || url.isEmpty) return null;
    return CatalogImage(
      id: j.stringOrNull('id') ?? url,
      url: url,
      width: j.intOrNull('width'),
      height: j.intOrNull('height'),
      alt: j.stringOrNull('alt'),
      caption: j.stringOrNull('caption'),
      credit: j.stringOrNull('credit'),
      isDemo: j.boolOr('isDemo', false),
    );
  }

  double? get aspectRatio {
    final w = width;
    final h = height;
    if (w == null || h == null || w <= 0 || h <= 0) return null;
    return w / h;
  }
}

/// Where a value came from (`Source`).
@immutable
class CatalogSource {
  const CatalogSource({
    required this.id,
    required this.title,
    this.type,
    this.publisher,
    this.url,
    this.documentDate,
    this.accessedAt,
  });

  final String id;
  final String title;
  final String? type;
  final String? publisher;
  final String? url;
  final DateTime? documentDate;
  final DateTime? accessedAt;

  /// "Title — Publisher" (or just the title).
  String get displayName {
    final p = publisher?.trim();
    return p == null || p.isEmpty || p == title ? title : '$title — $p';
  }

  /// Only https links are opened.
  String? get safeUrl {
    final u = url;
    if (u == null) return null;
    final uri = Uri.tryParse(u);
    return uri != null && uri.scheme == 'https' && uri.host.isNotEmpty ? u : null;
  }

  static CatalogSource? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('id');
    final title = j.stringOrNull('title');
    if (id == null || title == null) return null;
    return CatalogSource(
      id: id,
      title: title,
      type: j.stringOrNull('type'),
      publisher: j.stringOrNull('publisher'),
      url: j.stringOrNull('url'),
      documentDate: parseCalendarDate(j.stringOrNull('documentDate')),
      accessedAt: j.dateTimeOrNull('accessedAt'),
    );
  }
}

/// Provenance shared by every data point: reliability + verifiedAt + source.
@immutable
class Provenance {
  const Provenance({this.reliability, this.verifiedAt, this.source});

  /// API string (`verified`, `manufacturer_claim`, …).
  final String? reliability;
  final DateTime? verifiedAt;
  final CatalogSource? source;

  static Provenance fromJson(Map<String, dynamic> j) => Provenance(
    reliability: j.stringOrNull('reliability'),
    verifiedAt: j.dateTimeOrNull('verifiedAt'),
    source: CatalogSource.tryParse(j['source']),
  );

  static const none = Provenance();
}

/// A spec value (`DataPoint`): number, text or boolean + unit + provenance.
@immutable
class DataPoint {
  const DataPoint({
    required this.value,
    this.unit,
    this.originalValue,
    this.originalUnit,
    this.marketCode,
    this.derived = false,
    this.provenance = Provenance.none,
  });

  /// `num`, `String` or `bool`.
  final Object value;
  final String? unit;
  final Object? originalValue;
  final String? originalUnit;
  final String? marketCode;
  final bool derived;
  final Provenance provenance;

  num? get number => value is num ? value as num : null;

  static DataPoint? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final v = j['value'];
    if (v == null) return null;
    final Object value;
    if (v is num) {
      value = v;
    } else if (v is bool) {
      value = v;
    } else if (v is String) {
      value = v;
    } else {
      return null;
    }
    return DataPoint(
      value: value,
      unit: j.stringOrNull('unit'),
      originalValue: j['originalValue'],
      originalUnit: j.stringOrNull('originalUnit'),
      marketCode: j.stringOrNull('marketCode'),
      derived: j.boolOr('derived', false),
      provenance: Provenance.fromJson(j),
    );
  }
}

@immutable
class Money {
  const Money({required this.amount, required this.currency});

  /// Decimal string ("1850000.00"), never converted.
  final String amount;
  final String currency;

  static Money? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final amount = j.stringOrNull('amount');
    final currency = j.stringOrNull('currency');
    if (amount == null || currency == null || num.tryParse(amount) == null) return null;
    return Money(amount: amount, currency: currency);
  }
}

/// A price row with type, validity and provenance (`Price`).
@immutable
class CarPrice {
  const CarPrice({
    required this.id,
    required this.marketCode,
    required this.amount,
    required this.priceType,
    this.priceTypeLabel,
    this.effectiveFrom,
    this.effectiveTo,
    this.isCurrent = false,
    this.inMarketCurrency = true,
    this.notes,
    this.provenance = Provenance.none,
  });

  final String id;
  final String marketCode;
  final Money amount;

  /// `official_msrp` | `dealer` | `market_estimate`.
  final String priceType;
  final String? priceTypeLabel;
  final DateTime? effectiveFrom;
  final DateTime? effectiveTo;
  final bool isCurrent;

  /// false = a foreign-currency estimate (label as converted/estimate).
  final bool inMarketCurrency;
  final String? notes;
  final Provenance provenance;

  static CarPrice? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final money = Money.tryParse(j['amount']);
    final type = j.stringOrNull('priceType');
    if (money == null || type == null) return null;
    return CarPrice(
      id: j.stringOrNull('id') ?? '${type}_${j.stringOrNull('effectiveFrom')}',
      marketCode: j.stringOrNull('marketCode') ?? '',
      amount: money,
      priceType: type,
      priceTypeLabel: j.stringOrNull('priceTypeLabel'),
      effectiveFrom: parseCalendarDate(j.stringOrNull('effectiveFrom')),
      effectiveTo: parseCalendarDate(j.stringOrNull('effectiveTo')),
      isCurrent: j.boolOr('isCurrent', false),
      inMarketCurrency: j.boolOr('inMarketCurrency', true),
      notes: j.stringOrNull('notes'),
      provenance: Provenance.fromJson(j),
    );
  }
}

/// `PriceSummary` on cards (priceFrom / priceTo).
@immutable
class PriceSummary {
  const PriceSummary({required this.amount, required this.priceType, this.effectiveFrom, this.variantId});

  final Money amount;
  final String priceType;
  final DateTime? effectiveFrom;
  final String? variantId;

  static PriceSummary? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final money = Money.tryParse(j['amount']);
    final type = j.stringOrNull('priceType');
    if (money == null || type == null) return null;
    return PriceSummary(
      amount: money,
      priceType: type,
      effectiveFrom: parseCalendarDate(j.stringOrNull('effectiveFrom')),
      variantId: j.stringOrNull('variantId'),
    );
  }
}

/// Range span per cycle on cards (never merged across cycles).
@immutable
class RangeSpan {
  const RangeSpan({required this.cycle, required this.rangeType, this.minKm, this.maxKm});

  final String cycle;

  /// `electric` | `total`.
  final String rangeType;
  final num? minKm;
  final num? maxKm;

  static RangeSpan? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final cycle = j.stringOrNull('cycle');
    if (cycle == null) return null;
    return RangeSpan(
      cycle: cycle,
      rangeType: j.stringOrNull('rangeType') ?? 'electric',
      minKm: j.doubleOrNull('minKm'),
      maxKm: j.doubleOrNull('maxKm'),
    );
  }
}

@immutable
class BrandRef {
  const BrandRef({required this.id, required this.slug, required this.name, this.logo});

  final String id;
  final String slug;
  final String name;
  final CatalogImage? logo;

  static BrandRef? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('id');
    final slug = j.stringOrNull('slug');
    final name = j.stringOrNull('name');
    if (id == null || slug == null || name == null) return null;
    return BrandRef(id: id, slug: slug, name: name, logo: CatalogImage.tryParse(j['logo']));
  }
}

@immutable
class BrandSummary {
  const BrandSummary({
    required this.ref,
    this.countryCode,
    this.carCount,
    this.isDemo = false,
    this.description,
    this.websiteUrl,
  });

  final BrandRef ref;
  final String? countryCode;

  /// Models listed in the request market.
  final int? carCount;
  final bool isDemo;
  final String? description;
  final String? websiteUrl;

  String get id => ref.id;
  String get slug => ref.slug;
  String get name => ref.name;

  static BrandSummary? tryParse(Object? json) {
    final ref = BrandRef.tryParse(json);
    if (ref == null) return null;
    final j = asJsonObject(json);
    return BrandSummary(
      ref: ref,
      countryCode: j.stringOrNull('countryCode'),
      carCount: j.intOrNull('carCount'),
      isDemo: j.boolOr('isDemo', false),
      description: j.stringOrNull('description'),
      websiteUrl: j.stringOrNull('websiteUrl'),
    );
  }
}

/// A model not listed in the request market (`BrandDetail.notInMarket`).
@immutable
class NotInMarketModel {
  const NotInMarketModel({
    required this.id,
    required this.slug,
    required this.name,
    this.image,
    this.marketCodes = const [],
  });

  final String id;
  final String slug;
  final String name;
  final CatalogImage? image;
  final List<String> marketCodes;

  static NotInMarketModel? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('id');
    final slug = j.stringOrNull('slug');
    final name = j.stringOrNull('name');
    if (id == null || slug == null || name == null) return null;
    return NotInMarketModel(
      id: id,
      slug: slug,
      name: name,
      image: CatalogImage.tryParse(j['image']),
      marketCodes: j.stringList('marketCodes'),
    );
  }
}

@immutable
class BrandDetail {
  const BrandDetail({required this.brand, this.cars = const [], this.notInMarket = const []});

  final BrandSummary brand;
  final List<CarSummary> cars;
  final List<NotInMarketModel> notInMarket;

  static BrandDetail fromData(Object? data) {
    final brand = BrandSummary.tryParse(data) ?? (throw const FormatException('Invalid brand'));
    final j = asJsonObject(data);
    final cars = j['cars'] is List ? [for (final c in j['cars'] as List) ?CarSummary.tryParse(c)] : <CarSummary>[];
    final nim = j['notInMarket'] is List
        ? [for (final c in j['notInMarket'] as List) ?NotInMarketModel.tryParse(c)]
        : <NotInMarketModel>[];
    return BrandDetail(brand: brand, cars: cars, notInMarket: nim);
  }
}

/// Catalog card of a MODEL (`CarCard`).
@immutable
class CarSummary {
  const CarSummary({
    required this.id,
    required this.slug,
    required this.title,
    required this.name,
    required this.brand,
    this.bodyType,
    this.image,
    this.powertrainTypes = const [],
    this.modelYears = const [],
    this.variantCount,
    this.priceFrom,
    this.priceTo,
    this.ranges = const [],
    this.usableBatteryMinKwh,
    this.usableBatteryMaxKwh,
    this.maxDcPeakKw,
    this.hasTour = false,
    this.availability,
    this.isDemo = false,
  });

  final String id;
  final String slug;

  /// "Brand Model".
  final String title;

  /// Model name only.
  final String name;
  final BrandRef brand;
  final String? bodyType;
  final CatalogImage? image;
  final List<String> powertrainTypes;

  /// Newest first.
  final List<int> modelYears;
  final int? variantCount;
  final PriceSummary? priceFrom;
  final PriceSummary? priceTo;
  final List<RangeSpan> ranges;
  final num? usableBatteryMinKwh;
  final num? usableBatteryMaxKwh;
  final num? maxDcPeakKw;
  final bool hasTour;
  final String? availability;
  final bool isDemo;

  /// Best electric range span to show on a card: preferred cycle first
  /// (WLTP, EPA, CLTC, NEDC, OTHER) — the cycle is always shown with it.
  RangeSpan? get headlineRange {
    final electric = ranges.where((r) => r.rangeType == 'electric').toList();
    if (electric.isEmpty) return null;
    const order = ['WLTP', 'EPA', 'CLTC', 'NEDC', 'OTHER'];
    electric.sort((a, b) {
      final ia = order.indexOf(a.cycle.toUpperCase());
      final ib = order.indexOf(b.cycle.toUpperCase());
      return (ia < 0 ? 99 : ia).compareTo(ib < 0 ? 99 : ib);
    });
    return electric.first;
  }

  static CarSummary? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('id');
    final slug = j.stringOrNull('slug');
    final brand = BrandRef.tryParse(j['brand']);
    if (id == null || slug == null || brand == null) return null;
    final name = j.stringOrNull('name') ?? slug;
    final battery = j.objectOrNull('usableBatteryKwh');
    return CarSummary(
      id: id,
      slug: slug,
      title: j.stringOrNull('title') ?? '${brand.name} $name',
      name: name,
      brand: brand,
      bodyType: j.stringOrNull('bodyType'),
      image: CatalogImage.tryParse(j['image']),
      powertrainTypes: j.stringList('powertrainTypes'),
      modelYears: j['modelYears'] is List
          ? (j['modelYears'] as List).whereType<num>().map((e) => e.toInt()).toList()
          : const [],
      variantCount: j.intOrNull('variantCount'),
      priceFrom: PriceSummary.tryParse(j['priceFrom']),
      priceTo: PriceSummary.tryParse(j['priceTo']),
      ranges: j['ranges'] is List ? [for (final r in j['ranges'] as List) ?RangeSpan.tryParse(r)] : const [],
      usableBatteryMinKwh: battery?.doubleOrNull('min'),
      usableBatteryMaxKwh: battery?.doubleOrNull('max'),
      maxDcPeakKw: j.doubleOrNull('maxDcPeakKw'),
      hasTour: j.boolOr('hasTour', false),
      availability: j.stringOrNull('availability'),
      isDemo: j.boolOr('isDemo', false),
    );
  }
}

/// Related article card (`ArticleCard`).
@immutable
class RelatedArticle {
  const RelatedArticle({
    required this.id,
    required this.slug,
    required this.title,
    this.type,
    this.summary,
    this.language,
    this.coverImage,
    this.publishedAt,
    this.isSponsored = false,
    this.sponsorName,
    this.isDemo = false,
  });

  final String id;
  final String slug;
  final String title;
  final String? type;
  final String? summary;
  final String? language;
  final CatalogImage? coverImage;
  final DateTime? publishedAt;
  final bool isSponsored;
  final String? sponsorName;
  final bool isDemo;

  static RelatedArticle? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('id');
    final slug = j.stringOrNull('slug');
    final title = j.stringOrNull('title');
    if (id == null || slug == null || title == null) return null;
    return RelatedArticle(
      id: id,
      slug: slug,
      title: title,
      type: j.stringOrNull('type'),
      summary: j.stringOrNull('summary'),
      language: j.stringOrNull('language'),
      coverImage: CatalogImage.tryParse(j['coverImage']),
      publishedAt: j.dateTimeOrNull('publishedAt'),
      isSponsored: j.boolOr('isSponsored', false),
      sponsorName: j.stringOrNull('sponsorName'),
      isDemo: j.boolOr('isDemo', false),
    );
  }
}

@immutable
class SeatScene {
  const SeatScene({required this.id, required this.key, this.position, this.title});

  final String id;
  final String key;

  /// `driver`, `passenger`, `rear`, … (API enum).
  final String? position;
  final String? title;

  static SeatScene? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('id');
    if (id == null) return null;
    return SeatScene(
      id: id,
      key: j.stringOrNull('key') ?? id,
      position: j.stringOrNull('position'),
      title: j.stringOrNull('title'),
    );
  }
}

/// A published 360° interior tour (`TourCard`).
@immutable
class TourSummary {
  const TourSummary({
    required this.id,
    required this.variantId,
    this.slug,
    this.title,
    this.marketCode,
    this.driveSide,
    this.interiorColorName,
    this.interiorColorHex,
    this.seatScenes = const [],
    this.isReferenceForSimilarTrim = false,
    this.differenceNote,
    this.referenceVariantName,
    this.previewUrl,
    this.isDemo = false,
  });

  final String id;
  final String variantId;
  final String? slug;
  final String? title;
  final String? marketCode;
  final String? driveSide;
  final String? interiorColorName;
  final String? interiorColorHex;
  final List<SeatScene> seatScenes;

  /// Photographed in a similar trim (editor-approved) — must be said clearly.
  final bool isReferenceForSimilarTrim;
  final String? differenceNote;
  final String? referenceVariantName;
  final String? previewUrl;
  final bool isDemo;

  static TourSummary? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('id');
    final variantId = j.stringOrNull('variantId');
    if (id == null || variantId == null) return null;
    return TourSummary(
      id: id,
      variantId: variantId,
      slug: j.stringOrNull('slug'),
      title: j.stringOrNull('title'),
      marketCode: j.stringOrNull('marketCode'),
      driveSide: j.stringOrNull('driveSide'),
      interiorColorName: j.stringOrNull('interiorColorName'),
      interiorColorHex: j.stringOrNull('interiorColorHex'),
      seatScenes: j.objectList('seatScenes', (e) => SeatScene.tryParse(e)).whereType<SeatScene>().toList(),
      isReferenceForSimilarTrim: j.boolOr('isReferenceForSimilarTrim', false),
      differenceNote: j.stringOrNull('differenceNote'),
      referenceVariantName: j.stringOrNull('referenceVariantName'),
      previewUrl: j.stringOrNull('previewUrl'),
      isDemo: j.boolOr('isDemo', false),
    );
  }
}

@immutable
class ToursInfo {
  const ToursInfo({this.tours = const [], this.unavailableLabel});

  final List<TourSummary> tours;

  /// Server text "الجولة غير متاحة لهذه الفئة" (the app has its own fallback).
  final String? unavailableLabel;

  bool get available => tours.isNotEmpty;

  /// Tours of one trim: exact tours first, then reference tours.
  List<TourSummary> forVariant(String variantId) {
    final list = tours.where((t) => t.variantId == variantId).toList();
    list.sort((a, b) => (a.isReferenceForSimilarTrim ? 1 : 0).compareTo(b.isReferenceForSimilarTrim ? 1 : 0));
    return list;
  }

  static ToursInfo tryParse(Object? json) {
    if (json is! Map) return const ToursInfo();
    final j = asJsonObject(json);
    final tours = j['tours'] is List ? [for (final t in j['tours'] as List) ?TourSummary.tryParse(t)] : <TourSummary>[];
    return ToursInfo(tours: tours, unavailableLabel: j.stringOrNull('unavailableLabel'));
  }
}

@immutable
class MarketAvailability {
  const MarketAvailability({required this.code, required this.name, this.availability});

  final String code;
  final String name;

  /// `available`, `coming_soon`, `discontinued`, `not_available`, `unknown`, `not_listed`.
  final String? availability;

  static MarketAvailability? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final code = j.stringOrNull('code');
    if (code == null) return null;
    return MarketAvailability(
      code: code,
      name: j.stringOrNull('name') ?? code,
      availability: j.stringOrNull('availability'),
    );
  }
}

@immutable
class VariantKeyFacts {
  const VariantKeyFacts({
    this.usableBatteryKwh,
    this.grossBatteryKwh,
    this.powerKw,
    this.accel0100S,
    this.acMaxKw,
    this.dcPeakKw,
    this.ranges = const [],
  });

  final num? usableBatteryKwh;
  final num? grossBatteryKwh;
  final num? powerKw;
  final num? accel0100S;
  final num? acMaxKw;
  final num? dcPeakKw;
  final List<RangeSpan> ranges;

  static VariantKeyFacts fromJson(Map<String, dynamic>? j) {
    if (j == null) return const VariantKeyFacts();
    return VariantKeyFacts(
      usableBatteryKwh: j.doubleOrNull('usableBatteryKwh'),
      grossBatteryKwh: j.doubleOrNull('grossBatteryKwh'),
      powerKw: j.doubleOrNull('powerKw'),
      accel0100S: j.doubleOrNull('accel0100S'),
      acMaxKw: j.doubleOrNull('acMaxKw'),
      dcPeakKw: j.doubleOrNull('dcPeakKw'),
      ranges: j['ranges'] is List ? [for (final r in j['ranges'] as List) ?RangeSpan.tryParse(r)] : const [],
    );
  }
}

/// One trim on the model page (`VariantSummary`).
@immutable
class VariantSummary {
  const VariantSummary({
    required this.id,
    required this.slug,
    required this.name,
    required this.modelYear,
    required this.powertrainType,
    this.localName,
    this.trimCode,
    this.bodyType,
    this.driveType,
    this.seats,
    this.availability,
    this.currentPrice,
    this.keyFacts = const VariantKeyFacts(),
    this.hasTour = false,
    this.isDemo = false,
  });

  final String id;
  final String slug;
  final String name;
  final String? localName;
  final String? trimCode;
  final int modelYear;
  final String powertrainType;
  final String? bodyType;
  final String? driveType;
  final int? seats;
  final String? availability;
  final CarPrice? currentPrice;
  final VariantKeyFacts keyFacts;
  final bool hasTour;
  final bool isDemo;

  /// Local market name wins when present.
  String get displayName => (localName?.trim().isNotEmpty ?? false) ? localName! : name;

  static VariantSummary? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('id');
    final slug = j.stringOrNull('slug');
    final name = j.stringOrNull('name');
    final year = j.intOrNull('modelYear');
    if (id == null || slug == null || name == null || year == null) return null;
    return VariantSummary(
      id: id,
      slug: slug,
      name: name,
      localName: j.stringOrNull('localName'),
      trimCode: j.stringOrNull('trimCode'),
      modelYear: year,
      powertrainType: j.stringOrNull('powertrainType') ?? '',
      bodyType: j.stringOrNull('bodyType'),
      driveType: j.stringOrNull('driveType'),
      seats: j.intOrNull('seats'),
      availability: j.stringOrNull('availability'),
      currentPrice: CarPrice.tryParse(j['currentPrice']),
      keyFacts: VariantKeyFacts.fromJson(j.objectOrNull('keyFacts')),
      hasTour: j.boolOr('hasTour', false),
      isDemo: j.boolOr('isDemo', false),
    );
  }
}

@immutable
class ModelYearGroup {
  const ModelYearGroup({required this.id, required this.year, required this.variants});

  final String id;
  final int year;
  final List<VariantSummary> variants;

  static ModelYearGroup? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final year = j.intOrNull('year');
    if (year == null) return null;
    final variants = j['variants'] is List
        ? [for (final v in j['variants'] as List) ?VariantSummary.tryParse(v)]
        : <VariantSummary>[];
    return ModelYearGroup(id: j.stringOrNull('id') ?? '$year', year: year, variants: variants);
  }
}

@immutable
class GenerationGroup {
  const GenerationGroup({
    required this.id,
    required this.name,
    this.slug,
    this.code,
    this.startYear,
    this.endYear,
    this.years = const [],
  });

  final String id;
  final String name;
  final String? slug;
  final String? code;
  final int? startYear;
  final int? endYear;
  final List<ModelYearGroup> years;

  static GenerationGroup? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('id');
    if (id == null) return null;
    return GenerationGroup(
      id: id,
      name: j.stringOrNull('name') ?? '',
      slug: j.stringOrNull('slug'),
      code: j.stringOrNull('code'),
      startYear: j.intOrNull('startYear'),
      endYear: j.intOrNull('endYear'),
      years: j['years'] is List ? [for (final y in j['years'] as List) ?ModelYearGroup.tryParse(y)] : const [],
    );
  }
}

/// One selectable model year (a generation + year pair, so two generations
/// sold in the same year are never mixed).
@immutable
class YearOption {
  const YearOption({required this.generation, required this.year});

  final GenerationGroup generation;
  final ModelYearGroup year;

  String get id => year.id;
}

/// Model page (`CarDetail`).
@immutable
class CarDetail {
  const CarDetail({
    required this.id,
    required this.slug,
    required this.title,
    required this.name,
    required this.brand,
    required this.marketCode,
    this.description,
    this.bodyType,
    this.heroImage,
    this.images = const [],
    this.availableInMarket = true,
    this.availableMarkets = const [],
    this.powertrainTypes = const [],
    this.priceFrom,
    this.priceTo,
    this.generations = const [],
    this.defaultVariantId,
    this.tours = const ToursInfo(),
    this.competitors = const [],
    this.relatedArticles = const [],
    this.isDemo = false,
  });

  final String id;
  final String slug;
  final String title;
  final String name;
  final BrandRef brand;
  final String marketCode;
  final String? description;
  final String? bodyType;
  final CatalogImage? heroImage;
  final List<CatalogImage> images;
  final bool availableInMarket;
  final List<MarketAvailability> availableMarkets;
  final List<String> powertrainTypes;
  final PriceSummary? priceFrom;
  final PriceSummary? priceTo;
  final List<GenerationGroup> generations;
  final String? defaultVariantId;
  final ToursInfo tours;
  final List<CarSummary> competitors;
  final List<RelatedArticle> relatedArticles;
  final bool isDemo;

  /// Every (generation, year), newest year first.
  List<YearOption> get yearOptions {
    final list = [
      for (final g in generations)
        for (final y in g.years)
          if (y.variants.isNotEmpty) YearOption(generation: g, year: y),
    ];
    list.sort((a, b) => b.year.year.compareTo(a.year.year));
    return list;
  }

  List<VariantSummary> get allVariants => [
    for (final g in generations)
      for (final y in g.years) ...y.variants,
  ];

  VariantSummary? variantById(String? id) {
    if (id == null) return null;
    for (final v in allVariants) {
      if (v.id == id || v.slug == id) return v;
    }
    return null;
  }

  YearOption? yearOptionOf(String variantId) {
    for (final o in yearOptions) {
      if (o.year.variants.any((v) => v.id == variantId)) return o;
    }
    return null;
  }

  static CarDetail fromData(Object? data) {
    final j = asJsonObject(data, 'car');
    final id = j.stringOrNull('id');
    final slug = j.stringOrNull('slug');
    final brand = BrandRef.tryParse(j['brand']);
    if (id == null || slug == null || brand == null) throw const FormatException('Invalid car');
    final name = j.stringOrNull('name') ?? slug;
    List<T> list<T>(String key, T? Function(Object?) parse) =>
        j[key] is List ? [for (final e in j[key] as List) ?parse(e)] : <T>[];
    return CarDetail(
      id: id,
      slug: slug,
      title: j.stringOrNull('title') ?? '${brand.name} $name',
      name: name,
      brand: brand,
      marketCode: j.stringOrNull('marketCode') ?? '',
      description: j.stringOrNull('description'),
      bodyType: j.stringOrNull('bodyType'),
      heroImage: CatalogImage.tryParse(j['heroImage']),
      images: list('images', CatalogImage.tryParse),
      availableInMarket: j.boolOr('availableInMarket', true),
      availableMarkets: list('availableMarkets', MarketAvailability.tryParse),
      powertrainTypes: j.stringList('powertrainTypes'),
      priceFrom: PriceSummary.tryParse(j['priceFrom']),
      priceTo: PriceSummary.tryParse(j['priceTo']),
      generations: list('generations', GenerationGroup.tryParse),
      defaultVariantId: j.stringOrNull('defaultVariantId'),
      tours: ToursInfo.tryParse(j['tours']),
      competitors: list('competitors', CarSummary.tryParse),
      relatedArticles: list('relatedArticles', RelatedArticle.tryParse),
      isDemo: j.boolOr('isDemo', false),
    );
  }
}
