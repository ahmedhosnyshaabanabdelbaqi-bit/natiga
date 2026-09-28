import 'package:flutter/foundation.dart';

import '../../../core/json/json_readers.dart';

/// Models of the comparisons API (`docs/decisions/backend-comparisons.md` §5).
///
/// Parsing is hand-written and defensive: a missing value stays `null` (the
/// UI shows "غير متوفر / Not available", never 0) and malformed list items
/// are skipped instead of failing the whole comparison.

/// Why a row can (not) decide a winner (backend `comparability`).
enum Comparability {
  comparable('comparable'),
  notComparableCycles('not_comparable_cycles'),
  notComparableSocWindow('not_comparable_soc_window'),
  notComparableConditions('not_comparable_conditions'),
  missingData('missing_data'),
  differentCurrency('different_currency'),
  notApplicable('not_applicable'),

  /// A value this app version does not know (never treated as comparable).
  unknown('unknown');

  const Comparability(this.apiValue);

  final String apiValue;

  static Comparability fromApi(String? v) =>
      values.firstWhere((c) => c.apiValue == v && c != unknown, orElse: () => unknown);
}

/// Row outcome. A winner exists only when the API says so.
enum Outcome {
  winner('winner'),
  tie('tie'),
  noWinner('no_winner');

  const Outcome(this.apiValue);

  final String apiValue;

  /// Unknown values fall back to "no winner" (never invent a winner).
  static Outcome fromApi(String? v) => values.firstWhere((o) => o.apiValue == v, orElse: () => noWinner);
}

enum ValueStatus {
  present('present'),
  missing('missing'),
  notApplicable('not_applicable');

  const ValueStatus(this.apiValue);

  final String apiValue;

  /// Unknown statuses are treated as missing (never shown as a number).
  static ValueStatus fromApi(String? v) => values.firstWhere((s) => s.apiValue == v, orElse: () => missing);
}

enum BetterDirection {
  higher,
  lower,
  none;

  static BetterDirection fromApi(String? v) => switch (v) {
    'higher' => higher,
    'lower' => lower,
    _ => none,
  };
}

enum MetricKind {
  number,
  text,
  boolean,
  money;

  static MetricKind fromApi(String? v) => switch (v) {
    'number' => number,
    'boolean' => boolean,
    'money' => money,
    _ => text,
  };
}

/// Source of a value (`SourceSummaryDto`).
@immutable
class SourceRef {
  const SourceRef({
    required this.id,
    required this.type,
    required this.title,
    this.publisher,
    this.url,
    this.documentDate,
    this.accessedAt,
    this.marketCode,
  });

  final String id;
  final String type;
  final String title;
  final String? publisher;
  final String? url;
  final String? documentDate;
  final DateTime? accessedAt;
  final String? marketCode;

  /// Publisher when known, otherwise the source title.
  String get displayName {
    final p = publisher?.trim();
    return p == null || p.isEmpty ? title : p;
  }

  static SourceRef? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final title = j.stringOrNull('title');
    if (title == null) return null;
    return SourceRef(
      id: j.stringOrNull('id') ?? '',
      type: j.stringOrNull('type') ?? 'other',
      title: title,
      publisher: j.stringOrNull('publisher'),
      url: j.stringOrNull('url'),
      documentDate: j.stringOrNull('documentDate'),
      accessedAt: j.dateTimeOrNull('accessedAt'),
      marketCode: j.stringOrNull('marketCode'),
    );
  }
}

/// Measuring basis of a value (only the relevant keys are set).
@immutable
class MetricCondition {
  const MetricCondition({
    this.cycle,
    this.cycleNote,
    this.rangeType,
    this.mode,
    this.currentType,
    this.fromSoc,
    this.toSoc,
    this.socWindow,
    this.chargerPowerKw,
    this.wheelSizeInch,
    this.conditions,
    this.priceType,
    this.priceTypeLabel,
    this.currency,
    this.effectiveFrom,
    this.inMarketCurrency,
  });

  final String? cycle;
  final String? cycleNote;
  final String? rangeType;
  final String? mode;
  final String? currentType;
  final int? fromSoc;
  final int? toSoc;
  final String? socWindow;
  final double? chargerPowerKw;
  final double? wheelSizeInch;
  final String? conditions;
  final String? priceType;
  final String? priceTypeLabel;
  final String? currency;
  final String? effectiveFrom;
  final bool? inMarketCurrency;

  bool get hasSocWindow => socWindow != null || (fromSoc != null && toSoc != null);

