import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_client.dart';
import '../../../core/settings/settings_controller.dart';
import '../domain/search_models.dart';

/// `GET /search`, `GET /search/suggest` (public, rate limited). Results are
/// not cached offline: a search needs the network (the screen says so).
class SearchRepository {
  SearchRepository(this.api);

  final ApiClient api;

  static const maxQueryLength = 100;

  Future<SearchResults> search(String q, {List<String>? types, int limit = 5, int page = 1, CancelToken? cancel}) =>
      api.getData(
        '/search',
        SearchResults.fromData,
        query: {'q': q, if (types != null && types.isNotEmpty) 'types': types.join(','), 'limit': limit, 'page': page},
        cancelToken: cancel,
      );

  Future<List<SearchSuggestion>> suggest(String q, {int limit = 8, CancelToken? cancel}) async {
    final page = await api.getPage(
      '/search/suggest',
      (j) => SearchSuggestion.tryParse(j),
      query: {'q': q, 'limit': limit},
      cancelToken: cancel,
    );
    return [for (final s in page.items) ?s];
  }
}

/// Whether [q] is worth sending: 1..100 chars with a letter or digit (the
/// server answers 422 otherwise).
bool isSearchableQuery(String q) {
  final t = q.trim();
  return t.isNotEmpty &&
      t.length <= SearchRepository.maxQueryLength &&
      RegExp(r'[\p{L}\p{N}]', unicode: true).hasMatch(t);
}

final searchRepositoryProvider = Provider<SearchRepository>((ref) => SearchRepository(ref.watch(apiClientProvider)));

/// Recent searches, on this device only (never sent to the server), newest
/// first, at most [maxItems], clearable one by one or all at once.
class RecentSearchesStore {
  RecentSearchesStore(this._prefs);

  static const storageKey = 'search.recent.v1';
  static const maxItems = 10;

  final SharedPreferences _prefs;

  List<String> read() {
    final raw = _prefs.getString(storageKey);
    if (raw == null) return const [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return [
        for (final e in decoded)
          if (e is String && e.trim().isNotEmpty) e,
      ].take(maxItems).toList(growable: false);
    } on FormatException {
      return const [];
    }
  }

  Future<void> write(List<String> items) => _prefs.setString(storageKey, jsonEncode(items));

  Future<void> clear() => _prefs.remove(storageKey);
}

final recentSearchesStoreProvider = Provider<RecentSearchesStore>(
  (ref) => RecentSearchesStore(ref.watch(sharedPreferencesProvider)),
);
