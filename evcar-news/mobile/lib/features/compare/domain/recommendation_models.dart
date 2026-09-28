import 'package:flutter/foundation.dart';

import '../../../core/json/json_readers.dart';
import 'comparison_models.dart';

/// Factors of the recommendation engine, in the API's order.
enum RecFactor {
  price('price'),
  range('range'),
  dcCharging('dcCharging'),
  acCharging('acCharging'),
  efficiency('efficiency'),
  space('space'),
  performance('performance');

  const RecFactor(this.apiValue);

  final String apiValue;

  static RecFactor? fromApi(String? v) {
    for (final f in values) {
      if (f.apiValue == v) return f;
    }
    return null;
  }
}

/// Wizard answers → `POST /recommendations` body. Nothing is stored.
@immutable
class RecommendationInput {
  const RecommendationInput({
    required this.budget,
    required this.dailyKm,
    required this.longTripsPerMonth,
    required this.homeCharging,
    required this.seatsNeeded,
    this.bodyTypes = const {},
    this.powertrains = const {'BEV', 'PHEV', 'EREV'},
    this.weights,
    this.market,
  });

  /// In the market currency (never converted).
  final double budget;
  final double dailyKm;
  final int longTripsPerMonth;
  final bool homeCharging;
  final int seatsNeeded;

  /// Empty = any body type.
  final Set<String> bodyTypes;
  final Set<String> powertrains;

  /// 0–10 per factor; null = the server's usage-based defaults.
  final Map<RecFactor, double>? weights;
  final String? market;

  static const allPowertrains = ['BEV', 'PHEV', 'EREV', 'HEV'];
  static const defaultPowertrains = {'BEV', 'PHEV', 'EREV'};
  static const bodyTypeCodes = ['sedan', 'hatchback', 'suv', 'crossover', 'coupe', 'wagon', 'pickup', 'van', 'mpv'];

  /// True when at least one factor has a positive weight (the API refuses
  /// all-zero weights with `allZero`).
  bool get weightsValid => weights == null || weights!.values.any((w) => w > 0);

  Map<String, Object?> toJson() => {
    'market': ?market,
    'budget': double.parse(budget.toStringAsFixed(2)),
    'dailyKm': double.parse(dailyKm.toStringAsFixed(1)),
    'longTripsPerMonth': longTripsPerMonth,
    'homeCharging': homeCharging,
    'seatsNeeded': seatsNeeded,
    if (bodyTypes.isNotEmpty) 'bodyTypes': bodyTypes.toList()..sort(),
    'powertrains': powertrains.toList()..sort(),
    if (weights != null) 'weights': {for (final f in RecFactor.values) f.apiValue: weights![f] ?? 0},
  };

  RecommendationInput copyWith({
    double? budget,
    double? dailyKm,
    int? longTripsPerMonth,
    bool? homeCharging,
    int? seatsNeeded,
    Set<String>? bodyTypes,
    Set<String>? powertrains,
    Map<RecFactor, double>? Function()? weights,
    String? market,
  }) => RecommendationInput(
    budget: budget ?? this.budget,
    dailyKm: dailyKm ?? this.dailyKm,
    longTripsPerMonth: longTripsPerMonth ?? this.longTripsPerMonth,
    homeCharging: homeCharging ?? this.homeCharging,
    seatsNeeded: seatsNeeded ?? this.seatsNeeded,
    bodyTypes: bodyTypes ?? this.bodyTypes,
    powertrains: powertrains ?? this.powertrains,
    weights: weights != null ? weights() : this.weights,
    market: market ?? this.market,
  );

  @override
  bool operator ==(Object other) =>
      other is RecommendationInput &&
      other.budget == budget &&
      other.dailyKm == dailyKm &&
      other.longTripsPerMonth == longTripsPerMonth &&
      other.homeCharging == homeCharging &&
      other.seatsNeeded == seatsNeeded &&
      setEquals(other.bodyTypes, bodyTypes) &&
      setEquals(other.powertrains, powertrains) &&
      mapEquals(other.weights, weights) &&
      other.market == market;

