import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import '../json/json_readers.dart';
import 'cache_database.dart';
import 'json_cache.dart' show Clock;

/// Well-known saved item types. Features may add their own string values.
abstract final class SavedItemType {
  static const article = 'article';

  /// Full spec sheet of a variant in a market (for offline reading).
  static const carSpecs = 'car_specs';
}

/// Content the user explicitly saved for offline reading (articles, spec
/// sheets). Unlike [JsonCache] entries these are never purged automatically.
class SavedItem {
  const SavedItem({
    required this.type,
    required this.id,
    required this.lang,
    this.market = '',
    required this.title,
    required this.data,
    required this.savedAt,
  });

  final String type;
  final String id;
  final String lang;

  /// Empty for market-independent content.
  final String market;
  final String title;
  final Map<String, dynamic> data;

  /// UTC; shown to the user as "saved on …".
  final DateTime savedAt;
}

abstract interface class SavedItemsStore {
  /// Inserts or replaces; [SavedItem.savedAt] is set to "now".
  Future<SavedItem> save({
    required String type,
    required String id,
    required String lang,
    String market = '',
    required String title,
    required Map<String, dynamic> data,
  });

  Future<SavedItem?> get(String type, String id, {required String lang, String market = ''});
  Future<bool> contains(String type, String id, {required String lang, String market = ''});

  /// Newest first; optionally only one [type].
  Future<List<SavedItem>> list({String? type});
  Future<void> delete(String type, String id, {required String lang, String market = ''});
  Future<void> clear();
}

DateTime _utcNow() => DateTime.now().toUtc();

class SqfliteSavedItemsStore implements SavedItemsStore {
  SqfliteSavedItemsStore(this._database, {Clock? clock}) : _clock = clock ?? _utcNow;

  final CacheDatabase _database;
  final Clock _clock;

  Database get _db => _database.db;

  static const _where = 'item_type = ? AND item_id = ? AND lang = ? AND market = ?';

  @override
  Future<SavedItem> save({
    required String type,
    required String id,
    required String lang,
    String market = '',
    required String title,
    required Map<String, dynamic> data,
  }) async {
    final item = SavedItem(
      type: type,
      id: id,
      lang: lang,
      market: market,
      title: title,
      data: data,
      savedAt: _clock().toUtc(),
    );
    await _db.insert('saved_items', {
      'item_type': type,
      'item_id': id,
      'lang': lang,
      'market': market,
      'title': title,
      'payload': jsonEncode(data),
      'saved_at': item.savedAt.millisecondsSinceEpoch,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
    return item;
  }

  SavedItem _fromRow(Map<String, Object?> row) => SavedItem(
    type: row['item_type']! as String,
    id: row['item_id']! as String,
    lang: row['lang']! as String,
    market: row['market']! as String,
    title: row['title']! as String,
    data: asJsonObject(jsonDecode(row['payload']! as String)),
    savedAt: DateTime.fromMillisecondsSinceEpoch(row['saved_at']! as int, isUtc: true),
  );

  @override
  Future<SavedItem?> get(String type, String id, {required String lang, String market = ''}) async {
    final rows = await _db.query('saved_items', where: _where, whereArgs: [type, id, lang, market], limit: 1);
    return rows.isEmpty ? null : _fromRow(rows.first);
  }

  @override
  Future<bool> contains(String type, String id, {required String lang, String market = ''}) async {
    final rows = await _db.query(
      'saved_items',
      columns: ['item_id'],
      where: _where,
      whereArgs: [type, id, lang, market],
      limit: 1,
    );
    return rows.isNotEmpty;
  }

  @override
  Future<List<SavedItem>> list({String? type}) async {
    final rows = await _db.query(
      'saved_items',
      where: type == null ? null : 'item_type = ?',
      whereArgs: type == null ? null : [type],
      orderBy: 'saved_at DESC',
    );
    return rows.map(_fromRow).toList(growable: false);
  }

  @override
  Future<void> delete(String type, String id, {required String lang, String market = ''}) async {
    await _db.delete('saved_items', where: _where, whereArgs: [type, id, lang, market]);
  }

  @override
  Future<void> clear() async {
    await _db.delete('saved_items');
  }
}

class MemorySavedItemsStore implements SavedItemsStore {
  MemorySavedItemsStore({Clock? clock}) : _clock = clock ?? _utcNow;

  final Clock _clock;
  final Map<String, SavedItem> _items = {};

  static String _k(String type, String id, String lang, String market) => '$type|$id|$lang|$market';

  @override
  Future<SavedItem> save({
    required String type,
    required String id,
    required String lang,
    String market = '',
    required String title,
    required Map<String, dynamic> data,
  }) async {
    final item = SavedItem(
      type: type,
      id: id,
      lang: lang,
      market: market,
      title: title,
      data: asJsonObject(jsonDecode(jsonEncode(data))),
      savedAt: _clock().toUtc(),
    );
    _items[_k(type, id, lang, market)] = item;
    return item;
  }

  @override
  Future<SavedItem?> get(String type, String id, {required String lang, String market = ''}) async =>
      _items[_k(type, id, lang, market)];

  @override
  Future<bool> contains(String type, String id, {required String lang, String market = ''}) async =>
      _items.containsKey(_k(type, id, lang, market));

  @override
  Future<List<SavedItem>> list({String? type}) async {
    final all = _items.values.where((i) => type == null || i.type == type).toList()
      ..sort((a, b) => b.savedAt.compareTo(a.savedAt));
    return all;
  }

  @override
  Future<void> delete(String type, String id, {required String lang, String market = ''}) async {
    _items.remove(_k(type, id, lang, market));
  }

  @override
  Future<void> clear() async => _items.clear();
}
