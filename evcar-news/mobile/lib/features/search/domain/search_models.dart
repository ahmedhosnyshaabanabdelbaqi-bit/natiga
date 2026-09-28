import 'package:flutter/foundation.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/json/json_readers.dart';

/// Group types of `GET /search?types=` in the server's fixed order.
abstract final class SearchGroupTypes {
  static const articles = 'articles';
  static const brands = 'brands';
  static const models = 'models';
  static const variants = 'variants';
  static const stations = 'stations';
  static const encyclopedia = 'encyclopedia';
  static const services = 'services';

  static const all = [articles, brands, models, variants, stations, encyclopedia, services];
}

/// `{start, end}` — UTF-16 offsets (Dart `String` indexes the same way).
@immutable
class HighlightRange {
  const HighlightRange(this.start, this.end);

  final int start;
  final int end;

  static List<HighlightRange> listFrom(Object? json) {
    if (json is! List) return const [];
    return [
      for (final r in json)
        if (r is Map && r['start'] is int && r['end'] is int) HighlightRange(r['start'] as int, r['end'] as int),
    ];
  }

  @override
  bool operator ==(Object other) => other is HighlightRange && other.start == start && other.end == end;

  @override
  int get hashCode => Object.hash(start, end);
}

/// Splits [text] into (segment, highlighted) runs. Ranges out of bounds,
/// empty or overlapping are clamped / merged, so a bad range can never
/// throw or cut a character.
List<(String, bool)> highlightRuns(String text, List<HighlightRange> ranges) {
  final valid = [
    for (final r in ranges)
      if (r.end > r.start && r.start < text.length && r.end > 0) HighlightRange(r.start.clamp(0, text.length), r.end.clamp(0, text.length)),
  ]..sort((a, b) => a.start.compareTo(b.start));
  final merged = <HighlightRange>[];
  for (final r in valid) {
    if (merged.isNotEmpty && r.start <= merged.last.end) {
      final last = merged.removeLast();
      merged.add(HighlightRange(last.start, r.end > last.end ? r.end : last.end));
    } else {
      merged.add(r);
    }
  }
  final runs = <(String, bool)>[];
  var pos = 0;
  for (final r in merged) {
    if (r.start > pos) runs.add((text.substring(pos, r.start), false));
    runs.add((text.substring(r.start, r.end), true));
    pos = r.end;
  }
  if (pos < text.length) runs.add((text.substring(pos), false));
  return runs;
}

/// One result (`SearchHit`, backend-discovery §1).
@immutable
class SearchHit {
  const SearchHit({
    required this.type,
    required this.id,
    required this.title,
    this.slug,
    this.subtitle,
    this.snippet,
    this.imageUrl,
    this.language,
    this.isFallback = false,
    this.titleHighlights = const [],
    this.snippetHighlights = const [],
    this.matchedBy,
    this.isDemo = false,
    this.details = const {},
  });

  /// `article | brand | model | variant | station | encyclopedia | service`.
  final String type;
  final String id;
  final String? slug;
  final String title;
  final String? subtitle;
  final String? snippet;
  final String? imageUrl;
  final String? language;
  final bool isFallback;
  final List<HighlightRange> titleHighlights;
  final List<HighlightRange> snippetHighlights;

  /// `exact | prefix | text | alias | fuzzy`.
  final String? matchedBy;
  final bool isDemo;
  final Map<String, dynamic> details;

  bool get isSponsored => type == 'service' && details['isSponsored'] == true;
  String? get sponsorLabel => details['sponsorLabel'] is String ? details['sponsorLabel'] as String : null;

  /// In-app location of the hit, or null when it cannot be opened.
  String? get route => searchRoute(type, id: id, slug: slug);

  static SearchHit? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final type = j.stringOrNull('type');
    final id = j.stringOrNull('id');
    final title = j.stringOrNull('title');
    if (type == null || id == null || title == null || title.trim().isEmpty) return null;
    final hl = j.objectOrNull('highlights');
    String? text(String k) {
      final v = j.stringOrNull(k)?.trim();
      return v == null || v.isEmpty ? null : v;
    }

    return SearchHit(
      type: type,
      id: id,
      slug: text('slug'),
      // Offsets index the exact string: never trim the title.
      title: title,
      subtitle: text('subtitle'),
      snippet: j.stringOrNull('snippet'),
      imageUrl: text('imageUrl'),
      language: text('language'),
      isFallback: j.boolOr('isFallback', false),
      titleHighlights: HighlightRange.listFrom(hl?['title']),
      snippetHighlights: HighlightRange.listFrom(hl?['snippet']),
      matchedBy: text('matchedBy'),
      isDemo: j.boolOr('isDemo', false),
      details: j.objectOrNull('details') ?? const {},
    );
  }
}

