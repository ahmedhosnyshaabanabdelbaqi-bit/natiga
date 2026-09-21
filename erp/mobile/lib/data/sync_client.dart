import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:sqflite_sqlcipher/sqflite.dart';

import '../core/config.dart';
import 'local_db.dart';

/// نتيجة محاولة مزامنة واحدة.
class SyncResult {
  final int applied;
  final int replayed;
  final int conflicts;
  final int rejected;
  final String? error;

  const SyncResult({
    this.applied = 0,
    this.replayed = 0,
    this.conflicts = 0,
    this.rejected = 0,
    this.error,
  });

  bool get hasIssues => conflicts > 0 || rejected > 0;
}

/// عميل المزامنة.
///
/// الجهاز **يقترح** والسيرفر **يقرر ويرحّل**. لا يُحتسب شيء نهائيًا على الجهاز.
class SyncClient {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  final Dio _dio;

  SyncClient() : _dio = Dio(BaseOptions(
          baseUrl: AppConfig.apiBase,
          connectTimeout: AppConfig.requestTimeout,
          receiveTimeout: AppConfig.requestTimeout,
          headers: {'Accept': 'application/json'},
        ));

  Future<void> _attachAuth() async {
    final token = await _storage.read(key: 'fayad.token');
    final deviceUid = await LocalDb.state('device_uid');

    if (token != null) _dio.options.headers['Authorization'] = 'Bearer $token';
    if (deviceUid != null) _dio.options.headers['X-Device-Uid'] = deviceUid;
  }

  Future<bool> get isOnline async {
    final result = await Connectivity().checkConnectivity();
    return !result.contains(ConnectivityResult.none);
  }

  /// دفع العمليات المعلقة.
  ///
  /// إعادة الإرسال بنفس `idempotency_key` بعد انقطاع الرد لا تنشئ مستندًا ثانيًا —
  /// السيرفر يُرجع الإيصال المحفوظ بعلامة `replayed`.
  Future<SyncResult> push() async {
    if (!await isOnline) {
      return const SyncResult(error: 'لا يوجد اتصال بالشبكة.');
    }

    await _attachAuth();

    final pending = await LocalDb.pendingOperations();
    if (pending.isEmpty) return const SyncResult();

    final operations = pending.map((row) => {
          'uuid': row['uuid'],
          'idempotency_key': row['idempotency_key'],
          'device_seq': row['device_seq'],
          'op_type': row['op_type'],
          'payload': jsonDecode(row['payload'] as String),
        }).toList();

    try {
      final response = await _dio.post('/sync/push', data: {'operations': operations});
      final receipts = (response.data['data']['receipts'] as List).cast<Map<String, dynamic>>();

      final db = await LocalDb.instance();
      var applied = 0, replayed = 0, conflicts = 0, rejected = 0;

      await db.transaction((txn) async {
        for (final receipt in receipts) {
          final status = receipt['status'] as String;

          if (status == 'applied') {
            (receipt['replayed'] == true) ? replayed++ : applied++;
          } else if (status == 'conflict') {
            conflicts++;
          } else {
            rejected++;
          }

          await txn.update(
            'outbox',
            {
              'status': status == 'applied' ? 'synced' : status,
              'server_doc_no': receipt['doc_no'],
              'server_doc_id': receipt['doc_id'],
              'error_code': receipt['error_code'],
              'error_message': receipt['message'],
              'conflict_details':
                  receipt['conflict'] == null ? null : jsonEncode(receipt['conflict']),
              'attempts': Sqflite.firstIntValue(
                    await txn.rawQuery('SELECT attempts + 1 FROM outbox WHERE uuid = ?',
                        [receipt['uuid']]),
                  ) ??
                  1,
              'synced_at': DateTime.now().toIso8601String(),
            },
            where: 'uuid = ?',
            whereArgs: [receipt['uuid']],
          );
        }
      });

      await LocalDb.setState('last_sync_at', DateTime.now().toIso8601String());

      return SyncResult(
        applied: applied,
        replayed: replayed,
        conflicts: conflicts,
        rejected: rejected,
      );
    } on DioException catch (e) {
      // انقطاع بعد حفظ السيرفر وقبل وصول الرد:
      // العمليات تبقى 'pending' وتُعاد بنفس المفتاح في المحاولة التالية.
      return SyncResult(error: _describe(e));
    }
  }

