import 'package:sqflite_sqlcipher/sqflite.dart';

import 'decimal.dart';

/// Offline price resolution.
///
/// Deliberately mirrors the server's priority order so a quote given in the
/// field matches the invoice the office issues:
///
///   1. Customer contract price
///   2. Quantity tier in the customer's price list
///   3. Plain price-list price
///   4. Item-unit list price
///   5. Item default price x unit factor
///
/// Whatever wins is SNAPSHOT onto the queued operation. The server re-resolves
/// on arrival and, where they differ, the difference is visible rather than
/// silently overwriting what the customer was told.
class OfflinePricing {
  OfflinePricing(this._db);

  final Database _db;

  Future<PriceQuote> resolve({
    required int customerId,
    required int itemId,
    required int itemUnitId,
    required Dec qty,
  }) async {
    final today = DateTime.now().toIso8601String().substring(0, 10);

    final contract = await _lookup(
      source: 'contract',
      customerId: customerId,
      itemId: itemId,
      itemUnitId: itemUnitId,
      qty: qty,
      onDate: today,
    );
    if (contract != null) return contract;

    final priceListId = Sqflite.firstIntValue(await _db.rawQuery(
      'SELECT price_list_id FROM customers WHERE id = ?',
      [customerId],
    ));

    if (priceListId != null) {
      final listPrice = await _lookup(
        source: 'price_list',
        priceListId: priceListId,
        itemId: itemId,
        itemUnitId: itemUnitId,
        qty: qty,
        onDate: today,
      );
      if (listPrice != null) return listPrice;
    }

    final unitRows = await _db.query(
      'item_units',
      where: 'id = ?',
      whereArgs: [itemUnitId],
      limit: 1,
    );

    if (unitRows.isNotEmpty) {
      final salePrice = unitRows.first['sale_price'] as String?;
      if (salePrice != null && Dec.parse(salePrice).isPositive) {
        return PriceQuote(
          unitPrice: Dec.parse(salePrice),
          discountPct: Dec.zero,
          source: 'item_unit',
        );
      }

      final itemRows = await _db.query(
        'items',
        where: 'id = ?',
        whereArgs: [itemId],
        limit: 1,
      );

      if (itemRows.isNotEmpty) {
        final base = Dec.parse(itemRows.first['default_sale_price'] as String?);
        final factor = Dec.parse(unitRows.first['factor'] as String?);
        return PriceQuote(
          unitPrice: base * factor,
          discountPct: Dec.zero,
          source: 'item_default',
        );
      }
    }

    return PriceQuote(unitPrice: Dec.zero, discountPct: Dec.zero, source: 'unknown');
  }

  Future<PriceQuote?> _lookup({
    required String source,
    required int itemId,
    required int itemUnitId,
    required Dec qty,
    required String onDate,
    int? customerId,
    int? priceListId,
  }) async {
    final rows = await _db.rawQuery('''
      SELECT price, discount_pct, min_qty
        FROM price_lines
       WHERE source = ?
         AND item_id = ?
         AND (item_unit_id IS NULL OR item_unit_id = ?)
         AND (? IS NULL OR customer_id = ?)
         AND (? IS NULL OR price_list_id = ?)
         AND CAST(min_qty AS REAL) <= ?
         AND (valid_from IS NULL OR valid_from <= ?)
         AND (valid_to IS NULL OR valid_to >= ?)
       ORDER BY CASE WHEN item_unit_id IS NULL THEN 1 ELSE 0 END,
                CAST(min_qty AS REAL) DESC
       LIMIT 1
    ''', [
      source,
      itemId,
      itemUnitId,
      customerId,
      customerId,
      priceListId,
      priceListId,
      double.tryParse(qty.toQty()) ?? 0,
      onDate,
      onDate,
    ]);

    if (rows.isEmpty) return null;

    final price = rows.first['price'] as String?;
    if (price == null) return null;

    final isTier = Dec.parse(rows.first['min_qty'] as String?).isPositive;

    return PriceQuote(
      unitPrice: Dec.parse(price),
      discountPct: Dec.parse(rows.first['discount_pct'] as String?),
      source: source == 'contract'
          ? 'contract'
          : (isTier ? 'price_list_tier' : 'price_list'),
    );
  }

  /// Line arithmetic, matching the server: tax applies to the discounted net.
  LineTotals computeLine({
    required Dec qty,
    required Dec unitPrice,
    required Dec discountPct,
    required Dec taxRate,
  }) {
    final gross = qty * unitPrice;
    final discount = gross.percentOf(discountPct).min(gross);
    final net = gross - discount;
    final tax = net.percentOf(taxRate);

    return LineTotals(
      gross: gross,
      discount: discount,
      net: net,
      tax: tax,
      total: net + tax,
    );
  }
}

class PriceQuote {
  const PriceQuote({
    required this.unitPrice,
    required this.discountPct,
    required this.source,
  });

  final Dec unitPrice;
  final Dec discountPct;
  final String source;
}

class LineTotals {
  const LineTotals({
    required this.gross,
    required this.discount,
    required this.net,
    required this.tax,
    required this.total,
  });

  final Dec gross;
  final Dec discount;
  final Dec net;
  final Dec tax;
  final Dec total;
}