  @override
  int get hashCode => Object.hash(
    budget,
    dailyKm,
    longTripsPerMonth,
    homeCharging,
    seatsNeeded,
    Object.hashAllUnordered(bodyTypes),
    Object.hashAllUnordered(powertrains),
    weights == null ? null : Object.hashAllUnordered(weights!.entries.map((e) => Object.hash(e.key, e.value))),
    market,
  );
}

@immutable
class FactorWeight {
  const FactorWeight({
    required this.factor,
    required this.label,
    required this.weight,
    this.raw,
    required this.source,
    this.betterDirection,
    this.description,
  });

  final String factor;
  final String label;

  /// Normalized 0..1 (sum = 1).
  final double weight;
  final double? raw;

  /// default | usage | user.
  final String source;
  final String? betterDirection;
  final String? description;
}

@immutable
class Contribution {
  const Contribution({
    required this.factor,
    required this.label,
    required this.weight,
    this.score,
    this.points,
    this.value,
    this.unit,
    this.basis,
  });

  final String factor;
  final String label;
  final double weight;

  /// Position score 0..1 among ranked cars.
  final double? score;
  final double? points;
  final double? value;
  final String? unit;
  final String? basis;
}

@immutable
class RecReason {
  const RecReason({required this.factor, required this.code, required this.sentiment, required this.text});

  final String factor;
  final String code;

  /// positive | neutral | negative.
  final String sentiment;
  final String text;
}

/// Car summary inside a recommendation.
@immutable
class RecCar {
  const RecCar({
    required this.key,
    required this.variantId,
    this.variantSlug,
    this.modelYear,
    required this.title,
    required this.name,
    this.brandName,
    this.modelName,
    this.modelSlug,
    required this.powertrainType,
    this.seats,
    this.image,
    this.price,
    this.isDemo = false,
  });

  final String key;
  final String variantId;
  final String? variantSlug;
  final int? modelYear;
  final String title;
  final String name;
  final String? brandName;
  final String? modelName;
  final String? modelSlug;
  final String powertrainType;
  final int? seats;
  final CompareImage? image;
  final CarPriceInfo? price;
  final bool isDemo;

  /// Market code from the `variantId@MARKET` key.
  String get marketCode {
    final i = key.lastIndexOf('@');
    return i < 0 ? '' : key.substring(i + 1);
  }

  static RecCar? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final key = j.stringOrNull('key');
    final variantId = j.stringOrNull('variantId');
    if (key == null || variantId == null) return null;
    return RecCar(
      key: key,
      variantId: variantId,
      variantSlug: j.stringOrNull('variantSlug'),
      modelYear: j.intOrNull('modelYear'),
      title: j.stringOrNull('title') ?? variantId,
      name: j.stringOrNull('name') ?? '',
      brandName: j.objectOrNull('brand')?.stringOrNull('name'),
      modelName: j.objectOrNull('model')?.stringOrNull('name'),
      modelSlug: j.objectOrNull('model')?.stringOrNull('slug'),
      powertrainType: j.stringOrNull('powertrainType') ?? '',
      seats: j.intOrNull('seats'),
      image: CompareImage.tryParse(j['image']),
      price: CarPriceInfo.tryParse(j['price']),
      isDemo: j.boolOr('isDemo', false),
    );
  }
}

@immutable
class RankedCar {
  const RankedCar({
    required this.rank,
    required this.car,
    this.score,
    this.contributions = const [],
    this.reasons = const [],
    this.sponsored = false,
  });

  final int rank;
  final RecCar car;

  /// 0–100; null when not provided (never shown as 0).
  final double? score;
  final List<Contribution> contributions;
  final List<RecReason> reasons;
  final bool sponsored;
}

@immutable
class MissingItem {
  const MissingItem({required this.factor, required this.label, required this.reason, this.detail});

  final String factor;
  final String label;

