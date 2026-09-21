import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite_sqlcipher/sqflite.dart';
import 'package:uuid/uuid.dart';

/// قاعدة البيانات المحلية المشفرة.
///
/// مفتاح التشفير يُولَّد مرة واحدة ويُحفظ في التخزين الآمن للجهاز
/// (Keystore على Android)، ولا يُكتب في أي ملف نصي.
class LocalDb {
  static const _keyName = 'fayad.db.key';
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static Database? _db;
  static const _uuid = Uuid();

  static Future<Database> instance() async {
    if (_db != null) return _db!;

    final key = await _encryptionKey();
    final dir = await getApplicationDocumentsDirectory();
    final path = p.join(dir.path, 'fayad_field.db');

    _db = await openDatabase(
      path,
      password: key,
      version: 1,
      onCreate: _createSchema,
      onConfigure: (db) async => db.execute('PRAGMA foreign_keys = ON'),
    );

    return _db!;
  }

  static Future<String> _encryptionKey() async {
    final existing = await _storage.read(key: _keyName);
    if (existing != null) return existing;

    // مفتاح جديد لهذا الجهاز فقط
    final generated = _uuid.v4() + _uuid.v4();
    await _storage.write(key: _keyName, value: generated);
    return generated;
  }

  static Future<void> _createSchema(Database db, int version) async {
    // --- صف العمليات: يُكتب قبل أي محاولة إرسال، فلا يضيع شيء ---
    await db.execute('''
      CREATE TABLE outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL UNIQUE,
        idempotency_key TEXT NOT NULL UNIQUE,
        device_seq INTEGER NOT NULL,
        op_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        field_no TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        server_doc_no TEXT,
        server_doc_id INTEGER,
        error_code TEXT,
        error_message TEXT,
        conflict_details TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        synced_at TEXT
      )
    ''');

    await db.execute('CREATE INDEX idx_outbox_status ON outbox(status)');

    // --- البيانات المرجعية المسحوبة من الخادم ---
    await db.execute('''
      CREATE TABLE customers (
        id INTEGER PRIMARY KEY,
        code TEXT, name TEXT, phone TEXT, address TEXT,
        latitude REAL, longitude REAL,
        price_list_id INTEGER,
        credit_limit TEXT, payment_term_days INTEGER,
        is_blocked INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT
      )
    ''');

    await db.execute('''
      CREATE TABLE items (
        id INTEGER PRIMARY KEY,
        code TEXT, name_ar TEXT,
        base_uom_id INTEGER,
        track_batches INTEGER NOT NULL DEFAULT 0,
        track_expiry INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT
      )
    ''');

    await db.execute('''
      CREATE TABLE item_uoms (
        id INTEGER PRIMARY KEY,
        item_id INTEGER NOT NULL,
        uom_id INTEGER NOT NULL,
        factor TEXT NOT NULL,
        is_base INTEGER NOT NULL DEFAULT 0
      )
    ''');

    // الأسعار مع إصدارها — لا نفاجئ العميل بتغيير فاتورة مسلمة
    await db.execute('''
      CREATE TABLE prices (
        id INTEGER PRIMARY KEY,
        price_list_id INTEGER, item_id INTEGER, uom_id INTEGER,
        min_qty TEXT, price TEXT, max_discount_pct TEXT
      )
    ''');

    await db.execute('''
      CREATE TABLE van_stock (
        item_id INTEGER NOT NULL,
        warehouse_id INTEGER NOT NULL,
        batch_id INTEGER,
        qty_base TEXT NOT NULL,
        PRIMARY KEY (item_id, warehouse_id, batch_id)
      )
    ''');

    // --- الحصص المخصصة لهذا الجهاز ---
    await db.execute('''
      CREATE TABLE stock_quotas (
        item_id INTEGER NOT NULL,
        warehouse_id INTEGER NOT NULL,
        qty_base TEXT NOT NULL,
        consumed_qty_base TEXT NOT NULL DEFAULT '0',
        expires_at TEXT,
        PRIMARY KEY (item_id, warehouse_id)
      )
    ''');

    await db.execute('''
      CREATE TABLE credit_quotas (
        customer_id INTEGER PRIMARY KEY,
        amount TEXT NOT NULL,
        consumed_amount TEXT NOT NULL DEFAULT '0',
        expires_at TEXT
      )
    ''');

    // --- حالة المزامنة والجهاز ---
    await db.execute('''
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    ''');
  }

  static Future<String?> state(String key) async {
    final db = await instance();
    final rows = await db.query('sync_state', where: 'key = ?', whereArgs: [key], limit: 1);
    return rows.isEmpty ? null : rows.first['value'] as String?;
  }

  static Future<void> setState(String key, String value) async {
    final db = await instance();
    await db.insert('sync_state', {'key': key, 'value': value},
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  /// تسلسل الجهاز — يضمن ترتيب العمليات المرتبطة بغض النظر عن ترتيب وصول الشبكة.
  static Future<int> nextSeq() async {
    final current = int.tryParse(await state('device_seq') ?? '0') ?? 0;
    final next = current + 1;
    await setState('device_seq', next.toString());
    return next;
  }

  /// إدراج عملية في الصف. المفاتيح تُولَّد **مرة واحدة** هنا ولا تتغيّر
  /// مهما تكررت محاولات الإرسال — هذا أساس ضمان عدم التكرار.
  static Future<String> enqueue({
    required String opType,
    required Map<String, dynamic> payload,
    String? fieldNo,
  }) async {
    final db = await instance();
    final uuid = _uuid.v4();
    final seq = await nextSeq();

    await db.insert('outbox', {
      'uuid': uuid,
      'idempotency_key': '${opType.toUpperCase()}-$uuid',
      'device_seq': seq,
      'op_type': opType,
      'payload': jsonEncode(payload),
      'field_no': fieldNo,
      'status': 'pending',
      'created_at': DateTime.now().toIso8601String(),
    });

    return uuid;
  }

  static Future<List<Map<String, dynamic>>> pendingOperations({int limit = 50}) async {
    final db = await instance();
    return db.query(
      'outbox',
      where: "status IN ('pending', 'failed')",
      orderBy: 'device_seq ASC',
      limit: limit,
    );
  }

  static Future<Map<String, int>> queueCounts() async {
    final db = await instance();
    final rows = await db.rawQuery(
      'SELECT status, COUNT(*) AS c FROM outbox GROUP BY status',
    );

    final counts = <String, int>{};
    for (final row in rows) {
      counts[row['status'] as String] = row['c'] as int;
    }
    return counts;
  }
}
