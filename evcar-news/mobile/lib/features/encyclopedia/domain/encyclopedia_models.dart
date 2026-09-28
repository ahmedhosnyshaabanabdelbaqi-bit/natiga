import 'package:flutter/foundation.dart';

import '../../../core/json/json_readers.dart';
import '../../cars/domain/catalog_models.dart' show CatalogImage;

String? _text(Map<String, dynamic> j, String key) {
  final v = j.stringOrNull(key)?.trim();
  return (v == null || v.isEmpty) ? null : v;
}

/// Category keys whose entries always carry the electrical safety notice
/// (backend `encyclopedia-rules.ts`).
const electricalCategoryKeys = {'home_charging', 'fast_charging', 'connectors', 'batteries'};

/// `GET /encyclopedia/categories` item.
@immutable
class EncyclopediaCategory {
  const EncyclopediaCategory({
    required this.key,
    required this.name,
    this.description,
    this.iconKey,
    this.sortOrder,
    this.entryCount,
  });

  final String key;
  final String name;
  final String? description;
  final String? iconKey;
  final int? sortOrder;

  /// Published entries in this category (null when not sent).
  final int? entryCount;

  static EncyclopediaCategory? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final key = _text(j, 'key');
    final name = _text(j, 'name') ?? _text(j, 'nameAr') ?? _text(j, 'nameEn');
    if (key == null || name == null) return null;
    return EncyclopediaCategory(
      key: key,
      name: name,
      description: _text(j, 'description'),
      iconKey: _text(j, 'iconKey'),
      sortOrder: j.intOrNull('sortOrder'),
      entryCount: j.intOrNull('entryCount'),
    );
  }
}

/// `{key, name, iconKey}` of an entry's category.
@immutable
class EncyclopediaCategoryRef {
  const EncyclopediaCategoryRef({required this.key, required this.name, this.iconKey});

  final String key;
  final String name;
  final String? iconKey;

  static EncyclopediaCategoryRef? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final key = _text(j, 'key');
    if (key == null) return null;
    return EncyclopediaCategoryRef(key: key, name: _text(j, 'name') ?? key, iconKey: _text(j, 'iconKey'));
  }
}

/// Technical review stamp. Only reviewed entries are public, but the app
/// shows the badge only when the server says so (never assumed).
@immutable
class EncyclopediaReview {
  const EncyclopediaReview({required this.reviewed, this.reviewedAt, this.label});

  final bool reviewed;
  final DateTime? reviewedAt;

  /// Localized server label ("راجعه مختص تقني").
  final String? label;

  static EncyclopediaReview fromJson(Map<String, dynamic>? j) {
    if (j == null) return const EncyclopediaReview(reviewed: false);
    return EncyclopediaReview(
      reviewed: j.boolOr('reviewed', false),
      reviewedAt: j.dateTimeOrNull('reviewedAt'),
      label: _text(j, 'label'),
    );
  }
}

/// List item (`EncyclopediaEntrySummary`, backend-discovery §4). Also the
/// item shape of the home "charging guides" section.
@immutable
class EncyclopediaEntrySummary {
  const EncyclopediaEntrySummary({
    required this.id,
    required this.slug,
    required this.title,
    required this.category,
    this.summary,
    this.language,
    this.isFallback = false,
    this.availableLanguages = const [],
    this.coverImage,
    this.readingMinutes,
    this.review = const EncyclopediaReview(reviewed: false),
    this.publishedAt,
    this.contentUpdatedAt,
    this.isDemo = false,
  });

  final String id;
  final String slug;
  final String title;
  final EncyclopediaCategoryRef category;
  final String? summary;
  final String? language;

  /// The text is not in the requested language.
  final bool isFallback;
  final List<String> availableLanguages;
  final CatalogImage? coverImage;
  final int? readingMinutes;
  final EncyclopediaReview review;
  final DateTime? publishedAt;
  final DateTime? contentUpdatedAt;
  final bool isDemo;

  /// Latest date the content changed (for "last updated").
  DateTime? get updatedAt => contentUpdatedAt ?? publishedAt;

  bool get isElectrical => electricalCategoryKeys.contains(category.key);

  static EncyclopediaEntrySummary? tryParse(Object? json) {
    if (json is! Map) return null;
    return _parse(asJsonObject(json));
  }

  static EncyclopediaEntrySummary? _parse(Map<String, dynamic> j) {
    final id = _text(j, 'id');
    final slug = _text(j, 'slug');
    final title = _text(j, 'title');
    final category = EncyclopediaCategoryRef.tryParse(j['category']);
    if (id == null || slug == null || title == null || category == null) return null;
    final minutes = j.intOrNull('readingMinutes');
    return EncyclopediaEntrySummary(
      id: id,
      slug: slug,
      title: title,
      category: category,
      summary: _text(j, 'summary'),
      language: _text(j, 'language'),
      isFallback: j.boolOr('isFallback', false),
      availableLanguages: j.stringList('availableLanguages'),
      coverImage: CatalogImage.tryParse(j['coverImage']),
      // A zero / negative reading time is not information.
      readingMinutes: minutes != null && minutes > 0 ? minutes : null,
      review: EncyclopediaReview.fromJson(j.objectOrNull('review')),
      publishedAt: j.dateTimeOrNull('publishedAt'),
      contentUpdatedAt: j.dateTimeOrNull('contentUpdatedAt'),
      isDemo: j.boolOr('isDemo', false),
    );
  }
}

/// `GET /encyclopedia/:slug`.
@immutable
class EncyclopediaEntryDetail {
  const EncyclopediaEntryDetail({
    required this.entry,
    required this.bodyHtml,
    this.safetyNotice,
    this.related = const [],
  });

  final EncyclopediaEntrySummary entry;

  /// Sanitized by the server; sanitized again by `SafeHtml` on render.
  final String bodyHtml;

  /// Fixed safety notice of electrical categories (server text).
  final String? safetyNotice;
  final List<EncyclopediaEntrySummary> related;

  static EncyclopediaEntryDetail fromData(Object? data) {
    final j = asJsonObject(data, 'entry');
    final entry = EncyclopediaEntrySummary._parse(j);
    if (entry == null) throw const FormatException('Invalid encyclopedia entry');
    return EncyclopediaEntryDetail(
      entry: entry,
      bodyHtml: j.stringOrNull('bodyHtml') ?? '',
      safetyNotice: _text(j, 'safetyNotice'),
      related: [
        for (final r in (j['related'] is List ? j['related'] as List : const []))
          if (EncyclopediaEntrySummary.tryParse(r) case final e? when e.id != entry.id) e,
      ],
    );
  }
}