  /// missing | cycle_mismatch | …
  final String reason;
  final String? detail;
}

@immutable
class NotRankedCar {
  const NotRankedCar({required this.car, required this.reason, this.missingData = const [], this.explanation});

  final RecCar car;

  /// missing_data | not_comparable | price_not_available | seats_not_available.
  final String reason;
  final List<MissingItem> missingData;
  final String? explanation;
}

@immutable
class FactorAvailability {
  const FactorAvailability({
    required this.factor,
    required this.label,
    this.available,
    this.missing,
    this.notComparable,
    this.suggestion,
  });

  final RecFactor? factor;
  final String label;
  final int? available;
  final int? missing;
  final int? notComparable;
  final String? suggestion;
}

@immutable
class RecDecision {
  const RecDecision({required this.decisive, this.reason, this.message, this.topPickKey});

  final bool decisive;
  final String? reason;
  final String? message;
  final String? topPickKey;
}

@immutable
class ExcludedCounts {
  const ExcludedCounts({this.total, this.overBudget, this.seatsTooFew, this.bodyType, this.powertrain});

  final int? total;
  final int? overBudget;
  final int? seatsTooFew;
  final int? bodyType;
  final int? powertrain;
}

@immutable
class RecommendationResult {
  const RecommendationResult({
    required this.marketCode,
    this.marketName,
    this.currencyCode,
    this.budget,
    required this.weights,
    this.weightNotes = const [],
    this.rangeCycle,
    this.consumptionCycle,
    this.consumptionMode,
    required this.decision,
    this.ranked = const [],
    this.notRanked = const [],
    this.excluded = const ExcludedCounts(),
    this.factorAvailability = const [],
    this.candidatesConsidered,
    this.notes = const [],
    this.sponsored = false,
    this.disclosure,
    this.notAvailableLabel,
  });

  final String marketCode;
  final String? marketName;
  final String? currencyCode;
  final Money? budget;
  final List<FactorWeight> weights;
  final List<String> weightNotes;
  final String? rangeCycle;
  final String? consumptionCycle;
  final String? consumptionMode;
  final RecDecision decision;
  final List<RankedCar> ranked;
  final List<NotRankedCar> notRanked;
  final ExcludedCounts excluded;
  final List<FactorAvailability> factorAvailability;
  final int? candidatesConsidered;
  final List<String> notes;
  final bool sponsored;
  final String? disclosure;
  final String? notAvailableLabel;

  bool get hasDemo => ranked.any((r) => r.car.isDemo) || notRanked.any((n) => n.car.isDemo);

  /// The top pick, only when the API says the decision is decisive.
  RankedCar? get topPick {
    final key = decision.decisive ? decision.topPickKey : null;
    if (key == null) return null;
    for (final r in ranked) {
      if (r.car.key == key) return r;
    }
    return null;
  }

  static List<String> _strings(Map<String, dynamic> j, String key) => j.stringList(key);

