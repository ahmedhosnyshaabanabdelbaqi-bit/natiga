import 'package:flutter/foundation.dart';

import '../../../core/json/json_readers.dart';

/// Article types of the API (`GET /articles?type=`).
abstract final class ArticleTypes {
  static const news = 'news';
  static const review = 'review';
  static const testDrive = 'test_drive';
  static const buyingGuide = 'buying_guide';
  static const explainer = 'explainer';
  static const opinion = 'opinion';

  static const all = [news, review, testDrive, buyingGuide, explainer, opinion];
}

/// Reads a string that must be non-blank; blank → null.
String? _text(Map<String, dynamic> json, String key) {
  final v = json.stringOrNull(key)?.trim();
  return (v == null || v.isEmpty) ? null : v;
}

/// A calendar date `YYYY-MM-DD` (no time zone: it is shown as written).
DateTime? parseCalendarDate(String? value) {
  if (value == null) return null;
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(value.trim());
  if (m == null) return null;
  final y = int.parse(m.group(1)!);
  final mo = int.parse(m.group(2)!);
  final d = int.parse(m.group(3)!);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Local noon: formatting in any time zone keeps the same calendar day.
  return DateTime(y, mo, d, 12);
}

String _calendarDateToJson(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// `{id, slug, name}` of a category or tag.
@immutable
class TaxonomyRef {
  const TaxonomyRef({required this.id, required this.slug, required this.name});

  final String id;
  final String slug;
  final String name;

  /// Null when the entry is unusable (no slug or name).
  static TaxonomyRef? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final slug = _text(j, 'slug');
    final name = _text(j, 'name');
    if (slug == null || name == null) return null;
    return TaxonomyRef(id: _text(j, 'id') ?? slug, slug: slug, name: name);
  }

  Map<String, dynamic> toJson() => {'id': id, 'slug': slug, 'name': name};

  @override
  bool operator ==(Object other) => other is TaxonomyRef && other.id == id && other.slug == slug && other.name == name;

  @override
  int get hashCode => Object.hash(id, slug, name);
}

/// One available width of an image.
@immutable
class ImageVariant {
  const ImageVariant({required this.url, this.width, this.height});

  final String url;
  final int? width;
  final int? height;

  Map<String, dynamic> toJson() => {'url': url, 'width': width, 'height': height};
}

/// Licensed image with its rights information (cover image).
@immutable
class ArticleImage {
  const ArticleImage({
    required this.url,
    this.id,
    this.width,
    this.height,
    this.variants = const [],
    this.alt,
    this.caption,
    this.credit,
    this.licenseType,
    this.licenseUrl,
    this.sourceUrl,
  });

  final String? id;
  final String url;
  final int? width;
  final int? height;
  final List<ImageVariant> variants;
  final String? alt;
  final String? caption;
  final String? credit;
  final String? licenseType;
  final String? licenseUrl;
  final String? sourceUrl;

  double? get aspectRatio {
    final w = width;
    final h = height;
    if (w == null || h == null || w <= 0 || h <= 0) return null;
    return w / h;
  }

  /// Smallest variant at least [minWidth] px wide (else the largest, else [url]).
  String urlFor(double minWidth) {
    final sized = variants.where((v) => v.width != null).toList()..sort((a, b) => a.width!.compareTo(b.width!));
    if (sized.isEmpty) return url;
    for (final v in sized) {
      if (v.width! >= minWidth) return v.url;
    }
    return sized.last.url;
  }

  /// Every URL of this image (for offline saving).
  Iterable<String> get allUrls => {url, for (final v in variants) v.url};