  static MetricCondition? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    return MetricCondition(
      cycle: j.stringOrNull('cycle'),
      cycleNote: j.stringOrNull('cycleNote'),
      rangeType: j.stringOrNull('rangeType'),
      mode: j.stringOrNull('mode'),
      currentType: j.stringOrNull('currentType'),
      fromSoc: j.intOrNull('fromSoc'),
      toSoc: j.intOrNull('toSoc'),
      socWindow: j.stringOrNull('socWindow'),
      chargerPowerKw: j.doubleOrNull('chargerPowerKw'),
      wheelSizeInch: j.doubleOrNull('wheelSizeInch'),
      conditions: j.stringOrNull('conditions'),
      priceType: j.stringOrNull('priceType'),
      priceTypeLabel: j.stringOrNull('priceTypeLabel'),
      currency: j.stringOrNull('currency'),
      effectiveFrom: j.stringOrNull('effectiveFrom'),
      inMarketCurrency: j.boolOrNull('inMarketCurrency'),
    );
  }
}

/// Another value of the same car for a row (other cycle, window, wheel size…).
@immutable
class AlternativeValue {
  const AlternativeValue({
    required this.value,
    this.unit,
    this.originalValue,
    this.originalUnit,
    this.condition,
    this.reliability,
  });

  final Object value;
  final String? unit;
  final String? originalValue;
  final String? originalUnit;
  final MetricCondition? condition;
  final String? reliability;

  static AlternativeValue? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final v = j['value'];
    if (v is! num && v is! String && v is! bool) return null;
    return AlternativeValue(
      value: v as Object,
      unit: j.stringOrNull('unit'),
      originalValue: j.stringOrNull('originalValue'),
      originalUnit: j.stringOrNull('originalUnit'),
      condition: MetricCondition.tryParse(j['condition']),
      reliability: j.stringOrNull('reliability'),
    );
  }
}

/// One car's value in a row.
@immutable
class MetricValue {
  const MetricValue({
    required this.carKey,
    required this.status,
    this.value,
    this.valueLabel,
    this.unit,
    this.originalValue,
    this.originalUnit,
    this.condition,
    this.reliability,
    this.verifiedAt,
    this.source,
    this.derived = false,
    this.note,
    this.alternatives = const [],
  });

  final String carKey;
  final ValueStatus status;

  /// number / String (text or money decimal) / bool; null unless present.
  final Object? value;
  final String? valueLabel;
  final String? unit;
  final String? originalValue;
  final String? originalUnit;
  final MetricCondition? condition;
  final String? reliability;
  final DateTime? verifiedAt;
  final SourceRef? source;
  final bool derived;
  final String? note;
  final List<AlternativeValue> alternatives;

  /// True only for a present, non-null value.
  bool get isPresent => status == ValueStatus.present && value != null;

  static MetricValue? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final carKey = j.stringOrNull('carKey');
    if (carKey == null) return null;
    var status = ValueStatus.fromApi(j.stringOrNull('status'));
    final raw = j['value'];
    final value = raw is num || raw is String || raw is bool ? raw : null;
    // A "present" value without a value is shown as not available.
    if (status == ValueStatus.present && value == null) status = ValueStatus.missing;
    return MetricValue(
      carKey: carKey,
      status: status,
      value: status == ValueStatus.present ? value : null,
      valueLabel: j.stringOrNull('valueLabel'),
      unit: j.stringOrNull('unit'),
      originalValue: j.stringOrNull('originalValue'),
      originalUnit: j.stringOrNull('originalUnit'),
      condition: MetricCondition.tryParse(j['condition']),
      reliability: j.stringOrNull('reliability'),
      verifiedAt: j.dateTimeOrNull('verifiedAt'),
      source: SourceRef.tryParse(j['source']),
      derived: j.boolOr('derived', false),
      note: j.stringOrNull('note'),
      alternatives: [
        for (final a in (j['alternatives'] is List ? j['alternatives'] as List : const <Object?>[]))
          ?AlternativeValue.tryParse(a),
      ],
    );
  }
}

/// One comparison row.
@immutable
class Metric {
  const Metric({
    required this.key,
    required this.group,
    required this.label,
    this.description,
    required this.kind,
    this.unit,
    required this.betterDirection,
    required this.comparability,
    this.comparabilityNote,
    this.basis,
    required this.outcome,
    this.winners = const [],
    required this.isDifferent,
    required this.isKey,
    required this.values,
  });

