/// Contract-shaped test payloads for the news API (backend
/// `PublicArticleSummaryDto` / `PublicArticleDetailDto`). Obviously fake
/// values — test data only, never shown in the app.
library;

Map<String, dynamic> summaryJson({
  String id = '11111111-1111-4111-8111-111111111111',
  String slug = 'test-article',
  String title = 'Test article title',
  String? summary = 'Test summary',
  String language = 'en',
  String requestedLanguage = 'en',
  bool isFallback = false,
  Map<String, dynamic>? coverImage,
  String? eventDate,
  int? readingMinutes = 4,
  bool isDemo = false,
  bool isSponsored = false,
  String publishedAt = '2026-09-24T10:00:00.000Z',
}) => {
  'id': id,
  'slug': slug,
  'type': 'news',
  'title': title,
  'summary': summary,
  'language': language,
  'requestedLanguage': requestedLanguage,
  'isFallback': isFallback,
  'availableLanguages': [language],
  'category': {'id': 'cat-1', 'slug': 'charging', 'name': 'Charging'},
  'tags': [
    {'id': 'tag-1', 'slug': 'fast-charging', 'name': 'Fast charging'},
  ],
  'coverImage': coverImage,
  'author': {'name': 'Test Author'},
  'publishedAt': publishedAt,
  'contentUpdatedAt': null,
  'eventDate': eventDate,
  'readingMinutes': readingMinutes,
  'isFeatured': false,
  'isSponsored': isSponsored,
  'sponsorName': null,
  'isDemo': isDemo,
  'marketCodes': <String>[],
  'shareUrl': 'https://evcar.news/n/$slug',
};

Map<String, dynamic> coverJson({String url = 'https://media.test/a/w1600.webp'}) => {
  'id': 'img-1',
  'url': url,
  'width': 1600,
  'height': 900,
  'variants': [
    {'width': 480, 'height': 270, 'url': 'https://media.test/a/w480.webp'},
    {'width': 960, 'height': 540, 'url': 'https://media.test/a/w960.webp'},
    {'width': 1600, 'height': 900, 'url': url},
  ],
  'alt': 'Test cover alt',
  'caption': 'Test caption',
  'credit': 'Test Photographer',
  'licenseType': 'press_kit',
  'licenseUrl': 'https://license.test/terms',
  'sourceUrl': null,
};

Map<String, dynamic> detailJson({
  String id = '11111111-1111-4111-8111-111111111111',
  String slug = 'test-article',
  String title = 'Test article title',
  String bodyHtml = '<p>First paragraph of the test body.</p><figure><img src="https://media.test/body/w960.webp" alt="Body image" title="Body Credit"></figure><table><tr><th>Col A</th><th>Col B</th></tr><tr><td>1</td><td>2</td></tr></table><p><iframe src="https://www.youtube-nocookie.com/embed/abcDEF12345?start=30"></iframe></p>',
  List<Map<String, dynamic>> corrections = const [],
  String? eventDate = '2026-09-20',
  String language = 'en',
  String requestedLanguage = 'en',
  bool isFallback = false,
  bool marketMatch = true,
  bool isDemo = false,
  String updatedAt = '2026-09-24T12:00:00.000Z',
}) => {
  ...summaryJson(
    id: id,
    slug: slug,
    title: title,
    coverImage: coverJson(),
    eventDate: eventDate,
    language: language,
    requestedLanguage: requestedLanguage,
    isFallback: isFallback,
    isDemo: isDemo,
  ),
  'bodyHtml': bodyHtml,
  'seoTitle': null,
  'seoDescription': null,
  'machineTranslated': false,
  'source': {'name': 'Test Source', 'url': 'https://source.test/item', 'attribution': 'Test attribution text'},
  'corrections': corrections,
  'relatedArticles': [
    summaryJson(id: '22222222-2222-4222-8222-222222222222', slug: 'related-one', title: 'Related test article'),
  ],
  'relatedVehicles': [
    {
      'type': 'model',
      'id': 'model-1',
      'slug': 'test-model',
      'name': 'Test Model',
      'brandName': 'Test Brand',
      'modelSlug': null,
      'modelYear': null,
    },
  ],
  'marketMatch': marketMatch,
  'allowComments': false,
  'updatedAt': updatedAt,
};

Map<String, dynamic> pageJson(List<Map<String, dynamic>> items, {int page = 1, int totalPages = 1}) => {
  'data': items,
  'meta': {'page': page, 'pageSize': 20, 'total': items.length, 'totalPages': totalPages},
};