  static ArticleImage? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final url = _text(j, 'url');
    if (url == null) return null;
    return ArticleImage(
      id: _text(j, 'id'),
      url: url,
      width: j.intOrNull('width'),
      height: j.intOrNull('height'),
      variants: [
        for (final v in (j['variants'] is List ? j['variants'] as List : const []))
          if (v is Map && v['url'] is String && (v['url'] as String).trim().isNotEmpty)
            ImageVariant(
              url: (v['url'] as String).trim(),
              width: asJsonObject(v).intOrNull('width'),
              height: asJsonObject(v).intOrNull('height'),
            ),
      ],
      alt: _text(j, 'alt'),
      caption: _text(j, 'caption'),
      credit: _text(j, 'credit'),
      licenseType: _text(j, 'licenseType'),
      licenseUrl: _text(j, 'licenseUrl'),
      sourceUrl: _text(j, 'sourceUrl'),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'url': url,
    'width': width,
    'height': height,
    'variants': [for (final v in variants) v.toJson()],
    'alt': alt,
    'caption': caption,
    'credit': credit,
    'licenseType': licenseType,
    'licenseUrl': licenseUrl,
    'sourceUrl': sourceUrl,
  };
}

/// List item of `GET /articles` (`PublicArticleSummaryDto`).
///
/// Parsing is tolerant: optional fields that are missing or of the wrong
/// type become `null` / empty (never `0` or a made-up value). Only `slug`
/// and `title` are required ([tryParse] returns null without them).
@immutable
class ArticleSummary {
  const ArticleSummary({
    required this.id,
    required this.slug,
    required this.title,
    this.type,
    this.summary,
    this.language,
    this.requestedLanguage,
    this.isFallback = false,
    this.availableLanguages = const [],
    this.category,
    this.tags = const [],
    this.coverImage,
    this.authorName,
    this.publishedAt,
    this.contentUpdatedAt,
    this.eventDate,
    this.readingMinutes,
    this.isFeatured = false,
    this.isSponsored = false,
    this.sponsorName,
    this.isDemo = false,
    this.marketCodes = const [],
    this.shareUrl,
  });

  final String id;
  final String slug;
  final String title;
  final String? type;
  final String? summary;

  /// Language actually served (`ar` / `en`).
  final String? language;
  final String? requestedLanguage;

  /// True when the text is not in the requested language.
  final bool isFallback;
  final List<String> availableLanguages;
  final TaxonomyRef? category;
  final List<TaxonomyRef> tags;
  final ArticleImage? coverImage;
  final String? authorName;
  final DateTime? publishedAt;

  /// Last editorial change after publication ("Updated …").
  final DateTime? contentUpdatedAt;

  /// When the event happened (calendar date), separate from publication.
  final DateTime? eventDate;
  final int? readingMinutes;
  final bool isFeatured;
  final bool isSponsored;
  final String? sponsorName;
  final bool isDemo;

  /// Target markets (empty = every market).
  final List<String> marketCodes;

  /// Public link from the server (`https://evcar.news/n/<slug>`).
  final String? shareUrl;

  static ArticleSummary? tryParse(Object? json) {
    if (json is! Map) return null;
    return _parseInto(asJsonObject(json), _summaryFrom);
  }

  static T? _parseInto<T>(Map<String, dynamic> j, T Function(Map<String, dynamic> j, _Base b) build) {
    final slug = _text(j, 'slug');
    final title = _text(j, 'title');
    if (slug == null || title == null) return null;
    final readingMinutes = j.intOrNull('readingMinutes');
    final base = _Base(
      id: _text(j, 'id') ?? slug,
      slug: slug,
      title: title,
      type: _text(j, 'type'),
      summary: _text(j, 'summary'),
      language: _text(j, 'language'),
      requestedLanguage: _text(j, 'requestedLanguage'),
      isFallback: j.boolOr('isFallback', false),
      availableLanguages: j.stringList('availableLanguages'),
      category: TaxonomyRef.tryParse(j['category']),
      tags: [for (final t in (j['tags'] is List ? j['tags'] as List : const [])) ?TaxonomyRef.tryParse(t)],
      coverImage: ArticleImage.tryParse(j['coverImage']),
      authorName: j['author'] is Map ? _text(asJsonObject(j['author']), 'name') : null,
      publishedAt: j.dateTimeOrNull('publishedAt'),
      contentUpdatedAt: j.dateTimeOrNull('contentUpdatedAt'),
      eventDate: parseCalendarDate(j.stringOrNull('eventDate')),
      readingMinutes: (readingMinutes != null && readingMinutes > 0) ? readingMinutes : null,
      isFeatured: j.boolOr('isFeatured', false),
      isSponsored: j.boolOr('isSponsored', false),
      sponsorName: _text(j, 'sponsorName'),
      isDemo: j.boolOr('isDemo', false),
      marketCodes: j.stringList('marketCodes'),
      shareUrl: _text(j, 'shareUrl'),
    );
    return build(j, base);
  }

