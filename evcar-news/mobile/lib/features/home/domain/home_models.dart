import 'package:flutter/foundation.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/json/json_readers.dart';
import '../../cars/domain/catalog_models.dart' show CarSummary;
import '../../charging/domain/station_models.dart' show StationListItem;
import '../../compare/domain/comparison_models.dart' show SavedComparison;
import '../../encyclopedia/domain/encyclopedia_models.dart';
import '../../news/domain/article.dart' show ArticleSummary;
import '../../tours/domain/tour_models.dart' show TourCard;

/// Section keys of `GET /home` (backend-discovery §2).
abstract final class HomeSectionKeys {
  static const topStory = 'top_story';
  static const forYou = 'for_you';
  static const latestNews = 'latest_news';
  static const reviews = 'reviews';
  static const newCars = 'new_cars';
  static const featuredComparisons = 'featured_comparisons';
  static const interiorTours = 'interior_tours';
  static const nearbyStations = 'nearby_stations';
  static const chargingGuides = 'charging_guides';
}

/// Per-section state reported by the server.
enum HomeSectionState {
  ok,
  empty,

  /// Nearby stations without a point: ask for location or a city.
  locationRequired,

  /// The section's source failed (the others still render).
  unavailable;

  static HomeSectionState fromApi(String? v) => switch (v) {
    'ok' => ok,
    'empty' => empty,
    'location_required' => locationRequired,
    _ => unavailable,
  };
}

/// "See all" target of a section.
@immutable
class HomeBrowse {
  const HomeBrowse({required this.resource, this.params = const {}});

  final String resource;
  final Map<String, String> params;

  /// In-app location, or null for an unknown resource.
  String? get route => switch (resource) {
    'articles' => AppRoutes.newsList(type: params['type'], category: params['category']),
    'cars' => AppRoutes.cars,
    'comparisons' => AppRoutes.compare,
    'tours' => AppRoutes.tours,
    'stations' => AppRoutes.chargingView(view: 'list'),
    'encyclopedia' => AppRoutes.encyclopedia,
    _ => null,
  };

  static HomeBrowse? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final resource = j.stringOrNull('resource');
    if (resource == null) return null;
    final params = j.objectOrNull('params') ?? const {};
    return HomeBrowse(
      resource: resource,
      params: {
        for (final e in params.entries)
          if (e.value != null) e.key: e.value.toString(),
      },
    );
  }
}

/// One home section with its typed items (items that fail to parse are
/// skipped; unknown item types make the section unrenderable → hidden).
@immutable
class HomeSection {
  const HomeSection({
    required this.key,
    required this.order,
    required this.title,
    required this.itemType,
    required this.state,
    required this.items,
    this.browse,
  });

  final String key;
  final int order;

  /// Localized by the server (admin-editable wording).
  final String title;
  final String itemType;
  final HomeSectionState state;
  final List<Object> items;
  final HomeBrowse? browse;

  List<T> itemsOf<T>() => items.whereType<T>().toList(growable: false);

  bool get isKnownType => _parsers.containsKey(itemType);

  static final Map<String, Object? Function(Object?)> _parsers = {
    'article': ArticleSummary.tryParse,
    'car': CarSummary.tryParse,
    'comparison': SavedComparison.tryParse,
    'tour': TourCard.tryParse,
    'station': StationListItem.tryParse,
    'encyclopedia': EncyclopediaEntrySummary.tryParse,
  };

  static HomeSection? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final key = j.stringOrNull('key');
    final itemType = j.stringOrNull('itemType');
    if (key == null || itemType == null) return null;
    final parse = _parsers[itemType];
    final raw = j['items'];
    return HomeSection(
      key: key,
      order: j.intOrNull('order') ?? 1 << 20,
      title: j.stringOrNull('title')?.trim() ?? '',
      itemType: itemType,
      state: HomeSectionState.fromApi(j.stringOrNull('state')),
      items: parse == null || raw is! List ? const [] : [for (final i in raw) ?parse(i)],
      browse: HomeBrowse.tryParse(j['browse']),
    );
  }

  /// A copy without location-derived content (what may be stored offline).
  HomeSection withoutLocation() => HomeSection(
    key: key,
    order: order,
    title: title,
    itemType: itemType,
    state: HomeSectionState.locationRequired,
    items: const [],
    browse: browse,
  );
}

/// `GET /home` → `data`.
@immutable
class HomeFeed {
  const HomeFeed({
    required this.sections,
    this.market,
    this.language,
    this.personalized = false,
    this.generatedAt,
    this.hiddenSections = const [],
  });

  /// Render order (sorted by `order`).
  final List<HomeSection> sections;
  final String? market;
  final String? language;
  final bool personalized;
  final DateTime? generatedAt;

  /// `{key, reason}` of sections the server left out.
  final List<({String key, String reason})> hiddenSections;

  static HomeFeed fromData(Object? data) {
    final j = asJsonObject(data, 'home');
    final raw = j['sections'];
    final sections = [
      for (final s in (raw is List ? raw : const []))
        if (HomeSection.tryParse(s) case final section? when section.isKnownType) section,
    ]..sort((a, b) => a.order.compareTo(b.order));
    final hidden = j['hiddenSections'];
    return HomeFeed(
      sections: sections,
      market: j.stringOrNull('market'),
      language: j.stringOrNull('language'),
      personalized: j.boolOr('personalized', false),
      generatedAt: j.dateTimeOrNull('generatedAt'),
      hiddenSections: [
        for (final h in (hidden is List ? hidden : const []))
          if (h is Map && h['key'] is String) (key: h['key'] as String, reason: '${h['reason'] ?? ''}'),
      ],
    );
  }
}

/// Removes location-derived items from a raw `/home` body before it is
/// written to the offline cache (the point and what it reveals are never
/// stored — REQUIREMENTS §19).
Object? stripLocationFromHomeJson(Object? body) {
  if (body is! Map) return body;
  final data = body['data'];
  if (data is! Map) return body;
  final sections = data['sections'];
  if (sections is! List) return body;
  return {
    ...body,
    'data': {
      ...data,
      'sections': [
        for (final s in sections)
          if (s is Map && s['itemType'] == 'station')
            {...s, 'items': const <Object>[], 'state': 'location_required'}
          else
            s,
      ],
    },
  };
}
