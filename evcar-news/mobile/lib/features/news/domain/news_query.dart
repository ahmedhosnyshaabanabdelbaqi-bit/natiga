import 'package:flutter/foundation.dart';

/// Sort orders of `GET /articles`.
enum NewsSort {
  latest,
  popular,
  oldest;

  static NewsSort fromName(String? v) => values.firstWhere((s) => s.name == v, orElse: () => latest);
}

/// Filters of a news feed (`GET /articles`). Value object: used as the key of
/// the feed provider and of the offline cache entry.
@immutable
class NewsQuery {
  const NewsQuery({
    this.category,
    this.tag,
    this.type,
    this.sort = NewsSort.latest,
    this.allMarkets = false,
    this.onlyMyLanguage = false,
  });

  /// Category slug (includes sub-categories on the server).
  final String? category;

  /// Tag slug.
  final String? tag;

  /// One of `ArticleTypes`.
  final String? type;
  final NewsSort sort;

  /// Ignore market targeting (browse every market's news).
  final bool allMarkets;

  /// `languageMode=strict`: only articles written/translated in the app language.
  final bool onlyMyLanguage;

  /// Number of options changed from the defaults in the filter sheet.
  int get activeFilterCount =>
      (type != null ? 1 : 0) + (sort != NewsSort.latest ? 1 : 0) + (allMarkets ? 1 : 0) + (onlyMyLanguage ? 1 : 0);

  NewsQuery copyWith({
    ValueGetter<String?>? category,
    ValueGetter<String?>? tag,
    ValueGetter<String?>? type,
    NewsSort? sort,
    bool? allMarkets,
    bool? onlyMyLanguage,
  }) => NewsQuery(
    category: category != null ? category() : this.category,
    tag: tag != null ? tag() : this.tag,
    type: type != null ? type() : this.type,
    sort: sort ?? this.sort,
    allMarkets: allMarkets ?? this.allMarkets,
    onlyMyLanguage: onlyMyLanguage ?? this.onlyMyLanguage,
  );

  /// Query parameters for page [page] of [pageSize].
  Map<String, dynamic> toQueryParameters({required int page, required int pageSize}) => {
    'page': page,
    'pageSize': pageSize,
    'category': ?category,
    'tag': ?tag,
    'type': ?type,
    if (sort != NewsSort.latest) 'sort': sort.name,
    if (allMarkets) 'allMarkets': 'true',
    if (onlyMyLanguage) 'languageMode': 'strict',
  };

  /// Stable discriminator for cache keys.
  String get cacheKey =>
      'c=${category ?? ''}&t=${tag ?? ''}&y=${type ?? ''}&s=${sort.name}&m=${allMarkets ? 1 : 0}&l=${onlyMyLanguage ? 1 : 0}';

  @override
  bool operator ==(Object other) =>
      other is NewsQuery &&
      other.category == category &&
      other.tag == tag &&
      other.type == type &&
      other.sort == sort &&
      other.allMarkets == allMarkets &&
      other.onlyMyLanguage == onlyMyLanguage;

  @override
  int get hashCode => Object.hash(category, tag, type, sort, allMarkets, onlyMyLanguage);

  @override
  String toString() => 'NewsQuery($cacheKey)';
}