  static RecommendationResult fromData(Object? data) {
    final j = asJsonObject(data, 'recommendation');
    final market = j.objectOrNull('market');
    final input = j.objectOrNull('input');
    final basis = j.objectOrNull('basis');
    final decision = j.objectOrNull('decision');
    final excluded = j.objectOrNull('excluded');
    return RecommendationResult(
      marketCode: market?.stringOrNull('code') ?? '',
      marketName: market?.stringOrNull('name'),
      currencyCode: market?.stringOrNull('currencyCode') ?? basis?.stringOrNull('currency'),
      budget: Money.tryParse(input?['budget']),
      weights: [
        for (final w in j.objectList('weights', (w) => w))
          if (w.stringOrNull('factor') != null)
            FactorWeight(
              factor: w.stringOrNull('factor')!,
              label: w.stringOrNull('label') ?? w.stringOrNull('factor')!,
              weight: w.doubleOrNull('weight') ?? 0,
              raw: w.doubleOrNull('raw'),
              source: w.stringOrNull('source') ?? 'default',
              betterDirection: w.stringOrNull('betterDirection'),
              description: w.stringOrNull('description'),
            ),
      ],
      weightNotes: _strings(j, 'weightNotes'),
      rangeCycle: basis?.stringOrNull('rangeCycle'),
      consumptionCycle: basis?.stringOrNull('consumptionCycle'),
      consumptionMode: basis?.stringOrNull('consumptionMode'),
      decision: RecDecision(
        // Never decisive unless the API says so explicitly.
        decisive: decision?.boolOrNull('decisive') ?? false,
        reason: decision?.stringOrNull('reason'),
        message: decision?.stringOrNull('message'),
        topPickKey: decision?.stringOrNull('topPickKey'),
      ),
      ranked: [
        for (final r in j.objectList('ranked', (r) => r))
          if (RecCar.tryParse(r['car']) case final car?)
            RankedCar(
              rank: r.intOrNull('rank') ?? 0,
              car: car,
              score: r.doubleOrNull('score'),
              contributions: [
                for (final c in r.objectList('contributions', (c) => c))
                  if (c.stringOrNull('factor') != null)
                    Contribution(
                      factor: c.stringOrNull('factor')!,
                      label: c.stringOrNull('label') ?? c.stringOrNull('factor')!,
                      weight: c.doubleOrNull('weight') ?? 0,
                      score: c.doubleOrNull('score'),
                      points: c.doubleOrNull('points'),
                      value: c.doubleOrNull('value'),
                      unit: c.stringOrNull('unit'),
                      basis: c.stringOrNull('basis'),
                    ),
              ],
              reasons: [
                for (final x in r.objectList('reasons', (x) => x))
                  if (x.stringOrNull('text') != null)
                    RecReason(
                      factor: x.stringOrNull('factor') ?? '',
                      code: x.stringOrNull('code') ?? '',
                      sentiment: x.stringOrNull('sentiment') ?? 'neutral',
                      text: x.stringOrNull('text')!,
                    ),
              ],
              sponsored: r['sponsored'] == true,
            ),
      ]..sort((a, b) => a.rank.compareTo(b.rank)),
      notRanked: [
        for (final n in j.objectList('notRanked', (n) => n))
          if (RecCar.tryParse(n['car']) case final car?)
            NotRankedCar(
              car: car,
              reason: n.stringOrNull('reason') ?? 'missing_data',
              explanation: n.stringOrNull('explanation'),
              missingData: [
                for (final m in n.objectList('missingData', (m) => m))
                  MissingItem(
                    factor: m.stringOrNull('factor') ?? '',
                    label: m.stringOrNull('label') ?? m.stringOrNull('factor') ?? '',
                    reason: m.stringOrNull('reason') ?? 'missing',
                    detail: m.stringOrNull('detail'),
                  ),
              ],
            ),
      ],
      excluded: ExcludedCounts(
        total: excluded?.intOrNull('total'),
        overBudget: excluded?.intOrNull('overBudget'),
        seatsTooFew: excluded?.intOrNull('seatsTooFew'),
        bodyType: excluded?.intOrNull('bodyType'),
        powertrain: excluded?.intOrNull('powertrain'),
      ),
      factorAvailability: [
        for (final f in j.objectList('factorAvailability', (f) => f))
          FactorAvailability(
            factor: RecFactor.fromApi(f.stringOrNull('factor')),
            label: f.stringOrNull('label') ?? f.stringOrNull('factor') ?? '',
            available: f.intOrNull('available'),
            missing: f.intOrNull('missing'),
            notComparable: f.intOrNull('notComparable'),
            suggestion: f.stringOrNull('suggestion'),
          ),
      ],
      candidatesConsidered: j.intOrNull('candidatesConsidered'),
      notes: _strings(j, 'notes'),
      sponsored: j['sponsored'] != false,
      disclosure: j.stringOrNull('disclosure'),
      notAvailableLabel: j.stringOrNull('notAvailableLabel'),
    );
  }
}
