import 'package:flutter/foundation.dart';

import '../../../core/json/json_readers.dart';
import 'catalog_models.dart';

/// Full spec sheet of one trim in one market (`VariantSheet`,
/// `GET /variants/:variant` and `GET /cars/:slug/variants/:variant`).

@immutable
class SheetMarket {
  const SheetMarket({
    required this.code,
    required this.name,
    this.currencyCode,
    this.offered = false,
    this.availability,
    this.localName,
    this.launchDate,
    this.discontinuedAt,
    this.driveSide,
    this.verifiedAt,
  });

  final String code;
  final String name;
  final String? currencyCode;

  /// false → the trim has no listing in this market (no price, no inlets).
  final bool offered;
  final String? availability;
  final String? localName;
  final DateTime? launchDate;
  final DateTime? discontinuedAt;
  final String? driveSide;
  final DateTime? verifiedAt;

  static SheetMarket fromJson(Map<String, dynamic>? j) {
    if (j == null) return const SheetMarket(code: '', name: '');
    final code = j.stringOrNull('code') ?? '';
    return SheetMarket(
      code: code,
      name: j.stringOrNull('name') ?? code,
      currencyCode: j.stringOrNull('currencyCode'),
      offered: j.boolOr('offered', false),
      availability: j.stringOrNull('availability'),
      localName: j.stringOrNull('localName'),
      launchDate: parseCalendarDate(j.stringOrNull('launchDate')),
      discontinuedAt: parseCalendarDate(j.stringOrNull('discontinuedAt')),
      driveSide: j.stringOrNull('driveSide'),
      verifiedAt: j.dateTimeOrNull('verifiedAt'),
    );
  }
}

@immutable
class SpecItem {
  const SpecItem({
    required this.key,
    required this.label,
    this.description,
    this.dataType,
    this.unit,
    this.isKeySpec = false,
    this.point,
  });

  /// `battery.usable_kwh`, …
  final String key;
  final String label;
  final String? description;

  /// `number` | `text` | `boolean`.
  final String? dataType;

  /// Canonical unit of the definition (`kWh`, `year`, `in`, …).
  final String? unit;
  final bool isKeySpec;

  /// null = not available.
  final DataPoint? point;

  static SpecItem? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final key = j.stringOrNull('key');
    if (key == null) return null;
    return SpecItem(
      key: key,
      label: j.stringOrNull('label') ?? key,
      description: j.stringOrNull('description'),
      dataType: j.stringOrNull('dataType'),
      unit: j.stringOrNull('unit'),
      isKeySpec: j.boolOr('isKeySpec', false),
      point: DataPoint.tryParse(j['point']),
    );
  }
}

@immutable
class SpecGroupData {
  const SpecGroupData({required this.key, required this.label, this.items = const []});

  final String key;
  final String label;
  final List<SpecItem> items;

  int get availableCount => items.where((i) => i.point != null).length;

  static SpecGroupData? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final key = j.stringOrNull('key');
    if (key == null) return null;
    return SpecGroupData(
      key: key,
      label: j.stringOrNull('label') ?? key,
      items: j['items'] is List ? [for (final i in j['items'] as List) ?SpecItem.tryParse(i)] : const [],
    );
  }
}

@immutable
class RangeEntry {
  const RangeEntry({
    required this.id,
    required this.cycle,
    required this.rangeType,
    this.valueKm,
    this.cycleNote,
    this.wheelSizeInch,
    this.conditions,
    this.provenance = Provenance.none,
  });

  final String id;
  final String cycle;
  final String rangeType;
  final num? valueKm;
  final String? cycleNote;
  final num? wheelSizeInch;
  final String? conditions;
  final Provenance provenance;

  static RangeEntry? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final cycle = j.stringOrNull('cycle');
    if (cycle == null) return null;
    return RangeEntry(
      id: j.stringOrNull('id') ?? cycle,
      cycle: cycle,
      rangeType: j.stringOrNull('rangeType') ?? 'electric',
      valueKm: j.doubleOrNull('valueKm'),
      cycleNote: j.stringOrNull('cycleNote'),
      wheelSizeInch: j.doubleOrNull('wheelSizeInch'),
      conditions: j.stringOrNull('conditions'),
      provenance: Provenance.fromJson(j),
    );
  }
}

@immutable
class ConsumptionEntry {
  const ConsumptionEntry({
    required this.id,
    required this.cycle,
    required this.kind,
    this.value,
    this.unit,
    this.mode,
    this.cycleNote,
    this.conditions,
    this.provenance = Provenance.none,
  });

  final String id;
  final String cycle;

  /// `electricity` (Wh/km) | `fuel` (L/100km).
  final String kind;
  final num? value;
  final String? unit;
  final String? mode;
  final String? cycleNote;
  final String? conditions;
  final Provenance provenance;

