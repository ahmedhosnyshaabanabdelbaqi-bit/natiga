import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/api/interceptors/request_headers_interceptor.dart';
import '../../../core/api/paged.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../core/cache/json_cache.dart';
import '../../../core/cache/saved_items_store.dart';
import '../../../core/json/json_readers.dart';
import '../domain/cars_query.dart';
import '../domain/catalog_models.dart';
import '../domain/variant_sheet.dart';

/// One page of catalog cards.
class CarsPage {
  const CarsPage({required this.items, required this.meta, this.currencyCode, this.marketCode});

  final List<CarSummary> items;
  final PageMeta meta;
  final String? currencyCode;
  final String? marketCode;

  bool get hasMore => meta.hasMore;
}

CarsPage parseCarsPage(Object? body) {
  if (body is! Map) throw const FormatException('Expected a list envelope');
  final json = asJsonObject(body);
  final data = json['data'];
  if (data is! List) throw const FormatException('Expected data[]');
  final meta = json.objectOrNull('meta');
  return CarsPage(
    items: [for (final c in data) ?CarSummary.tryParse(c)],
    meta: PageMeta.fromJson(meta),
    currencyCode: meta?.stringOrNull('currencyCode'),
    marketCode: meta?.stringOrNull('marketCode'),
  );
}

List<BrandSummary> parseBrands(Object? body) {
  final data = ApiClient.unwrapData(body);
  if (data is! List) throw const FormatException('Expected data[]');
  return [for (final b in data) ?BrandSummary.tryParse(b)];
}

/// Where a spec sheet on screen comes from.
enum SheetOrigin {
  /// Fresh from the server.
  live,

  /// Last automatic cache (offline).
  cache,

  /// Copy the user saved for offline reading.
  saved,
}

/// A spec sheet plus its raw JSON (kept so it can be saved offline as-is).
class VariantView {
  const VariantView({required this.sheet, required this.raw, required this.origin, this.savedAt});

  final VariantSheet sheet;
  final Map<String, dynamic> raw;
  final SheetOrigin origin;

  /// When the copy was stored (non-live origins).
  final DateTime? savedAt;

  bool get isOfflineCopy => origin != SheetOrigin.live;
}

/// Public catalog endpoints (guests allowed). Language + market are sent as
/// headers by Dio; the car / trim pages pass an explicit `market` query
/// parameter because the user may pick another market on that page.
class CarsRepository {
  CarsRepository({required this._api, required this._cache, required this._saved, required this._locale});

  final ApiClient _api;
  final JsonCache _cache;
  final SavedItemsStore _saved;
  final RequestLocale Function() _locale;

  static const pageSize = 20;

  String _key(String path, {String? market, String? variant}) {
    final l = _locale();
    return JsonCache.key(path, lang: l.languageCode, market: market ?? l.marketCode, variant: variant);
  }

  static String _seg(String s) => Uri.encodeComponent(s);

  /// `GET /cars` — the first page is cached for offline use.
  Future<CachedResult<CarsPage>> carsPage(CarsQuery query, {int page = 1}) {
    Future<Object?> fetch() => _api.getJson(
      '/cars',
      query: query.toQueryParameters(page: page, pageSize: pageSize),
    );
    if (page > 1) {
      return fetch().then(
        (j) => CachedResult(data: parseCarsPage(j), savedAt: DateTime.now().toUtc(), fromCache: false),
      );
    }
    return fetchWithCache(
      cache: _cache,
      key: _key('/cars', variant: query.cacheKey),
      fetch: fetch,
      parse: parseCarsPage,
    );
  }

  /// `GET /brands` (all brands, marked when they have no car in the market).
  Future<CachedResult<List<BrandSummary>>> brands({bool? hasCars}) => fetchWithCache(
    cache: _cache,
    key: _key('/brands', variant: 'hasCars=$hasCars'),
    fetch: () => _api.getJson('/brands', query: {'pageSize': 100, 'hasCars': ?hasCars}),
    parse: parseBrands,
  );

