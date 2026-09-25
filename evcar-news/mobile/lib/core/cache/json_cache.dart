import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import 'cache_database.dart';

/// A cached JSON value and when it was stored.
class CachedJson {
  const CachedJson({required this.data, required this.savedAt, this.etag});

  final Object? data;

  /// UTC time the value was written. Always show it to the user when
  /// displaying cached data (e.g. "saved 2 h ago"); cached data is never
  /// presented as live (REQUIREMENTS §19).
  final DateTime savedAt;
  final String? etag;

  Duration ageAt(DateTime now) => now.toUtc().difference(savedAt);
}

/// Key-value store for API JSON responses.
///
/// Build keys with [JsonCache.key] so language and market are part of the key
/// (the same endpoint returns different content per language/market).
abstract interface class JsonCache {
  Future<void> put(String key, Object? data, {String? etag});
  Future<CachedJson?> get(String key);
  Future<void> remove(String key);

  /// Deletes every cached response (saved items are kept).
  Future<void> clear();

  /// Deletes entries older than [age]; returns how many were removed.
  Future<int> purgeOlderThan(Duration age);

  /// `path` + language + market (+ optional discriminator).
  static String key(String path, {required String lang, String? market, String? variant}) =>
      [path, 'lang=$lang', if (market != null) 'market=$market', ?variant].join('|');
}

typedef Clock = DateTime Function();

DateTime _utcNow() => DateTime.now().toUtc();

class SqfliteJsonCache implements JsonCache {
  SqfliteJsonCache(this._database, {Clock? clock}) : _clock = clock ?? _utcNow;

  final CacheDatabase _database;
  final Clock _clock;

  Database get _db => _database.db;

  @override
  Future<void> put(String key, Object? data, {String? etag}) async {
    await _db.insert('json_cache', {
      'cache_key': key,
      'payload': jsonEncode(data),
      'saved_at': _clock().toUtc().millisecondsSinceEpoch,
      'etag': etag,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  @override
  Future<CachedJson?> get(String key) async {
    final rows = await _db.query('json_cache', where: 'cache_key = ?', whereArgs: [key], limit: 1);
    if (rows.isEmpty) return null;
    final row = rows.first;
    try {
      return CachedJson(
        data: jsonDecode(row['payload']! as String),
        savedAt: DateTime.fromMillisecondsSinceEpoch(row['saved_at']! as int, isUtc: true),
        etag: row['etag'] as String?,
      );
    } on FormatException {
      await remove(key);
      return null;
    }
  }

  @override
  Future<void> remove(String key) async {
    await _db.delete('json_cache', where: 'cache_key = ?', whereArgs: [key]);
  }

  @override
  Future<void> clear() async {
    await _db.delete('json_cache');
  }

  @override
  Future<int> purgeOlderThan(Duration age) {
    final cutoff = _clock().toUtc().subtract(age).millisecondsSinceEpoch;
    return _db.delete('json_cache', where: 'saved_at < ?', whereArgs: [cutoff]);
  }
}

/// In-memory implementation (tests, previews, and fallback when the SQLite
/// database cannot be opened).
class MemoryJsonCache implements JsonCache {
  MemoryJsonCache({Clock? clock}) : _clock = clock ?? _utcNow;

  final Clock _clock;
  final Map<String, CachedJson> _entries = {};

  @override
  Future<void> put(String key, Object? data, {String? etag}) async {
    // Round-trip through JSON so callers get the same types as with SQLite.
    _entries[key] = CachedJson(data: jsonDecode(jsonEncode(data)), savedAt: _clock().toUtc(), etag: etag);
  }

  @override
  Future<CachedJson?> get(String key) async => _entries[key];

  @override
  Future<void> remove(String key) async => _entries.remove(key);

  @override
  Future<void> clear() async => _entries.clear();

  @override
  Future<int> purgeOlderThan(Duration age) async {
    final cutoff = _clock().toUtc().subtract(age);
    final old = _entries.entries.where((e) => e.value.savedAt.isBefore(cutoff)).map((e) => e.key).toList();
    old.forEach(_entries.remove);
    return old.length;
  }
}
