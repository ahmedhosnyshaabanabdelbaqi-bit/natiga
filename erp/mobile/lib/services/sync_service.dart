import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:sqflite_sqlcipher/sqflite.dart';
import 'package:uuid/uuid.dart';

import 'decimal.dart';
import 'local_db.dart';

/// The device half of the sync contract.
///
/// Rules this class exists to hold, matching the server's tested behaviour:
///
///  * Every field action is queued as an OPERATION with a client UUID and an
///    idempotency key. It is never sent as a finished result.
///  * An operation stays queued until the server acknowledges it. A lost
///    response is retried with the SAME key, and the server returns the
///    original receipt rather than creating a second document.
///  * Operations are sent in client sequence order, and an operation that
///    depends on another carries `depends_on`, so a flaky network cannot
///    reorder a return ahead of the sale it belongs to.
///  * A rejection or conflict is surfaced to the rep with its reason. Nothing
///    is silently dropped, and the queued operation is preserved.
class SyncService {
  SyncService({required Dio dio, required this.deviceUid}) : _dio = dio;

  final Dio _dio;
  final String deviceUid;
  static const _uuid = Uuid();

  /// Queue an operation. This is the ONLY way the app records field work.
  Future<String> enqueue({
    required String opType,
    required Map<String, dynamic> payload,
    String? dependsOn,
  }) async {
    final db = await _database();
    final id = _uuid.v4();

    final nextSeq = Sqflite.firstIntValue(
          await db.rawQuery('SELECT COALESCE(MAX(client_seq), 0) + 1 FROM operations'),
        ) ??
        1;

    await db.insert('operations', {
      'id': id,
      // The UUID doubles as the idempotency key: one action, one key, forever.
      'idempotency_key': id,
      'client_seq': nextSeq,
      'op_type': opType,
      'payload': jsonEncode(payload),
      'depends_on': dependsOn,
      'status': 'queued',
      'client_created_at': DateTime.now().toUtc().toIso8601String(),
    });

    return id;
  }

  /// Send everything outstanding and record each receipt.
  ///
  /// Safe to call as often as you like: a re-sent operation is recognised by
  /// its key and returns the original outcome.
  Future<SyncResult> push() async {
    final db = await _database();

    final rows = await db.query(
      'operations',
      where: 'status IN (?, ?, ?)',
      whereArgs: ['queued', 'sent', 'pending'],
      orderBy: 'client_seq ASC',
      limit: 200,
    );

    if (rows.isEmpty) {
      return const SyncResult(applied: 0, rejected: 0, conflicts: 0, pending: 0);
    }

    final operations = rows
        .map((row) => {
              'id': row['id'],
              'idempotency_key': row['idempotency_key'],
              'client_seq': row['client_seq'],
              'op_type': row['op_type'],
              'payload': jsonDecode(row['payload'] as String),
              'depends_on': row['depends_on'],
              'client_created_at': row['client_created_at'],
            })
        .toList();

    await db.update(
      'operations',
      {'status': 'sent', 'last_attempt_at': DateTime.now().toUtc().toIso8601String()},
      where: 'id IN (${List.filled(rows.length, '?').join(',')})',
      whereArgs: rows.map((row) => row['id']).toList(),
    );

    final Response<Map<String, dynamic>> response;
    try {
      response = await _dio.post<Map<String, dynamic>>(
        '/sync/push',
        data: {'device_uid': deviceUid, 'operations': operations},
      );
    } on DioException {
      // The request never completed. The operations stay queued with the same
      // keys, so the retry is safe — this is the case idempotency exists for.
      await db.update(
        'operations',
        {'status': 'queued', 'attempts': rows.length},
        where: 'status = ?',
        whereArgs: ['sent'],
      );
      rethrow;
    }

    final receipts = (response.data?['receipts'] as List?) ?? const [];
    var applied = 0, rejected = 0, conflicts = 0, pending = 0;

    for (final receipt in receipts.cast<Map<String, dynamic>>()) {
      final status = receipt['status'] as String? ?? 'pending';

      switch (status) {
        case 'applied':
          applied++;
        case 'rejected':
          rejected++;
        case 'conflict':
          conflicts++;
        default:
          pending++;
      }

      await db.update(
        'operations',
        {
          'status': status,
          'server_doc_type': receipt['doc_type'],
          'server_doc_id': receipt['doc_id'],
          'server_doc_code': receipt['doc_code'],
          'error_code': receipt['error_code'],
          'error_message': receipt['error_message'],
          'acknowledged_at': DateTime.now().toUtc().toIso8601String(),
        },
        where: 'idempotency_key = ?',
        whereArgs: [receipt['idempotency_key']],
      );
    }

    return SyncResult(
      applied: applied,
      rejected: rejected,
      conflicts: conflicts,
      pending: pending,
    );
  }