  /// سحب تزايدي للبيانات المرجعية.
  Future<String?> pull() async {
    if (!await isOnline) return 'لا يوجد اتصال بالشبكة.';

    await _attachAuth();

    try {
      final since = await LocalDb.state('last_pull_at');
      final response = await _dio.get('/sync/pull',
          queryParameters: since == null ? null : {'since': since});

      final data = response.data['data'] as Map<String, dynamic>;
      final db = await LocalDb.instance();

      await db.transaction((txn) async {
        for (final c in (data['customers'] as List)) {
          await txn.insert('customers', {
            'id': c['id'], 'code': c['code'], 'name': c['name'], 'phone': c['phone'],
            'address': c['address'], 'latitude': c['latitude'], 'longitude': c['longitude'],
            'price_list_id': c['price_list_id'], 'credit_limit': c['credit_limit']?.toString(),
            'payment_term_days': c['payment_term_days'],
            'is_blocked': (c['is_blocked'] == true || c['is_blocked'] == 1) ? 1 : 0,
            'updated_at': c['updated_at'],
          }, conflictAlgorithm: ConflictAlgorithm.replace);
        }

        for (final i in (data['items'] as List)) {
          await txn.insert('items', {
            'id': i['id'], 'code': i['code'], 'name_ar': i['name_ar'],
            'base_uom_id': i['base_uom_id'],
            'track_batches': (i['track_batches'] == true || i['track_batches'] == 1) ? 1 : 0,
            'track_expiry': (i['track_expiry'] == true || i['track_expiry'] == 1) ? 1 : 0,
            'updated_at': i['updated_at'],
          }, conflictAlgorithm: ConflictAlgorithm.replace);
        }

        await txn.delete('item_uoms');
        for (final u in (data['item_uoms'] as List)) {
          await txn.insert('item_uoms', {
            'id': u['id'], 'item_id': u['item_id'], 'uom_id': u['uom_id'],
            'factor': u['factor'].toString(),
            'is_base': (u['is_base'] == true || u['is_base'] == 1) ? 1 : 0,
          });
        }

        await txn.delete('prices');
        for (final pr in (data['prices'] as List)) {
          await txn.insert('prices', {
            'id': pr['id'], 'price_list_id': pr['price_list_id'], 'item_id': pr['item_id'],
            'uom_id': pr['uom_id'], 'min_qty': pr['min_qty'].toString(),
            'price': pr['price'].toString(),
            'max_discount_pct': pr['max_discount_pct']?.toString() ?? '0',
          });
        }

        await txn.delete('van_stock');
        for (final s in (data['van_stock'] as List)) {
          await txn.insert('van_stock', {
            'item_id': s['item_id'], 'warehouse_id': s['warehouse_id'],
            'batch_id': s['batch_id'] ?? 0, 'qty_base': s['qty_base'].toString(),
          }, conflictAlgorithm: ConflictAlgorithm.replace);
        }

        await txn.delete('stock_quotas');
        for (final q in (data['offline_stock_quotas'] as List)) {
          await txn.insert('stock_quotas', {
            'item_id': q['item_id'], 'warehouse_id': q['warehouse_id'],
            'qty_base': q['qty_base'].toString(),
            'consumed_qty_base': q['consumed_qty_base'].toString(),
            'expires_at': q['expires_at'],
          }, conflictAlgorithm: ConflictAlgorithm.replace);
        }

        await txn.delete('credit_quotas');
        for (final q in (data['offline_credit_quotas'] as List)) {
          await txn.insert('credit_quotas', {
            'customer_id': q['customer_id'], 'amount': q['amount'].toString(),
            'consumed_amount': q['consumed_amount'].toString(),
            'expires_at': q['expires_at'],
          }, conflictAlgorithm: ConflictAlgorithm.replace);
        }
      });

      // إصدار الأسعار وحالة تفويض الجهاز
      await LocalDb.setState('price_version', '${data['price_version'] ?? ''}');
      await LocalDb.setState('price_expires_at', '${data['price_expires_at'] ?? ''}');
      await LocalDb.setState(
          'offline_authorized_until', '${data['device']?['offline_authorized_until'] ?? ''}');
      await LocalDb.setState('device_active', '${data['device']?['is_active'] ?? true}');
      await LocalDb.setState('last_pull_at', data['server_time'] as String);

      return null;
    } on DioException catch (e) {
      return _describe(e);
    }
  }

  /// هل ما زال الجهاز مفوَّضًا بالعمل دون اتصال؟
  ///
  /// إيقاف الجهاز من الخادم يسري **عند الاتصال أو عند انتهاء هذا التفويض** —
  /// لا يوجد إلغاء فوري لجهاز منفصل عن الشبكة، ولا نَعِد بذلك.
  static Future<bool> offlineStillAuthorised() async {
    if ((await LocalDb.state('device_active')) == 'false') return false;

    final until = await LocalDb.state('offline_authorized_until');
    if (until == null || until.isEmpty) return false;

    final expiry = DateTime.tryParse(until);
    return expiry != null && expiry.isAfter(DateTime.now());
  }

  String _describe(DioException e) {
    if (e.response?.data is Map) {
      final data = e.response!.data as Map;
      return (data['message'] as String?) ?? 'تعذّر إتمام الطلب.';
    }

    return switch (e.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.receiveTimeout =>
        'انتهت مهلة الاتصال — ستُعاد المحاولة تلقائيًا ولن تتكرر العملية.',
      DioExceptionType.connectionError => 'تعذّر الوصول للخادم.',
      _ => 'خطأ غير متوقع في الاتصال.',
    };
  }
}
