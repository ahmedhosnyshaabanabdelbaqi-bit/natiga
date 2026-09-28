import '../../../core/api/api_client.dart';
import '../../../core/api/interceptors/request_headers_interceptor.dart';
import '../../../core/api/paged.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../core/cache/json_cache.dart';
import '../../../core/json/json_readers.dart';
import '../../../shared/compare_tray.dart';
import '../domain/comparison_models.dart';
import '../domain/picker_models.dart';
import '../domain/recommendation_models.dart';

/// Body item of every comparisons request: trim + model year + market
/// (all mandatory, REQUIREMENTS §7).
Map<String, Object> comparisonItemJson(CompareSelection s) => {
  'variantId': s.variantId,
  'modelYear': s.modelYear,
  'market': s.marketCode.toUpperCase(),
};

/// Stable signature of an ordered list of tray items (cache keys).
String comparisonSignature(List<CompareSelection> items) =>
    items.map((s) => '${s.variantId}@${s.marketCode.toUpperCase()}/${s.modelYear}').join(',');

/// Comparisons, pickers and recommendations endpoints
/// (`docs/decisions/backend-comparisons.md`, `backend-vehicles.md` §1).
///
/// Read endpoints are network-first with the JSON cache as an offline
/// fallback; the UI labels cached copies with their date.
class CompareRepository {
  CompareRepository({required this._api, required this._cache, required this._locale});

  final ApiClient _api;
  final JsonCache _cache;
  final RequestLocale Function() _locale;

  String _key(String path, {String? variant}) {
    final l = _locale();
    return JsonCache.key(path, lang: l.languageCode, market: l.marketCode, variant: variant);
  }

  static String _seg(String s) => Uri.encodeComponent(s);

  /// `POST /comparisons/compute` — always the detailed view (the app filters
  /// summary / differences-only locally from `isKey` / `isDifferent`).
  Future<CachedResult<ComparisonData>> compute(List<CompareSelection> items) => fetchWithCache(
    cache: _cache,
    key: _key('/comparisons/compute', variant: comparisonSignature(items)),
    fetch: () => _api.postData(
      '/comparisons/compute',
      (d) => d,
      body: {
        'items': [for (final s in items) comparisonItemJson(s)],
        'view': 'detailed',
        'differencesOnly': false,
      },
    ),
    parse: ComparisonData.fromData,
  );

  /// `POST /comparisons`: signed in → saved in the account (+ share link);
  /// guest → anonymous share link. An identical comparison is reused.
  Future<SavedComparison> create(List<CompareSelection> items, {String? title}) => _api.postData(
    '/comparisons',
    SavedComparison.fromData,
    body: {
      'items': [for (final s in items) comparisonItemJson(s)],
      if (title != null && title.trim().isNotEmpty) 'title': title.trim(),
    },
  );

  /// `GET /comparisons/s/:shareId` (shared, curated or saved).
  Future<CachedResult<SharedComparison>> shared(String shareId) => fetchWithCache(
    cache: _cache,
    key: _key('/comparisons/s/$shareId'),
    fetch: () => _api.getData('/comparisons/s/${_seg(shareId)}', (d) => d),
    parse: SharedComparison.fromData,
  );

  /// `GET /comparisons/featured` (curated, published, request market).
  Future<CachedResult<List<SavedComparison>>> featured({int limit = 6}) => fetchWithCache(
    cache: _cache,
    key: _key('/comparisons/featured', variant: 'limit=$limit'),
    fetch: () => _api.getJson('/comparisons/featured', query: {'limit': limit}),
    parse: (j) {
      final data = ApiClient.unwrapData(j);
      if (data is! List) throw const FormatException('Expected data[]');
      return [for (final c in data) ?SavedComparison.tryParse(c)];
    },
  );

  /// `GET /me/comparisons` (signed in; newest first).
  Future<Paged<SavedComparison>> mine({int page = 1, int pageSize = 50}) =>
      _api.getPage('/me/comparisons', (j) => SavedComparison.fromData(j), query: {'page': page, 'pageSize': pageSize});

  Future<void> deleteMine(String id) => _api.send('DELETE', '/me/comparisons/${_seg(id)}');

  Future<SavedComparison> renameMine(String id, String? title) => _api.patchData(
    '/me/comparisons/${_seg(id)}',
    SavedComparison.fromData,
    body: {'title': (title == null || title.trim().isEmpty) ? null : title.trim()},
  );

  /// `GET /cars/pickers` (cascade brand → model → year → trim → market).
  Future<CachedResult<PickerPage>> pickers(PickerQuery query) => fetchWithCache(
    cache: _cache,
    key: _key('/cars/pickers', variant: query.cacheKey),
    fetch: () => _api.getJson('/cars/pickers', query: query.toQueryParameters()),
    parse: (j) => PickerPage.fromData(ApiClient.unwrapData(j), expected: query.level),
  );

  /// `POST /recommendations` (nothing is stored on the server).
  Future<RecommendationResult> recommend(RecommendationInput input) =>
      _api.postData('/recommendations', RecommendationResult.fromData, body: input.toJson());
}

/// Reads `details.constraints` messages of a validation error (for forms).
List<String> validationMessages(Object? details) {
  if (details is! List) return const [];
  return [
    for (final d in details)
      if (d is Map)
        for (final m in (asJsonObject(d).objectOrNull('constraints')?.values ?? const <Object?>[]))
          if (m is String) m,
  ];
}
