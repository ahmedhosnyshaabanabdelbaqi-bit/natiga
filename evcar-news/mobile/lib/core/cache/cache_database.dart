import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// The app's local SQLite database (offline cache + saved items).
///
/// Schema changes: bump [version] and append a step to [_migrations]; never
/// edit an existing step. Features that only need cached API JSON should use
/// [JsonCache] / [SavedItemsStore] instead of adding tables.
class CacheDatabase {
  CacheDatabase._(this.db);

  final Database db;

  static const fileName = 'evcar_cache.db';
  static const version = 1;

  /// `_migrations[i]` upgrades from version `i + 1` to `i + 2`… except index 0,
  /// which creates version 1.
  static final List<Future<void> Function(DatabaseExecutor db)> _migrations = [
    (db) async {
      await db.execute('''
        CREATE TABLE json_cache (
          cache_key TEXT PRIMARY KEY NOT NULL,
          payload TEXT NOT NULL,
          saved_at INTEGER NOT NULL,
          etag TEXT
        )''');
      await db.execute('CREATE INDEX idx_json_cache_saved_at ON json_cache(saved_at)');
      await db.execute('''
        CREATE TABLE saved_items (
          item_type TEXT NOT NULL,
          item_id TEXT NOT NULL,
          lang TEXT NOT NULL,
          market TEXT NOT NULL DEFAULT '',
          title TEXT NOT NULL,
          payload TEXT NOT NULL,
          saved_at INTEGER NOT NULL,
          PRIMARY KEY (item_type, item_id, lang, market)
        )''');
      await db.execute('CREATE INDEX idx_saved_items_type_saved_at ON saved_items(item_type, saved_at)');
    },
  ];

  /// Opens (and creates/migrates) the database.
  ///
  /// [factory] and [path] are injectable for tests
  /// (`databaseFactoryFfi` + `inMemoryDatabasePath`).
  static Future<CacheDatabase> open({DatabaseFactory? factory, String? path}) async {
    final f = factory ?? databaseFactory;
    final dbPath = path ?? p.join(await f.getDatabasesPath(), fileName);
    final db = await f.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: version,
        onCreate: (db, v) async {
          for (var i = 0; i < v; i++) {
            await _migrations[i](db);
          }
        },
        onUpgrade: (db, from, to) async {
          for (var i = from; i < to; i++) {
            await _migrations[i](db);
          }
        },
      ),
    );
    return CacheDatabase._(db);
  }

  Future<void> close() => db.close();
}