  static ConsumptionEntry? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final cycle = j.stringOrNull('cycle');
    if (cycle == null) return null;
    return ConsumptionEntry(
      id: j.stringOrNull('id') ?? cycle,
      cycle: cycle,
      kind: j.stringOrNull('kind') ?? 'electricity',
      value: j.doubleOrNull('value'),
      unit: j.stringOrNull('unit'),
      mode: j.stringOrNull('mode'),
      cycleNote: j.stringOrNull('cycleNote'),
      conditions: j.stringOrNull('conditions'),
      provenance: Provenance.fromJson(j),
    );
  }
}

@immutable
class Inlet {
  const Inlet({
    required this.id,
    required this.connectorCode,
    required this.connectorName,
    required this.currentType,
    this.maxPowerKw,
    this.notes,
    this.provenance = Provenance.none,
  });

  final String id;
  final String connectorCode;
  final String connectorName;

  /// `AC` | `DC`.
  final String currentType;
  final num? maxPowerKw;
  final String? notes;
  final Provenance provenance;

  static Inlet? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final ct = j.objectOrNull('connectorType');
    final code = ct?.stringOrNull('code');
    if (code == null) return null;
    return Inlet(
      id: j.stringOrNull('id') ?? code,
      connectorCode: code,
      connectorName: ct?.stringOrNull('name') ?? code,
      currentType: j.stringOrNull('currentType') ?? '',
      maxPowerKw: j.doubleOrNull('maxPowerKw'),
      notes: j.stringOrNull('notes'),
      provenance: Provenance.fromJson(j),
    );
  }
}

@immutable
class ChargingTime {
  const ChargingTime({
    required this.id,
    required this.currentType,
    required this.fromSoc,
    required this.toSoc,
    this.durationMinutes,
    this.chargerPowerKw,
    this.peakPowerKw,
    this.averagePowerKw,
    this.onboardChargerLimitKw,
    this.conditions,
    this.provenance = Provenance.none,
  });

  final String id;
  final String currentType;
  final int fromSoc;
  final int toSoc;
  final num? durationMinutes;
  final num? chargerPowerKw;
  final num? peakPowerKw;
  final num? averagePowerKw;
  final num? onboardChargerLimitKw;
  final String? conditions;
  final Provenance provenance;

  static ChargingTime? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final from = j.intOrNull('fromSoc');
    final to = j.intOrNull('toSoc');
    if (from == null || to == null) return null;
    return ChargingTime(
      id: j.stringOrNull('id') ?? '$from-$to',
      currentType: j.stringOrNull('currentType') ?? '',
      fromSoc: from,
      toSoc: to,
      durationMinutes: j.doubleOrNull('durationMinutes'),
      chargerPowerKw: j.doubleOrNull('chargerPowerKw'),
      peakPowerKw: j.doubleOrNull('peakPowerKw'),
      averagePowerKw: j.doubleOrNull('averagePowerKw'),
      onboardChargerLimitKw: j.doubleOrNull('onboardChargerLimitKw'),
      conditions: j.stringOrNull('conditions'),
      provenance: Provenance.fromJson(j),
    );
  }
}

@immutable
class CurvePoint {
  const CurvePoint(this.socPercent, this.powerKw);

  final double socPercent;
  final double powerKw;
}

@immutable
class ChargingCurve {
  const ChargingCurve({
    required this.id,
    required this.currentType,
    required this.points,
    this.label,
    this.chargerMaxPowerKw,
    this.batteryTempC,
    this.preconditioned,
    this.conditions,
    this.peakPowerKw,
    this.provenance = Provenance.none,
  });

  final String id;
  final String currentType;

  /// Sorted by SoC.
  final List<CurvePoint> points;
  final String? label;
  final num? chargerMaxPowerKw;
  final num? batteryTempC;
  final bool? preconditioned;
  final String? conditions;
  final num? peakPowerKw;
  final Provenance provenance;

  static ChargingCurve? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('id');
    if (id == null) return null;
    final points = <CurvePoint>[];
    for (final p in j['points'] is List ? j['points'] as List : const []) {
      if (p is! Map) continue;
      final pj = asJsonObject(p);
      final soc = pj.doubleOrNull('socPercent');
      final kw = pj.doubleOrNull('powerKw');
      if (soc == null || kw == null || soc < 0 || soc > 100 || kw < 0) continue;
      points.add(CurvePoint(soc, kw));
    }
    points.sort((a, b) => a.socPercent.compareTo(b.socPercent));
    return ChargingCurve(
      id: id,
      currentType: j.stringOrNull('currentType') ?? 'DC',
      points: points,
      label: j.stringOrNull('label'),
      chargerMaxPowerKw: j.doubleOrNull('chargerMaxPowerKw'),
      batteryTempC: j.doubleOrNull('batteryTempC'),
      preconditioned: j.boolOrNull('preconditioned'),
      conditions: j.stringOrNull('conditions'),
      peakPowerKw: j.doubleOrNull('peakPowerKw'),
      provenance: Provenance.fromJson(j),
    );
  }
}