  static ArticleSummary _summaryFrom(Map<String, dynamic> j, _Base b) => ArticleSummary(
    id: b.id,
    slug: b.slug,
    title: b.title,
    type: b.type,
    summary: b.summary,
    language: b.language,
    requestedLanguage: b.requestedLanguage,
    isFallback: b.isFallback,
    availableLanguages: b.availableLanguages,
    category: b.category,
    tags: b.tags,
    coverImage: b.coverImage,
    authorName: b.authorName,
    publishedAt: b.publishedAt,
    contentUpdatedAt: b.contentUpdatedAt,
    eventDate: b.eventDate,
    readingMinutes: b.readingMinutes,
    isFeatured: b.isFeatured,
    isSponsored: b.isSponsored,
    sponsorName: b.sponsorName,
    isDemo: b.isDemo,
    marketCodes: b.marketCodes,
    shareUrl: b.shareUrl,
  );

  /// Same shape as the API (so saved copies parse with the same code).
  Map<String, dynamic> toJson() => {
    'id': id,
    'slug': slug,
    'type': type,
    'title': title,
    'summary': summary,
    'language': language,
    'requestedLanguage': requestedLanguage,
    'isFallback': isFallback,
    'availableLanguages': availableLanguages,
    'category': category?.toJson(),
    'tags': [for (final t in tags) t.toJson()],
    'coverImage': coverImage?.toJson(),
    'author': authorName == null ? null : {'name': authorName},
    'publishedAt': publishedAt?.toUtc().toIso8601String(),
    'contentUpdatedAt': contentUpdatedAt?.toUtc().toIso8601String(),
    'eventDate': eventDate == null ? null : _calendarDateToJson(eventDate!),
    'readingMinutes': readingMinutes,
    'isFeatured': isFeatured,
    'isSponsored': isSponsored,
    'sponsorName': sponsorName,
    'isDemo': isDemo,
    'marketCodes': marketCodes,
    'shareUrl': shareUrl,
  };
}

/// Parsed common fields (internal).
class _Base {
  _Base({
    required this.id,
    required this.slug,
    required this.title,
    required this.type,
    required this.summary,
    required this.language,
    required this.requestedLanguage,
    required this.isFallback,
    required this.availableLanguages,
    required this.category,
    required this.tags,
    required this.coverImage,
    required this.authorName,
    required this.publishedAt,
    required this.contentUpdatedAt,
    required this.eventDate,
    required this.readingMinutes,
    required this.isFeatured,
    required this.isSponsored,
    required this.sponsorName,
    required this.isDemo,
    required this.marketCodes,
    required this.shareUrl,
  });

  final String id;
  final String slug;
  final String title;
  final String? type;
  final String? summary;
  final String? language;
  final String? requestedLanguage;
  final bool isFallback;
  final List<String> availableLanguages;
  final TaxonomyRef? category;
  final List<TaxonomyRef> tags;
  final ArticleImage? coverImage;
  final String? authorName;
  final DateTime? publishedAt;
  final DateTime? contentUpdatedAt;
  final DateTime? eventDate;
  final int? readingMinutes;
  final bool isFeatured;
  final bool isSponsored;
  final String? sponsorName;
  final bool isDemo;
  final List<String> marketCodes;
  final String? shareUrl;
}

/// Where an article's text comes from.
@immutable
class ArticleSource {
  const ArticleSource({this.name, this.url, this.attribution});

  final String? name;
  final String? url;
  final String? attribution;

  bool get isEmpty => name == null && url == null && attribution == null;

  static ArticleSource? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final s = ArticleSource(name: _text(j, 'name'), url: _text(j, 'url'), attribution: _text(j, 'attribution'));
    return s.isEmpty ? null : s;
  }

  Map<String, dynamic> toJson() => {'name': name, 'url': url, 'attribution': attribution};
}

