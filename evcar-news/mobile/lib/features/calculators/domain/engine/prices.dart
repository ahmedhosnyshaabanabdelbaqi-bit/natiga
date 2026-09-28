/// Prices entered for a calculation (port of `engine/prices.ts`). There are
/// no built-in prices: each one is typed by the user or copied from an admin
/// reference price (then its effective date and source are recorded). A
/// price without a date gets a visible warning.
library;

import 'core.dart';

class PriceContext {
  const PriceContext(this.currency, this.priceDate);

  final String currency;
  final String? priceDate;
}

PriceContext? readPriceContext(Problems p, Map<String, Object?> input) {
  final currency = validCurrency(p, 'currency', input['currency']);
  final priceDate = validDate(p, 'priceDate', input['priceDate']);
  return currency != null ? PriceContext(currency, priceDate) : null;
}

const priceDateMissing = Bi(
  'لم يُحدَّد تاريخ السعر؛ تأكد أن الأسعار المُدخلة حديثة.',
  'No price date was given; make sure the entered prices are up to date.',
);

void tracePriceContext(Trace trace, PriceContext ctx, [ProvenanceMap? prov]) {
  trace.assume('currency', const Bi('العملة', 'Currency'), ctx.currency, null, 'user');
  final dateOrigin = prov?['priceDate']?.origin ?? 'user';
  trace.assume('priceDate', const Bi('تاريخ السعر', 'Price date'), ctx.priceDate, null, dateOrigin, prov?['priceDate']?.note);
  if (ctx.priceDate == null) trace.warn('PRICE_DATE_MISSING', priceDateMissing);
}

/// A non-negative price (0 allowed: e.g. free charging).
Dec? readPrice(Problems p, String field, Object? raw, {bool required = false}) {
  final v = readNum(p, field, raw, NumRule(required: required, nonNegative: true, max: 1e9));
  return v == null ? null : Dec(v);
}

void tracePrice(Trace trace, String key, Bi label, Dec value, String unit, String currency, [ProvenanceMap? prov]) {
  trace.assume(
    key,
    label,
    rate(value, currency).amount,
    '$currency/$unit',
    prov?[key]?.origin ?? 'user',
    prov?[key]?.note,
  );
}