  final String key;
  final String group;
  final String label;
  final String? description;
  final MetricKind kind;
  final String? unit;
  final BetterDirection betterDirection;
  final Comparability comparability;
  final String? comparabilityNote;
  final MetricCondition? basis;
  final Outcome outcome;

  /// Car keys of the best value(s); only meaningful when [outcome] is winner.
  final List<String> winners;
  final bool isDifferent;
  final bool isKey;
  final List<MetricValue> values;

  /// Winner keys the UI may mark: only when the API declared a winner on a
  /// comparable row and the car's value is present (defence in depth — the
  /// app never derives a winner itself).
  Set<String> get markedWinners {
    if (outcome != Outcome.winner || comparability != Comparability.comparable) return const {};
    final present = {
      for (final v in values)
        if (v.isPresent) v.carKey,
    };
    return {
      for (final w in winners)
        if (present.contains(w)) w,
    };
  }

  MetricValue? valueFor(String carKey) {
    for (final v in values) {
      if (v.carKey == carKey) return v;
    }
    return null;
  }

  static Metric? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final key = j.stringOrNull('key');
    final label = j.stringOrNull('label');
    if (key == null || label == null) return null;
    return Metric(
      key: key,
      group: j.stringOrNull('group') ?? '',
      label: label,
      description: j.stringOrNull('description'),
      kind: MetricKind.fromApi(j.stringOrNull('kind')),
      unit: j.stringOrNull('unit'),
      betterDirection: BetterDirection.fromApi(j.stringOrNull('betterDirection')),
      comparability: Comparability.fromApi(j.stringOrNull('comparability')),
      comparabilityNote: j.stringOrNull('comparabilityNote'),
      basis: MetricCondition.tryParse(j['basis']),
      outcome: Outcome.fromApi(j.stringOrNull('outcome')),
      winners: j.stringList('winners'),
      isDifferent: j.boolOr('isDifferent', true),
      isKey: j.boolOr('isKey', false),
      values: j.objectList('values', (v) => MetricValue.tryParse(v)).nonNulls.toList(growable: false),
    );
  }
}

@immutable
class MetricGroup {
  const MetricGroup({required this.key, required this.label, required this.metrics});

  final String key;
  final String label;
  final List<Metric> metrics;

  static MetricGroup? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final key = j.stringOrNull('key');
    if (key == null) return null;
    return MetricGroup(
      key: key,
      label: j.stringOrNull('label') ?? key,
      metrics: j.objectList('metrics', (m) => Metric.tryParse(m)).nonNulls.toList(growable: false),
    );
  }
}

/// `{amount: "1500000.00", currency: "EGP"}`.
@immutable
class Money {
  const Money(this.amount, this.currency);

  final String amount;
  final String currency;

  static Money? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final a = j.stringOrNull('amount');
    final c = j.stringOrNull('currency');
    if (a == null || c == null) return null;
    return Money(a, c);
  }
}

/// Current price of a car in its market (`PriceDto`).
@immutable
class CarPriceInfo {
  const CarPriceInfo({
    required this.amount,
    required this.priceType,
    this.priceTypeLabel,
    this.effectiveFrom,
    this.inMarketCurrency = true,
    this.reliability,
    this.source,
  });

  final Money amount;
  final String priceType;
  final String? priceTypeLabel;
  final String? effectiveFrom;

  /// false = foreign-currency estimate (never an official local price).
  final bool inMarketCurrency;
  final String? reliability;
  final SourceRef? source;

  static CarPriceInfo? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final amount = Money.tryParse(j['amount']);
    if (amount == null) return null;
    return CarPriceInfo(
      amount: amount,
      priceType: j.stringOrNull('priceType') ?? 'market_estimate',
      priceTypeLabel: j.stringOrNull('priceTypeLabel'),
      effectiveFrom: j.stringOrNull('effectiveFrom'),
      inMarketCurrency: j.boolOr('inMarketCurrency', false),
      reliability: j.stringOrNull('reliability'),
      source: SourceRef.tryParse(j['source']),
    );
  }
}

@immutable
class CarMarketInfo {
  const CarMarketInfo({
    required this.code,
    required this.name,
    this.currencyCode,
    this.availability,
    this.offered = true,
    this.localName,
  });

  final String code;
  final String name;
  final String? currencyCode;
  final String? availability;
  final bool offered;
  final String? localName;