/// Kinds of published corrections.
abstract final class CorrectionKinds {
  static const correction = 'correction';
  static const clarification = 'clarification';
  static const update = 'update';
}

@immutable
class ArticleCorrection {
  const ArticleCorrection({
    required this.id,
    required this.kind,
    required this.note,
    this.noteLanguage,
    this.correctedAt,
  });

  final String id;
  final String kind;
  final String note;
  final String? noteLanguage;
  final DateTime? correctedAt;

  static ArticleCorrection? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final note = _text(j, 'note');
    if (note == null) return null;
    return ArticleCorrection(
      id: _text(j, 'id') ?? note.hashCode.toString(),
      kind: _text(j, 'kind') ?? CorrectionKinds.correction,
      note: note,
      noteLanguage: _text(j, 'noteLanguage'),
      correctedAt: j.dateTimeOrNull('correctedAt'),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'kind': kind,
    'note': note,
    'noteLanguage': noteLanguage,
    'correctedAt': correctedAt?.toUtc().toIso8601String(),
  };
}

/// A car the article is about (published cars only).
@immutable
class RelatedVehicle {
  const RelatedVehicle({
    required this.type,
    required this.id,
    required this.slug,
    required this.name,
    this.brandName,
    this.modelSlug,
    this.modelYear,
  });

  /// `brand`, `model` or `variant`.
  final String type;
  final String id;
  final String slug;
  final String name;
  final String? brandName;
  final String? modelSlug;
  final int? modelYear;

  static RelatedVehicle? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final type = _text(j, 'type');
    final slug = _text(j, 'slug');
    final name = _text(j, 'name');
    if (type == null || slug == null || name == null) return null;
    if (type != 'brand' && type != 'model' && type != 'variant') return null;
    return RelatedVehicle(
      type: type,
      id: _text(j, 'id') ?? slug,
      slug: slug,
      name: name,
      brandName: _text(j, 'brandName'),
      modelSlug: _text(j, 'modelSlug'),
      modelYear: j.intOrNull('modelYear'),
    );
  }

  Map<String, dynamic> toJson() => {
    'type': type,
    'id': id,
    'slug': slug,
    'name': name,
    'brandName': brandName,
    'modelSlug': modelSlug,
    'modelYear': modelYear,
  };
}

/// `GET /articles/:slug` (`PublicArticleDetailDto`).
@immutable
class ArticleDetail extends ArticleSummary {
  const ArticleDetail({
    required super.id,
    required super.slug,
    required super.title,
    super.type,
    super.summary,
    super.language,
    super.requestedLanguage,
    super.isFallback,
    super.availableLanguages,
    super.category,
    super.tags,
    super.coverImage,
    super.authorName,
    super.publishedAt,
    super.contentUpdatedAt,
    super.eventDate,
    super.readingMinutes,
    super.isFeatured,
    super.isSponsored,
    super.sponsorName,
    super.isDemo,
    super.marketCodes,
    super.shareUrl,
    this.bodyHtml = '',
    this.machineTranslated = false,
    this.source,
    this.corrections = const [],
    this.relatedArticles = const [],
    this.relatedVehicles = const [],
    this.marketMatch = true,
    this.allowComments = false,
    this.updatedAt,
  });

  /// Server-sanitized HTML (sanitized again in the app before rendering).
  final String bodyHtml;

  /// Human-reviewed machine translation (show a small note).
  final bool machineTranslated;
  final ArticleSource? source;
  final List<ArticleCorrection> corrections;
  final List<ArticleSummary> relatedArticles;
  final List<RelatedVehicle> relatedVehicles;

  /// False when the article targets other markets than the reader's.
  final bool marketMatch;
  final bool allowComments;
  final DateTime? updatedAt;