  /// Refresh the working set. Incremental: only what changed since the last pull.
  Future<void> pull() async {
    final db = await _database();
    final since = await LocalDb.instance.meta('sync.watermark');

    final response = await _dio.get<Map<String, dynamic>>(
      '/sync/pull',
      queryParameters: {
        'device_uid': deviceUid,
        if (since != null) 'since': since,
      },
    );

    final data = response.data;
    if (data == null) return;

    await db.transaction((txn) async {
      await _replaceCustomers(txn, data['customers'] as List? ?? const []);
      await _replaceItems(txn, data['items'] as List? ?? const []);
      await _replacePrices(txn, data['prices'] as Map<String, dynamic>? ?? const {});
      await _replaceVanStock(txn, data['van_stock'] as Map<String, dynamic>? ?? const {});
      await _replaceCreditReservations(txn, data['credit_reservations'] as List? ?? const []);
      await _replaceOpenInvoices(txn, data['open_invoices'] as List? ?? const []);
      await _replaceVisitPlan(txn, data['visit_plan'] as List? ?? const []);
    });

    await LocalDb.instance.setMeta('sync.watermark', data['watermark'] as String? ?? '');
    // Price staleness is judged against this, not against wall-clock time.
    await LocalDb.instance.setMeta('sync.price_version', '${data['price_version'] ?? 0}');
    await LocalDb.instance.setMeta('sync.last_pull_at', DateTime.now().toUtc().toIso8601String());

    final grant = data['grant'] as Map<String, dynamic>?;
    await LocalDb.instance.setMeta('offline.grant', grant == null ? '' : jsonEncode(grant));
  }

  /// What the device still owes the server, for an honest badge count.
  Future<QueueSummary> queueSummary() async {
    final db = await _database();

    final rows = await db.rawQuery('''
      SELECT status, COUNT(*) AS n FROM operations
       WHERE status IN ('queued','sent','pending','rejected','conflict')
       GROUP BY status
    ''');

    var pending = 0, rejected = 0, conflicts = 0;

    for (final row in rows) {
      final count = (row['n'] as int?) ?? 0;
      switch (row['status']) {
        case 'rejected':
          rejected += count;
        case 'conflict':
          conflicts += count;
        default:
          pending += count;
      }
    }

    return QueueSummary(
      pending: pending,
      rejected: rejected,
      conflicts: conflicts,
      lastPullAt: await LocalDb.instance.meta('sync.last_pull_at'),
    );
  }

  /// Whether the device may still create documents offline right now.
  ///
  /// Revoking a grant server-side takes effect the next time the device
  /// connects, or when the grant simply expires. The app does not pretend a
  /// switched-off phone can be reached.
  Future<OfflineGrant?> currentGrant() async {
    final raw = await LocalDb.instance.meta('offline.grant');
    if (raw == null || raw.isEmpty) return null;

    final json = jsonDecode(raw) as Map<String, dynamic>;
    final validTo = DateTime.tryParse(json['valid_to'] as String? ?? '');

    if (validTo == null || validTo.isBefore(DateTime.now().toUtc())) return null;

    return OfflineGrant(
      validTo: validTo,
      maxDocValue: Dec.parse(json['max_doc_value'] as String?),
      maxDailyValue: Dec.parse(json['max_daily_value'] as String?),
      allowCreditSales: json['allow_credit_sales'] as bool? ?? false,
    );
  }