/// App route of a search result / entity suggestion (backend-discovery §1).
String? searchRoute(String? type, {String? id, String? slug}) {
  final s = slug ?? id;
  return switch (type) {
    'article' when slug != null => AppRoutes.article(slug),
    'brand' when slug != null => AppRoutes.brand(slug),
    'model' when slug != null => AppRoutes.car(slug),
    'variant' when slug != null => AppRoutes.variant(slug),
    'station' when id != null => AppRoutes.station(id),
    'encyclopedia' when s != null => AppRoutes.encyclopediaEntry(s),
    'service' when s != null => AppRoutes.serviceProvider(s),
    _ => null,
  };
}

@immutable
class SearchGroup {
  const SearchGroup({
    required this.type,
    required this.total,
    required this.items,
    this.page = 1,
    this.pageSize,
    this.hasMore = false,
  });

  final String type;
  final int total;
  final int page;
  final int? pageSize;
  final bool hasMore;
  final List<SearchHit> items;

  static SearchGroup? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final type = j.stringOrNull('type');
    if (type == null) return null;
    final items = j['items'];
    return SearchGroup(
      type: type,
      total: j.intOrNull('total') ?? 0,
      page: j.intOrNull('page') ?? 1,
      pageSize: j.intOrNull('pageSize'),
      hasMore: j.boolOr('hasMore', false),
      items: [for (final i in (items is List ? items : const [])) ?SearchHit.tryParse(i)],
    );
  }
}

/// `GET /search` → `data`.
@immutable
class SearchResults {
  const SearchResults({
    required this.query,
    required this.groups,
    this.normalizedQuery,
    this.expansions = const [],
    this.totalHits = 0,
  });

  final String query;
  final String? normalizedQuery;

  /// Alternative spellings applied (e.g. "بي واي دي" → "BYD").
  final List<({String term, String canonical})> expansions;
  final int totalHits;
  final List<SearchGroup> groups;

  List<SearchGroup> get nonEmptyGroups => [
    for (final g in groups)
      if (g.items.isNotEmpty) g,
  ];

  SearchGroup? group(String type) {
    for (final g in groups) {
      if (g.type == type) return g;
    }
    return null;
  }

  static SearchResults fromData(Object? data) {
    final j = asJsonObject(data, 'search');
    final groups = j['groups'];
    final exp = j['expansions'];
    final parsed = [for (final g in (groups is List ? groups : const [])) ?SearchGroup.tryParse(g)];
    // Keep the server's fixed order; unknown group types go last.
    int rank(String t) {
      final i = SearchGroupTypes.all.indexOf(t);
      return i < 0 ? 99 : i;
    }

    parsed.sort((a, b) => rank(a.type).compareTo(rank(b.type)));
    return SearchResults(
      query: j.stringOrNull('query') ?? '',
      normalizedQuery: j.stringOrNull('normalizedQuery'),
      expansions: [
        for (final e in (exp is List ? exp : const []))
          if (e is Map && e['term'] is String && e['canonical'] is String)
            (term: e['term'] as String, canonical: e['canonical'] as String),
      ],
      totalHits: j.intOrNull('totalHits') ?? parsed.fold<int>(0, (s, g) => s + g.total),
      groups: parsed,
    );
  }
}

/// `GET /search/suggest` item.
@immutable
class SearchSuggestion {
  const SearchSuggestion({
    required this.text,
    required this.kind,
    this.type,
    this.id,
    this.slug,
    this.highlights = const [],
  });

  final String text;

  /// `query` = search for [text]; `entity` = open the item directly.
  final String kind;
  final String? type;
  final String? id;
  final String? slug;
  final List<HighlightRange> highlights;

  bool get isEntity => kind == 'entity';

  String? get route => isEntity ? searchRoute(type, id: id, slug: slug) : null;

  static SearchSuggestion? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final text = j.stringOrNull('text');
    if (text == null || text.trim().isEmpty) return null;
    return SearchSuggestion(
      text: text,
      kind: j.stringOrNull('kind') ?? 'query',
      type: j.stringOrNull('type'),
      id: j.stringOrNull('id'),
      slug: j.stringOrNull('slug'),
      highlights: HighlightRange.listFrom(j['highlights']),
    );
  }
}