  Future<CachedResult<BrandDetail>> brand(String slug) => fetchWithCache(
    cache: _cache,
    key: _key('/brands/$slug'),
    fetch: () => _api.getJson('/brands/${_seg(slug)}'),
    parse: (j) => BrandDetail.fromData(ApiClient.unwrapData(j)),
  );

  /// Model page in [market] (null = the app's market).
  Future<CachedResult<CarDetail>> car(String slug, {String? market}) => fetchWithCache(
    cache: _cache,
    key: _key('/cars/$slug', market: market),
    fetch: () => _api.getJson('/cars/${_seg(slug)}', query: {'market': ?market}),
    parse: (j) => CarDetail.fromData(ApiClient.unwrapData(j)),
  );

  /// Spec sheet of a trim (id or slug) in [market]: network → automatic
  /// cache → the copy the user saved for offline reading.
  Future<VariantView> variant(String idOrSlug, {String? market}) async {
    final m = market ?? _locale().marketCode;
    try {
      final res = await fetchWithCache(
        cache: _cache,
        key: _key('/variants/$idOrSlug', market: m),
        fetch: () => _api.getJson('/variants/${_seg(idOrSlug)}', query: {'market': m}),
        parse: (j) => asJsonObject(ApiClient.unwrapData(j), 'variant'),
      );
      return VariantView(
        sheet: VariantSheet.fromData(res.data),
        raw: res.data,
        origin: res.fromCache ? SheetOrigin.cache : SheetOrigin.live,
        savedAt: res.fromCache ? res.savedAt : null,
      );
    } on ApiException catch (e) {
      if (!(e.isConnectivityProblem || e.kind == ApiErrorKind.server)) rethrow;
      final saved = await savedSheet(idOrSlug, market: m);
      if (saved == null) rethrow;
      return saved;
    }
  }

  /// The offline copy of a trim (matched by id or slug), if any.
  Future<VariantView?> savedSheet(String idOrSlug, {required String market}) async {
    final lang = _locale().languageCode;
    for (final item in await _saved.list(type: SavedItemType.carSpecs)) {
      if (item.lang != lang || item.market != market) continue;
      if (item.id != idOrSlug && item.data['slug'] != idOrSlug) continue;
      try {
        return VariantView(
          sheet: VariantSheet.fromData(item.data),
          raw: item.data,
          origin: SheetOrigin.saved,
          savedAt: item.savedAt,
        );
      } on FormatException {
        return null;
      }
    }
    return null;
  }

  /// Saves the sheet for offline reading (type `car_specs`, id = variant id,
  /// key includes language + market). Returns the save time.
  Future<DateTime> saveSheet(VariantView view) async {
    final item = await _saved.save(
      type: SavedItemType.carSpecs,
      id: view.sheet.id,
      lang: _locale().languageCode,
      market: view.sheet.market.code,
      title: view.sheet.title,
      data: view.raw,
    );
    return item.savedAt;
  }

  Future<void> removeSavedSheet(String variantId, {required String market}) =>
      _saved.delete(SavedItemType.carSpecs, variantId, lang: _locale().languageCode, market: market);

  Future<DateTime?> savedAt(String variantId, {required String market}) async {
    final item = await _saved.get(SavedItemType.carSpecs, variantId, lang: _locale().languageCode, market: market);
    return item?.savedAt;
  }

  /// `GET /community/reviews/summary?variantId=`.
  Future<ReviewsSummary> reviewsSummary(String variantId) =>
      _api.getData('/community/reviews/summary', ReviewsSummary.fromData, query: {'variantId': variantId});

  /// Most helpful public reviews (preview on the car page).
  Future<List<ReviewPreview>> topReviews(String variantId, {int count = 3}) async {
    final page = await _api.getPage(
      '/community/reviews',
      (j) => ReviewPreview.tryParse(j),
      query: {'variantId': variantId, 'sort': 'helpful', 'pageSize': count},
    );
    return page.items.whereType<ReviewPreview>().toList();
  }
}

final carsRepositoryProvider = Provider<CarsRepository>(
  (ref) => CarsRepository(
    api: ref.watch(apiClientProvider),
    cache: ref.watch(jsonCacheProvider),
    saved: ref.watch(savedItemsStoreProvider),
    locale: () => ref.read(requestLocaleProvider),
  ),
);
