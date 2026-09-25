import '../api/api_exception.dart';
import 'json_cache.dart';

/// Result of [fetchWithCache]: the data plus where it came from.
class CachedResult<T> {
  const CachedResult({required this.data, required this.savedAt, required this.fromCache});

  final T data;

  /// When the data was fetched/stored (UTC).
  final DateTime savedAt;

  /// True when the network failed and this is an older saved copy. UIs must
  /// then show a "saved data from `savedAt`" notice (CachedDataNotice) and
  /// never present it as live.
  final bool fromCache;
}

/// Network-first fetch that falls back to the last cached copy when the
/// network is unavailable (connectivity problem, timeout or 5xx).
///
/// The raw JSON is cached only after [parse] succeeded, so a malformed
/// response never overwrites a good cached copy. Errors that are not
/// connectivity-related (404, 422, …) are rethrown without fallback.
Future<CachedResult<T>> fetchWithCache<T>({
  required JsonCache cache,
  required String key,
  required Future<Object?> Function() fetch,
  required T Function(Object? json) parse,
  Duration? maxStale,
  DateTime Function()? clock,
}) async {
  final now = clock ?? () => DateTime.now().toUtc();
  try {
    final json = await fetch();
    final data = parse(json);
    await cache.put(key, json);
    return CachedResult(data: data, savedAt: now().toUtc(), fromCache: false);
  } on ApiException catch (e) {
    final fallbackAllowed = e.isConnectivityProblem || e.kind == ApiErrorKind.server;
    if (!fallbackAllowed) rethrow;
    final cached = await cache.get(key);
    if (cached == null) rethrow;
    if (maxStale != null && cached.ageAt(now()) > maxStale) rethrow;
    return CachedResult(data: parse(cached.data), savedAt: cached.savedAt, fromCache: true);
  }
}
