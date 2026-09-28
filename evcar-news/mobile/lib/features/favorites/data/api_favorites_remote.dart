import '../../../app/router/app_routes.dart';
import '../../../core/api/api_client.dart';
import '../../../core/json/json_readers.dart';
import '../../../shared/favorites/favorite_item.dart';
import '../../../shared/favorites/favorites_repository.dart';

/// App route of a server favorite (`FavoriteView`), or null when the view
/// carries too little to build one (tours need their car's slug, which the
/// view does not have: the device snapshot's route is kept instead).
String? favoriteRouteFor(FavoriteType type, {required String id, String? slug, String? shareId}) => switch (type) {
  FavoriteType.article when slug != null => AppRoutes.article(slug),
  FavoriteType.model when slug != null => AppRoutes.car(slug),
  FavoriteType.variant when slug != null => AppRoutes.variant(slug),
  FavoriteType.station => AppRoutes.station(id),
  FavoriteType.comparison when shareId != null => AppRoutes.sharedComparison(shareId),
  _ => null,
};

/// Parses one `FavoriteView` (backend-discovery §3); null when malformed.
FavoriteItem? parseFavoriteView(Map<String, dynamic> j) {
  final type = FavoriteType.fromApi(j.stringOrNull('type'));
  final id = j.stringOrNull('id');
  if (type == null || id == null || id.isEmpty) return null;
  final title = j.stringOrNull('title')?.trim();
  final slug = j.stringOrNull('slug');
  return FavoriteItem(
    key: FavoriteKey(type, id),
    title: (title == null || title.isEmpty) ? (slug ?? id) : title,
    subtitle: j.stringOrNull('subtitle'),
    imageUrl: j.stringOrNull('imageUrl'),
    route: favoriteRouteFor(type, id: id, slug: slug, shareId: j.stringOrNull('shareId')),
    savedAt: j.dateTimeOrNull('savedAt'),
    localOnly: false,
    available: j.boolOr('available', true),
    isDemo: j.boolOr('isDemo', false),
  );
}

/// `/me/favorites` for the signed-in user (every call is scoped to the
/// caller by the server).
class ApiFavoritesRemote implements FavoritesRemote {
  ApiFavoritesRemote(this.api);

  final ApiClient api;

  static const pageSize = 100;

  /// The server keeps at most 1000 favorites per user.
  static const maxPages = 10;

  /// `POST /me/favorites/merge` accepts at most 200 items per call.
  static const mergeBatch = 200;

  String _path(FavoriteKey key) => '/me/favorites/${key.type.apiValue}/${Uri.encodeComponent(key.id)}';

  @override
  Future<List<FavoriteItem>> fetchAll() async {
    final out = <FavoriteItem>[];
    for (var page = 1; page <= maxPages; page++) {
      final res = await api.getPage(
        '/me/favorites',
        (j) => parseFavoriteView(j),
        query: {'page': page, 'pageSize': pageSize},
      );
      out.addAll([for (final i in res.items) ?i]);
      if (!res.meta.hasMore || res.items.isEmpty) break;
    }
    return out;
  }

  @override
  Future<void> add(FavoriteItem item) => api.send('PUT', _path(item.key));

  @override
  Future<void> remove(FavoriteKey key) => api.send('DELETE', _path(key));

  @override
  Future<FavoritesMergeResult> merge(List<FavoriteItem> items) async {
    var added = 0;
    var already = 0;
    final skipped = <FavoriteKey, MergeSkipReason>{};
    for (var i = 0; i < items.length; i += mergeBatch) {
      final batch = items.skip(i).take(mergeBatch).toList();
      final data = await api.postData(
        '/me/favorites/merge',
        (d) => asJsonObject(d, 'merge'),
        body: {
          'items': [
            for (final f in batch)
              {'type': f.key.type.apiValue, 'id': f.key.id, if (f.savedAt != null) 'savedAt': f.savedAt!.toUtc().toIso8601String()},
          ],
        },
      );
      added += data.intOrNull('added') ?? 0;
      already += data.intOrNull('alreadyPresent') ?? 0;
      for (final s in (data['skipped'] is List ? data['skipped'] as List : const [])) {
        if (s is! Map) continue;
        final type = FavoriteType.fromApi(s['type'] as String?);
        final id = s['id'];
        if (type == null || id is! String) continue;
        skipped[FavoriteKey(type, id)] = s['reason'] == 'limit_reached' ? MergeSkipReason.limitReached : MergeSkipReason.notFound;
      }
    }
    return FavoritesMergeResult(added: added, alreadyPresent: already, skipped: skipped);
  }
}