@immutable
class SheetKeyFacts {
  const SheetKeyFacts({
    this.usableBatteryKwh,
    this.grossBatteryKwh,
    this.powerKw,
    this.powerHp,
    this.torqueNm,
    this.accel0100S,
    this.acMaxKw,
    this.dcPeakKw,
    this.electricRanges = const [],
  });

  final DataPoint? usableBatteryKwh;
  final DataPoint? grossBatteryKwh;
  final DataPoint? powerKw;
  final DataPoint? powerHp;
  final DataPoint? torqueNm;
  final DataPoint? accel0100S;
  final DataPoint? acMaxKw;
  final DataPoint? dcPeakKw;
  final List<RangeEntry> electricRanges;

  static SheetKeyFacts fromJson(Map<String, dynamic>? j) {
    if (j == null) return const SheetKeyFacts();
    return SheetKeyFacts(
      usableBatteryKwh: DataPoint.tryParse(j['usableBatteryKwh']),
      grossBatteryKwh: DataPoint.tryParse(j['grossBatteryKwh']),
      powerKw: DataPoint.tryParse(j['powerKw']),
      powerHp: DataPoint.tryParse(j['powerHp']),
      torqueNm: DataPoint.tryParse(j['torqueNm']),
      accel0100S: DataPoint.tryParse(j['accel0100S']),
      acMaxKw: DataPoint.tryParse(j['acMaxKw']),
      dcPeakKw: DataPoint.tryParse(j['dcPeakKw']),
      electricRanges: j['electricRanges'] is List
          ? [for (final r in j['electricRanges'] as List) ?RangeEntry.tryParse(r)]
          : const [],
    );
  }
}

@immutable
class VariantSheet {
  const VariantSheet({
    required this.id,
    required this.slug,
    required this.name,
    required this.title,
    required this.modelYear,
    required this.powertrainType,
    required this.brand,
    required this.modelId,
    required this.modelSlug,
    required this.modelName,
    required this.market,
    this.trimCode,
    this.bodyType,
    this.driveType,
    this.seats,
    this.doors,
    this.generationName,
    this.availableMarkets = const [],
    this.images = const [],
    this.currentPrice,
    this.priceHistory = const [],
    this.keyFacts = const SheetKeyFacts(),
    this.specGroups = const [],
    this.ranges = const [],
    this.consumption = const [],
    this.inlets = const [],
    this.chargingTimes = const [],
    this.chargingCurves = const [],
    this.tours = const ToursInfo(),
    this.relatedArticles = const [],
    this.competitors = const [],
    this.sources = const [],
    this.isDemo = false,
  });

  final String id;
  final String slug;
  final String name;

  /// "Brand Model 2025 Trim".
  final String title;
  final int modelYear;
  final String powertrainType;
  final BrandRef brand;
  final String modelId;
  final String modelSlug;
  final String modelName;
  final SheetMarket market;
  final String? trimCode;
  final String? bodyType;
  final String? driveType;
  final int? seats;
  final int? doors;
  final String? generationName;
  final List<MarketAvailability> availableMarkets;
  final List<CatalogImage> images;
  final CarPrice? currentPrice;

  /// Newest effective date first.
  final List<CarPrice> priceHistory;
  final SheetKeyFacts keyFacts;
  final List<SpecGroupData> specGroups;
  final List<RangeEntry> ranges;
  final List<ConsumptionEntry> consumption;
  final List<Inlet> inlets;
  final List<ChargingTime> chargingTimes;
  final List<ChargingCurve> chargingCurves;
  final ToursInfo tours;
  final List<RelatedArticle> relatedArticles;
  final List<CarSummary> competitors;
  final List<CatalogSource> sources;
  final bool isDemo;

  bool get isPlugIn => powertrainType.toUpperCase() != 'HEV';

  bool get hasChargingData => inlets.isNotEmpty || chargingTimes.isNotEmpty || chargingCurves.isNotEmpty;

