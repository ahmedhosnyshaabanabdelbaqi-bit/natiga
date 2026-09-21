import 'package:sqflite_sqlcipher/sqflite.dart';

import 'decimal.dart';
import 'local_db.dart';
import 'sync_service.dart';

/// What a rep is actually allowed to sell while offline.
///
/// The app refuses a sale it cannot back, rather than accepting it and letting
/// the server reject it hours later when the customer already has the goods.
/// Three independent limits apply, and the strictest wins:
///
///  1. Van stock — exclusively allocated to this rep, so it can be spent
///     without asking anyone.
///  2. A reserved credit slice — already counted in central exposure, so no
///     other channel can spend the same headroom.
///  3. A time- and value-bounded offline grant.
///
/// Anything outside those is a PROVISIONAL ORDER, not a sale: it is queued for
/// the server to confirm, and the rep is told so plainly.
class OfflineSaleGuard {
  OfflineSaleGuard(this._sync);

  final SyncService _sync;

  Future<SaleDecision> evaluate({
    required int customerId,
    required List<SaleLine> lines,
    required Dec total,
    required bool isCredit,
  }) async {
    final grant = await _sync.currentGrant();

    if (grant == null) {
      return SaleDecision.provisional(
        'انتهى تفويض البيع دون اتصال. يمكن تسجيل طلب مبدئي فقط حتى تتم المزامنة.',
      );
    }

    if (grant.maxDocValue.isPositive && total.compareTo(grant.maxDocValue) > 0) {
      return SaleDecision.blocked(
        'قيمة المستند (${total.toMoney()}) تتجاوز حد التفويض '
        '(${grant.maxDocValue.toMoney()}).',
      );
    }

    // ---- 1. van stock ----------------------------------------------------
    final shortages = await _stockShortages(lines);

    if (shortages.isNotEmpty) {
      return SaleDecision.blocked(
        'رصيد السيارة غير كافٍ: ${shortages.join('، ')}.',
      );
    }

    // ---- 2. credit ------------------------------------------------------
    if (isCredit) {
      if (!grant.allowCreditSales) {
        return SaleDecision.blocked('التفويض الحالي لا يسمح بالبيع الآجل دون اتصال.');
      }

      final db = await _db();
      final rows = await db.query(
        'credit_reservations',
        where: 'customer_id = ?',
        whereArgs: [customerId],
        limit: 1,
      );

      if (rows.isEmpty) {
        return SaleDecision.provisional(
          'لا توجد حصة ائتمان محجوزة لهذا العميل على هذا الجهاز. '
          'سيتم تسجيل طلب مبدئي يحتاج تأكيد السيرفر.',
        );
      }

      final reservation = rows.first;
      final expiresAt = DateTime.tryParse(reservation['expires_at'] as String? ?? '');

      if (expiresAt == null || expiresAt.isBefore(DateTime.now().toUtc())) {
        return SaleDecision.provisional('انتهت صلاحية حصة الائتمان المحجوزة لهذا العميل.');
      }

      final available = Dec.parse(reservation['available'] as String?);

      if (total.compareTo(available) > 0) {
        return SaleDecision.provisional(
          'قيمة البيع (${total.toMoney()}) تتجاوز الحصة الائتمانية المحجوزة '
          '(${available.toMoney()}). سيتم تسجيله كطلب مبدئي.',
        );
      }
    }

    // ---- 3. price staleness --------------------------------------------
    final lastPull = DateTime.tryParse(
      await LocalDb.instance.meta('sync.last_pull_at') ?? '',
    );

    if (lastPull != null && DateTime.now().toUtc().difference(lastPull).inHours > 24) {
      return SaleDecision.allowedWithWarning(
        'لم تتم المزامنة منذ أكثر من 24 ساعة. الأسعار قد تكون قديمة — '
        'راجعها مع المكتب قبل الالتزام مع العميل.',
      );
    }

    return SaleDecision.allowed();
  }

  Future<List<String>> _stockShortages(List<SaleLine> lines) async {
    final db = await _db();
    final shortages = <String>[];

    for (final line in lines) {
      final rows = await db.rawQuery('''
        SELECT i.name, COALESCE(SUM(CAST(v.qty_available AS REAL)), 0) AS available
          FROM items i
          LEFT JOIN van_stock v ON v.item_id = i.id
         WHERE i.id = ?
         GROUP BY i.id, i.name
      ''', [line.itemId]);

      if (rows.isEmpty) {
        shortages.add('صنف غير معروف (#${line.itemId})');
        continue;
      }

      final name = rows.first['name'] as String? ?? '#${line.itemId}';
      final available = Dec.parse('${rows.first['available']}', scale: Dec.qty);

      if (line.qtyBase.compareTo(available) > 0) {
        shortages.add('$name (المطلوب ${line.qtyBase.toQty()}، المتاح ${available.toQty()})');
      }
    }

    return shortages;
  }

  Future<Database> _db() async =>
      LocalDb.instance.open(await LocalDb.instance.meta('db.key') ?? '');
}

class SaleLine {
  const SaleLine({required this.itemId, required this.qtyBase});

  final int itemId;
  final Dec qtyBase;
}

/// The three outcomes, kept explicitly apart.
///
/// `provisional` is the important one: the rep may still record what happened,
/// but the app says clearly that this is a request awaiting confirmation, not a
/// completed sale. Pretending otherwise is how offline systems create invoices
/// the office later has to unwind.
class SaleDecision {
  const SaleDecision._(this.outcome, this.message);

  factory SaleDecision.allowed() => const SaleDecision._(SaleOutcome.allowed, null);

  factory SaleDecision.allowedWithWarning(String message) =>
      SaleDecision._(SaleOutcome.allowed, message);

  factory SaleDecision.provisional(String message) =>
      SaleDecision._(SaleOutcome.provisional, message);

  factory SaleDecision.blocked(String message) =>
      SaleDecision._(SaleOutcome.blocked, message);

  final SaleOutcome outcome;
  final String? message;

  bool get canProceed => outcome != SaleOutcome.blocked;
  bool get isProvisional => outcome == SaleOutcome.provisional;
}

enum SaleOutcome { allowed, provisional, blocked }