  Future<Database> _database() async {
    final db = LocalDb.instance;
    return db.open(await _passphrase());
  }

  Future<String> _passphrase() async =>
      await LocalDb.instance.meta('db.key') ?? 'set-by-secure-storage';

  // ---------------------------------------------------------------- upserts

  Future<void> _replaceCustomers(Transaction txn, List<dynamic> rows) async {
    for (final row in rows.cast<Map<String, dynamic>>()) {
      await txn.insert(
        'customers',
        {
          'id': row['id'],
          'code': row['code'],
          'name': row['name'],
          'phone': row['phone'],
          'address': row['address'],
          'latitude': row['latitude'] == null ? null : double.tryParse('${row['latitude']}'),
          'longitude': row['longitude'] == null ? null : double.tryParse('${row['longitude']}'),
          'price_list_id': row['price_list_id'],
          'discount_pct': '${row['discount_pct'] ?? 0}',
          'payment_terms_days': row['payment_terms_days'] ?? 0,
          'credit_limit': '${row['credit_limit'] ?? 0}',
          'credit_hold': (row['credit_hold'] == true) ? 1 : 0,
          'is_cash_only': (row['is_cash_only'] == true) ? 1 : 0,
          'kind': row['kind'],
          'visit_days': jsonEncode(row['visit_days'] ?? const []),
          'updated_at': row['updated_at'],
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
  }

  Future<void> _replaceItems(Transaction txn, List<dynamic> rows) async {
    for (final row in rows.cast<Map<String, dynamic>>()) {
      await txn.insert(
        'items',
        {
          'id': row['id'],
          'code': row['code'],
          'name': row['name'],
          'base_unit_id': row['base_unit_id'],
          'is_taxable': (row['is_taxable'] == true) ? 1 : 0,
          'tax_rate': '${row['tax_rate'] ?? 0}',
          'track_batches': (row['track_batches'] == true) ? 1 : 0,
          'track_expiry': (row['track_expiry'] == true) ? 1 : 0,
          'is_weighted': (row['is_weighted'] == true) ? 1 : 0,
          'default_sale_price': '${row['default_sale_price'] ?? 0}',
          'updated_at': row['updated_at'],
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );

      await txn.delete('item_units', where: 'item_id = ?', whereArgs: [row['id']]);

      for (final unit in (row['units'] as List? ?? const []).cast<Map<String, dynamic>>()) {
        await txn.insert('item_units', {
          'id': unit['id'],
          'item_id': row['id'],
          'unit_id': unit['unit_id'],
          'unit_name': unit['unit_name'],
          'factor': '${unit['factor']}',
          'is_base': (unit['is_base'] == true) ? 1 : 0,
          'is_sales_default': (unit['is_sales_default'] == true) ? 1 : 0,
          'barcode': unit['barcode'],
          'sale_price': unit['sale_price'] == null ? null : '${unit['sale_price']}',
        }, conflictAlgorithm: ConflictAlgorithm.replace);
      }
    }
  }

  Future<void> _replacePrices(Transaction txn, Map<String, dynamic> prices) async {
    await txn.delete('price_lines');

    for (final row in (prices['price_list_lines'] as List? ?? const [])
        .cast<Map<String, dynamic>>()) {
      await txn.insert('price_lines', {
        'source': 'price_list',
        'price_list_id': row['price_list_id'],
        'item_id': row['item_id'],
        'item_unit_id': row['item_unit_id'],
        'min_qty': '${row['min_qty'] ?? 0}',
        'price': '${row['price']}',
        'discount_pct': '${row['discount_pct'] ?? 0}',
        'valid_from': row['valid_from'],
        'valid_to': row['valid_to'],
      });
    }

    for (final row in (prices['contracts'] as List? ?? const []).cast<Map<String, dynamic>>()) {
      await txn.insert('price_lines', {
        'source': 'contract',
        'customer_id': row['customer_id'],
        'item_id': row['item_id'],
        'item_unit_id': row['item_unit_id'],
        'min_qty': '${row['min_qty'] ?? 0}',
        'price': row['price'] == null ? null : '${row['price']}',
        'discount_pct': '${row['discount_pct'] ?? 0}',
        'valid_from': row['valid_from'],
        'valid_to': row['valid_to'],
      });
    }
  }

  Future<void> _replaceVanStock(Transaction txn, Map<String, dynamic> vanStock) async {
    await txn.delete('van_stock');

    for (final row in (vanStock['lines'] as List? ?? const []).cast<Map<String, dynamic>>()) {
      await txn.insert('van_stock', {
        'item_id': row['item_id'],
        'batch_id': row['batch_id'],
        'batch_code': row['batch_code'],
        'expiry_date': row['expiry_date'],
        'qty_on_hand': '${row['qty_on_hand']}',
        'qty_reserved': '${row['qty_reserved']}',
        'qty_available': '${row['qty_available']}',
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }

    await LocalDb.instance
        .setMeta('van.warehouse_id', '${vanStock['warehouse_id'] ?? ''}');
  }

  Future<void> _replaceCreditReservations(Transaction txn, List<dynamic> rows) async {
    await txn.delete('credit_reservations');

    for (final row in rows.cast<Map<String, dynamic>>()) {
      await txn.insert('credit_reservations', {
        'customer_id': row['customer_id'],
        'amount': '${row['amount']}',
        'consumed_amount': '${row['consumed_amount']}',
        'available': '${row['available']}',
        'expires_at': row['expires_at'],
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
  }

  Future<void> _replaceOpenInvoices(Transaction txn, List<dynamic> rows) async {
    await txn.delete('open_invoices');

    for (final row in rows.cast<Map<String, dynamic>>()) {
      await txn.insert('open_invoices', {
        'id': row['id'],
        'code': row['code'],
        'customer_id': row['customer_id'],
        'invoice_date': row['invoice_date'],
        'due_date': row['due_date'],
        'total': '${row['total']}',
        'paid_amount': '${row['paid_amount']}',
        'returned_amount': '${row['returned_amount']}',
        'outstanding': '${row['outstanding']}',
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
  }

  Future<void> _replaceVisitPlan(Transaction txn, List<dynamic> rows) async {
    await txn.delete('visit_plan');

    for (final row in rows.cast<Map<String, dynamic>>()) {
      await txn.insert('visit_plan', {
        'id': row['id'],
        'plan_date': row['plan_date'],
        'customer_id': row['customer_id'],
        'customer_name': row['customer_name'],
        'sequence': row['sequence'] ?? 1,
        'planned_at': row['planned_at'],
        'objective': row['objective'],
        'status': row['status'] ?? 'pending',
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
  }
}

class SyncResult {
  const SyncResult({
    required this.applied,
    required this.rejected,
    required this.conflicts,
    required this.pending,
  });

  final int applied;
  final int rejected;
  final int conflicts;
  final int pending;

  bool get needsAttention => rejected > 0 || conflicts > 0;
}

class QueueSummary {
  const QueueSummary({
    required this.pending,
    required this.rejected,
    required this.conflicts,
    this.lastPullAt,
  });

  final int pending;
  final int rejected;
  final int conflicts;
  final String? lastPullAt;

  /// The day cannot be closed while anything is still outstanding.
  bool get isClean => pending == 0 && rejected == 0 && conflicts == 0;
}

class OfflineGrant {
  const OfflineGrant({
    required this.validTo,
    required this.maxDocValue,
    required this.maxDailyValue,
    required this.allowCreditSales,
  });

  final DateTime validTo;
  final Dec maxDocValue;
  final Dec maxDailyValue;
  final bool allowCreditSales;
}