  static VariantSheet fromData(Object? data) {
    final j = asJsonObject(data, 'variant');
    final id = j.stringOrNull('id');
    final slug = j.stringOrNull('slug');
    final brand = BrandRef.tryParse(j['brand']);
    final model = j.objectOrNull('model');
    final year = j.intOrNull('modelYear');
    if (id == null || slug == null || brand == null || model == null || year == null) {
      throw const FormatException('Invalid variant sheet');
    }
    List<T> list<T>(Object? raw, T? Function(Object?) parse) => raw is List ? [for (final e in raw) ?parse(e)] : <T>[];
    final price = j.objectOrNull('price');
    final charging = j.objectOrNull('charging');
    final name = j.stringOrNull('name') ?? slug;
    return VariantSheet(
      id: id,
      slug: slug,
      name: name,
      title: j.stringOrNull('title') ?? '${brand.name} ${model.stringOrNull('name') ?? ''} $year $name',
      modelYear: year,
      powertrainType: j.stringOrNull('powertrainType') ?? '',
      brand: brand,
      modelId: model.stringOrNull('id') ?? '',
      modelSlug: model.stringOrNull('slug') ?? '',
      modelName: model.stringOrNull('name') ?? '',
      market: SheetMarket.fromJson(j.objectOrNull('market')),
      trimCode: j.stringOrNull('trimCode'),
      bodyType: j.stringOrNull('bodyType'),
      driveType: j.stringOrNull('driveType'),
      seats: j.intOrNull('seats'),
      doors: j.intOrNull('doors'),
      generationName: j.objectOrNull('generation')?.stringOrNull('name'),
      availableMarkets: list(j['availableMarkets'], MarketAvailability.tryParse),
      images: list(j['images'], CatalogImage.tryParse),
      currentPrice: CarPrice.tryParse(price?['current']),
      priceHistory: list(price?['history'], CarPrice.tryParse),
      keyFacts: SheetKeyFacts.fromJson(j.objectOrNull('keyFacts')),
      specGroups: list(j['specGroups'], SpecGroupData.tryParse),
      ranges: list(j['ranges'], RangeEntry.tryParse),
      consumption: list(j['consumption'], ConsumptionEntry.tryParse),
      inlets: list(charging?['inlets'], Inlet.tryParse),
      chargingTimes: list(charging?['times'], ChargingTime.tryParse),
      chargingCurves: list(charging?['curves'], ChargingCurve.tryParse),
      tours: ToursInfo.tryParse(j['tours']),
      relatedArticles: list(j['relatedArticles'], RelatedArticle.tryParse),
      competitors: list(j['competitors'], CarSummary.tryParse),
      sources: list(j['sources'], CatalogSource.tryParse),
      isDemo: j.boolOr('isDemo', false),
    );
  }
}

/// Owner-review summary of a trim (`GET /community/reviews/summary`).
@immutable
class ReviewsSummary {
  const ReviewsSummary({
    required this.count,
    this.average,
    this.distribution = const {},
    this.verifiedOwnerCount = 0,
    this.dimensions = const [],
  });

  final int count;

  /// null when nothing is rated (never 0).
  final double? average;

  /// rating (1..5) → count.
  final Map<int, int> distribution;
  final int verifiedOwnerCount;
  final List<({String key, String label, double? average})> dimensions;

  static ReviewsSummary fromData(Object? data) {
    final j = asJsonObject(data, 'summary');
    final dist = <int, int>{};
    for (final d in j['distribution'] is List ? j['distribution'] as List : const []) {
      if (d is! Map) continue;
      final dj = asJsonObject(d);
      final r = dj.intOrNull('rating');
      final c = dj.intOrNull('count');
      if (r != null && c != null) dist[r] = c;
    }
    final dims = <({String key, String label, double? average})>[];
    for (final d in j['dimensions'] is List ? j['dimensions'] as List : const []) {
      if (d is! Map) continue;
      final dj = asJsonObject(d);
      final key = dj.stringOrNull('dimension');
      if (key == null) continue;
      dims.add((key: key, label: dj.stringOrNull('label') ?? key, average: dj.doubleOrNull('average')));
    }
    return ReviewsSummary(
      count: j.intOrNull('count') ?? 0,
      average: j.doubleOrNull('average'),
      distribution: dist,
      verifiedOwnerCount: j.intOrNull('verifiedOwnerCount') ?? 0,
      dimensions: dims,
    );
  }
}

/// A public owner review, trimmed to what the car page previews.
@immutable
class ReviewPreview {
  const ReviewPreview({
    required this.id,
    required this.rating,
    required this.body,
    this.title,
    this.authorName,
    this.verifiedOwner = false,
    this.verifiedOwnerLabel,
    this.createdAt,
  });

  final String id;
  final int rating;
  final String body;
  final String? title;
  final String? authorName;
  final bool verifiedOwner;
  final String? verifiedOwnerLabel;
  final DateTime? createdAt;

  static ReviewPreview? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('id');
    final rating = j.intOrNull('rating');
    final body = j.stringOrNull('body');
    if (id == null || rating == null || body == null) return null;
    return ReviewPreview(
      id: id,
      rating: rating,
      body: body,
      title: j.stringOrNull('title'),
      authorName: j.objectOrNull('author')?.stringOrNull('displayName'),
      verifiedOwner: j.boolOr('verifiedOwner', false),
      verifiedOwnerLabel: j.stringOrNull('verifiedOwnerLabel'),
      createdAt: j.dateTimeOrNull('createdAt'),
    );
  }
}