  static CarMarketInfo? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final code = j.stringOrNull('code');
    if (code == null) return null;
    return CarMarketInfo(
      code: code,
      name: j.stringOrNull('name') ?? code,
      currencyCode: j.stringOrNull('currencyCode'),
      availability: j.stringOrNull('availability'),
      offered: j.boolOr('offered', true),
      localName: j.stringOrNull('localName'),
    );
  }
}

/// A licensed image (`ImageDto`); only https URLs are ever loaded by the kit.
@immutable
class CompareImage {
  const CompareImage({required this.url, this.alt, this.credit, this.isDemo = false});

  final String url;
  final String? alt;
  final String? credit;
  final bool isDemo;

  static CompareImage? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final url = j.stringOrNull('url');
    if (url == null || url.isEmpty) return null;
    return CompareImage(
      url: url,
      alt: j.stringOrNull('alt'),
      credit: j.stringOrNull('credit'),
      isDemo: j.boolOr('isDemo', false),
    );
  }
}

/// One compared car: trim × model year × market.
@immutable
class ComparisonCar {
  const ComparisonCar({
    required this.key,
    required this.position,
    required this.variantId,
    this.variantSlug,
    this.modelYearId,
    required this.modelYear,
    required this.title,
    required this.name,
    this.brandName,
    this.modelName,
    this.modelSlug,
    required this.powertrainType,
    this.bodyType,
    this.driveType,
    this.seats,
    required this.market,
    this.image,
    this.price,
    this.hasTour = false,
    this.isDemo = false,
  });

  /// `"<variantId>@<MARKET>"`.
  final String key;
  final int position;
  final String variantId;
  final String? variantSlug;
  final String? modelYearId;
  final int? modelYear;
  final String title;

  /// Trim name.
  final String name;
  final String? brandName;
  final String? modelName;
  final String? modelSlug;
  final String powertrainType;
  final String? bodyType;
  final String? driveType;
  final int? seats;
  final CarMarketInfo market;
  final CompareImage? image;
  final CarPriceInfo? price;
  final bool hasTour;
  final bool isDemo;

  /// "Demo EV One · Standard" (brand omitted to keep columns readable).
  String get shortName {
    final m = modelName?.trim();
    if (m == null || m.isEmpty) return name;
    return '$m · $name';
  }

  static ComparisonCar? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final key = j.stringOrNull('key');
    final variantId = j.stringOrNull('variantId');
    final market = CarMarketInfo.tryParse(j['market']);
    if (key == null || variantId == null || market == null) return null;
    final brand = j.objectOrNull('brand');
    final model = j.objectOrNull('model');
    return ComparisonCar(
      key: key,
      position: j.intOrNull('position') ?? 0,
      variantId: variantId,
      variantSlug: j.stringOrNull('variantSlug'),
      modelYearId: j.stringOrNull('modelYearId'),
      modelYear: j.intOrNull('modelYear'),
      title: j.stringOrNull('title') ?? j.stringOrNull('name') ?? variantId,
      name: j.stringOrNull('name') ?? j.stringOrNull('title') ?? variantId,
      brandName: brand?.stringOrNull('name'),
      modelName: model?.stringOrNull('name'),
      modelSlug: model?.stringOrNull('slug'),
      powertrainType: j.stringOrNull('powertrainType') ?? '',
      bodyType: j.stringOrNull('bodyType'),
      driveType: j.stringOrNull('driveType'),
      seats: j.intOrNull('seats'),
      market: market,
      image: CompareImage.tryParse(j['image']),
      price: CarPriceInfo.tryParse(j['price']),
      hasTour: j.boolOr('hasTour', false),
      isDemo: j.boolOr('isDemo', false),
    );
  }
}

@immutable
class CarWins {
  const CarWins(this.carKey, this.wins);

  final String carKey;
  final int wins;
}

@immutable
class ComparisonSummary {
  const ComparisonSummary({
    this.metricsTotal,
    this.comparableMetrics,
    this.decidedMetrics,
    this.notComparableMetrics,
    this.missingDataMetrics,
    this.notApplicableMetrics,
    this.winsByCar = const [],
    this.note,
  });

  final int? metricsTotal;
  final int? comparableMetrics;
  final int? decidedMetrics;
  final int? notComparableMetrics;
  final int? missingDataMetrics;
  final int? notApplicableMetrics;

  /// Rows won per car — NOT an overall verdict (see [note]).
  final List<CarWins> winsByCar;
  final String? note;