  static ArticleDetail? tryParse(Object? json) {
    if (json is! Map) return null;
    return ArticleSummary._parseInto(asJsonObject(json), (j, b) {
      return ArticleDetail(
        id: b.id,
        slug: b.slug,
        title: b.title,
        type: b.type,
        summary: b.summary,
        language: b.language,
        requestedLanguage: b.requestedLanguage,
        isFallback: b.isFallback,
        availableLanguages: b.availableLanguages,
        category: b.category,
        tags: b.tags,
        coverImage: b.coverImage,
        authorName: b.authorName,
        publishedAt: b.publishedAt,
        contentUpdatedAt: b.contentUpdatedAt,
        eventDate: b.eventDate,
        readingMinutes: b.readingMinutes,
        isFeatured: b.isFeatured,
        isSponsored: b.isSponsored,
        sponsorName: b.sponsorName,
        isDemo: b.isDemo,
        marketCodes: b.marketCodes,
        shareUrl: b.shareUrl,
        bodyHtml: j.stringOrNull('bodyHtml') ?? '',
        machineTranslated: j.boolOr('machineTranslated', false),
        source: ArticleSource.tryParse(j['source']),
        corrections: [
          for (final c in (j['corrections'] is List ? j['corrections'] as List : const []))
            ?ArticleCorrection.tryParse(c),
        ],
        relatedArticles: [
          for (final a in (j['relatedArticles'] is List ? j['relatedArticles'] as List : const []))
            ?ArticleSummary.tryParse(a),
        ],
        relatedVehicles: [
          for (final v in (j['relatedVehicles'] is List ? j['relatedVehicles'] as List : const []))
            ?RelatedVehicle.tryParse(v),
        ],
        marketMatch: j.boolOr('marketMatch', true),
        allowComments: j.boolOr('allowComments', false),
        updatedAt: j.dateTimeOrNull('updatedAt'),
      );
    });
  }

  /// Parses `data` of the detail endpoint or throws [FormatException].
  static ArticleDetail fromData(Object? data) {
    final d = tryParse(data);
    if (d == null) throw const FormatException('Article without slug or title');
    return d;
  }

  @override
  Map<String, dynamic> toJson() => {
    ...super.toJson(),
    'bodyHtml': bodyHtml,
    'machineTranslated': machineTranslated,
    'source': source?.toJson(),
    'corrections': [for (final c in corrections) c.toJson()],
    'relatedArticles': [for (final a in relatedArticles) a.toJson()],
    'relatedVehicles': [for (final v in relatedVehicles) v.toJson()],
    'marketMatch': marketMatch,
    'allowComments': allowComments,
    'updatedAt': updatedAt?.toUtc().toIso8601String(),
  };
}

/// `GET /categories` item.
@immutable
class NewsCategory {
  const NewsCategory({
    required this.id,
    required this.slug,
    required this.name,
    this.description,
    this.parentId,
    this.sortOrder,
    this.articleCount,
    this.isDemo = false,
  });

  final String id;
  final String slug;
  final String name;
  final String? description;
  final String? parentId;
  final int? sortOrder;

  /// Visible articles in the request market (`null` = not reported).
  final int? articleCount;
  final bool isDemo;

  static NewsCategory? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final slug = _text(j, 'slug');
    final name = _text(j, 'name') ?? _text(j, 'nameEn') ?? _text(j, 'nameAr');
    if (slug == null || name == null) return null;
    return NewsCategory(
      id: _text(j, 'id') ?? slug,
      slug: slug,
      name: name,
      description: _text(j, 'description'),
      parentId: _text(j, 'parentId'),
      sortOrder: j.intOrNull('sortOrder'),
      articleCount: j.intOrNull('articleCount'),
      isDemo: j.boolOr('isDemo', false),
    );
  }
}

/// `GET /tags/:slug`.
@immutable
class NewsTag {
  const NewsTag({required this.id, required this.slug, required this.name, this.articleCount, this.isDemo = false});

  final String id;
  final String slug;
  final String name;
  final int? articleCount;
  final bool isDemo;

  static NewsTag? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final slug = _text(j, 'slug');
    final name = _text(j, 'name') ?? _text(j, 'nameEn') ?? _text(j, 'nameAr');
    if (slug == null || name == null) return null;
    return NewsTag(
      id: _text(j, 'id') ?? slug,
      slug: slug,
      name: name,
      articleCount: j.intOrNull('articleCount'),
      isDemo: j.boolOr('isDemo', false),
    );
  }
}