  static ComparisonSummary parse(Map<String, dynamic>? j) {
    if (j == null) return const ComparisonSummary();
    return ComparisonSummary(
      metricsTotal: j.intOrNull('metricsTotal'),
      comparableMetrics: j.intOrNull('comparableMetrics'),
      decidedMetrics: j.intOrNull('decidedMetrics'),
      notComparableMetrics: j.intOrNull('notComparableMetrics'),
      missingDataMetrics: j.intOrNull('missingDataMetrics'),
      notApplicableMetrics: j.intOrNull('notApplicableMetrics'),
      winsByCar: [
        for (final w in j.objectList('winsByCar', (w) => w))
          if (w.stringOrNull('carKey') != null) CarWins(w.stringOrNull('carKey')!, w.intOrNull('wins') ?? 0),
      ],
      note: j.stringOrNull('note'),
    );
  }
}

@immutable
class ComparisonWarning {
  const ComparisonWarning(this.code, this.message);

  final String code;
  final String message;
}

@immutable
class LegendEntry {
  const LegendEntry(this.status, this.label);

  final Comparability status;
  final String label;
}

/// `ComparisonData` — always the full (detailed) result; the app applies
/// the summary / differences-only views locally with [visibleGroups].
@immutable
class ComparisonData {
  const ComparisonData({
    required this.view,
    required this.differencesOnly,
    required this.marketCode,
    required this.cars,
    required this.groups,
    required this.summary,
    this.warnings = const [],
    this.legend = const [],
    this.sponsored = false,
    this.disclosure,
    this.notAvailableLabel,
    this.generatedAt,
  });

  final String view;
  final bool differencesOnly;
  final String? marketCode;
  final List<ComparisonCar> cars;
  final List<MetricGroup> groups;
  final ComparisonSummary summary;
  final List<ComparisonWarning> warnings;
  final List<LegendEntry> legend;
  final bool sponsored;
  final String? disclosure;
  final String? notAvailableLabel;
  final DateTime? generatedAt;

  bool get hasDemo => cars.any((c) => c.isDemo);

  ComparisonCar? carByKey(String key) {
    for (final c in cars) {
      if (c.key == key) return c;
    }
    return null;
  }

  /// Rows shown for a view: `summary` keeps key rows, [differencesOnly]
  /// hides rows where every car shows the same value; empty groups drop out.
  List<MetricGroup> visibleGroups({required bool summary, required bool differencesOnly}) {
    return [
      for (final g in groups)
        if (_filter(g.metrics, summary, differencesOnly) case final metrics when metrics.isNotEmpty)
          MetricGroup(key: g.key, label: g.label, metrics: metrics),
    ];
  }

  static List<Metric> _filter(List<Metric> metrics, bool summary, bool differencesOnly) => [
    for (final m in metrics)
      if ((!summary || m.isKey) && (!differencesOnly || m.isDifferent)) m,
  ];

  static ComparisonData fromData(Object? data) {
    final j = asJsonObject(data, 'comparison result');
    final cars = j.objectList('cars', (c) => ComparisonCar.tryParse(c)).nonNulls.toList()
      ..sort((a, b) => a.position.compareTo(b.position));
    if (cars.isEmpty) throw const FormatException('A comparison result without cars');
    return ComparisonData(
      view: j.stringOrNull('view') ?? 'detailed',
      differencesOnly: j.boolOr('differencesOnly', false),
      marketCode: j.stringOrNull('marketCode'),
      cars: List.unmodifiable(cars),
      groups: j.objectList('groups', (g) => MetricGroup.tryParse(g)).nonNulls.toList(growable: false),
      summary: ComparisonSummary.parse(j.objectOrNull('summary')),
      warnings: [
        for (final w in j.objectList('warnings', (w) => w))
          if (w.stringOrNull('message') != null)
            ComparisonWarning(w.stringOrNull('code') ?? '', w.stringOrNull('message')!),
      ],
      legend: [
        for (final l in j.objectList('legend', (l) => l))
          if (l.stringOrNull('label') != null)
            LegendEntry(Comparability.fromApi(l.stringOrNull('status')), l.stringOrNull('label')!),
      ],
      // Anything but an explicit false is shown as a disclosure problem: the
      // API promises sponsored:false on every result.
      sponsored: j['sponsored'] != false,
      disclosure: j.stringOrNull('disclosure'),
      notAvailableLabel: j.stringOrNull('notAvailableLabel'),
      generatedAt: j.dateTimeOrNull('generatedAt'),
    );
  }
}

/// One item of a saved / shared comparison (`ComparisonDto.items[]`).
@immutable
class ComparisonItemView {
  const ComparisonItemView({
    required this.position,
    required this.variantId,
    required this.marketCode,
    required this.available,
    this.variantSlug,
    this.modelYear,
    this.modelSlug,
    this.title,
    this.powertrainType,
    this.availability,
    this.image,
    this.isDemo = false,
  });

  final int position;
  final String variantId;
  final String marketCode;
  final bool available;
  final String? variantSlug;
  final int? modelYear;
  final String? modelSlug;
  final String? title;
  final String? powertrainType;
  final String? availability;
  final CompareImage? image;
  final bool isDemo;

  static ComparisonItemView? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final variantId = j.stringOrNull('variantId');
    final market = j.stringOrNull('marketCode');
    if (variantId == null || market == null) return null;
    return ComparisonItemView(
      position: j.intOrNull('position') ?? 0,
      variantId: variantId,
      marketCode: market,
      available: j.boolOr('available', true),
      variantSlug: j.stringOrNull('variantSlug'),
      modelYear: j.intOrNull('modelYear'),
      modelSlug: j.stringOrNull('modelSlug'),
      title: j.stringOrNull('title'),
      powertrainType: j.stringOrNull('powertrainType'),
      availability: j.stringOrNull('availability'),
      image: CompareImage.tryParse(j['image']),
      isDemo: j.boolOr('isDemo', false),
    );
  }
}

/// Saved / shared / curated comparison (`ComparisonDto` + `CreatedComparisonDto`).
@immutable
class SavedComparison {
  const SavedComparison({
    required this.id,
    required this.shareId,
    required this.shareUrl,
    required this.kind,
    required this.isMine,
    this.title,
    required this.displayTitle,
    this.marketCode,
    required this.items,
    this.createdAt,
    this.updatedAt,
    this.isDemo = false,
    this.saved,
    this.reused,
  });

  final String id;
  final String shareId;

  /// `https://evcar.news/compare/<shareId>`.
  final String shareUrl;

  /// saved | shared | curated.
  final String kind;
  final bool isMine;
  final String? title;
  final String displayTitle;
  final String? marketCode;
  final List<ComparisonItemView> items;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final bool isDemo;

  /// Create response only: saved in the account (false = guest share link).
  final bool? saved;

  /// Create response only: an identical comparison was reused.
  final bool? reused;

  bool get isCurated => kind == 'curated';

  static SavedComparison? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('id');
    final shareId = j.stringOrNull('shareId');
    if (id == null || shareId == null) return null;
    final items = j.objectList('items', (i) => ComparisonItemView.tryParse(i)).nonNulls.toList()
      ..sort((a, b) => a.position.compareTo(b.position));
    return SavedComparison(
      id: id,
      shareId: shareId,
      shareUrl: j.stringOrNull('shareUrl') ?? '',
      kind: j.stringOrNull('kind') ?? 'shared',
      isMine: j.boolOr('isMine', false),
      title: j.stringOrNull('title'),
      displayTitle: j.stringOrNull('displayTitle') ?? j.stringOrNull('title') ?? '',
      marketCode: j.stringOrNull('marketCode'),
      items: List.unmodifiable(items),
      createdAt: j.dateTimeOrNull('createdAt'),
      updatedAt: j.dateTimeOrNull('updatedAt'),
      isDemo: j.boolOr('isDemo', false),
      saved: j.boolOrNull('saved'),
      reused: j.boolOrNull('reused'),
    );
  }

  static SavedComparison fromData(Object? data) {
    final c = tryParse(data);
    if (c == null) throw const FormatException('Invalid comparison');
    return c;
  }
}

/// `GET /comparisons/s/:shareId` (and `/me/comparisons/:id`).
@immutable
class SharedComparison {
  const SharedComparison({required this.comparison, this.result, this.unavailableItems = const []});

  final SavedComparison comparison;

  /// null when fewer than 2 of its trims are still published.
  final ComparisonData? result;
  final List<ComparisonItemView> unavailableItems;

  static SharedComparison fromData(Object? data) {
    final j = asJsonObject(data, 'shared comparison');
    final result = j['result'];
    return SharedComparison(
      comparison: SavedComparison.fromData(j['comparison']),
      result: result is Map ? ComparisonData.fromData(result) : null,
      unavailableItems: j.objectList('unavailableItems', (i) => ComparisonItemView.tryParse(i)).nonNulls.toList(),
    );
  }
}
