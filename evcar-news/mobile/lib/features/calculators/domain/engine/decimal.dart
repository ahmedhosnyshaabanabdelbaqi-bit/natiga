/// Minimal arbitrary-precision decimal that reproduces the semantics of the
/// backend's `Decimal` (decimal.js via `@prisma/client-runtime-utils`) as far
/// as the calculators engine uses it:
///
/// * construction from a number or string is exact (no rounding);
/// * `plus` / `minus` / `times` / `div` round the result to **20 significant
///   digits, ROUND_HALF_UP** (decimal.js defaults `precision: 20`,
///   `rounding: 4`);
/// * `toFixed(dp)` rounds half away from zero and keeps the sign of a
///   negative value that rounds to zero (`-0.004 → "-0.00"`), like decimal.js;
/// * `toDecimalPlaces(dp).toString()` prints without trailing zeros.
///
/// Numbers are converted through their shortest round-trip string (JS and
/// Dart agree on it), exactly like `new Decimal(number)`.
library;

import 'package:flutter/foundation.dart';

@immutable
class Dec implements Comparable<Dec> {
  const Dec._(this._c, this._e, [this._negZero = false]);

  /// value = [_c] × 10^[_e]; [_c] has no trailing zeros (except for 0).
  final BigInt _c;
  final int _e;

  /// decimal.js keeps the sign of a negative number rounded to zero.
  final bool _negZero;

  static const int precision = 20;
  static final BigInt _ten = BigInt.from(10);

  static final Dec zero = Dec._(BigInt.zero, 0);

  factory Dec(Object value) {
    if (value is Dec) return value;
    if (value is int) return Dec._norm(BigInt.from(value), 0);
    if (value is double) {
      if (!value.isFinite) throw ArgumentError('Not a finite number: $value');
      return Dec.parse(_shortest(value));
    }
    if (value is String) return Dec.parse(value);
    throw ArgumentError('Unsupported decimal input: ${value.runtimeType}');
  }

  static final _re = RegExp(r'^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$');

  /// Parses `-12.5`, `1e-7`, `3.`, `.5`.
  static Dec parse(String text) {
    final m = _re.firstMatch(text.trim());
    if (m == null || ((m.group(2) ?? '').isEmpty && (m.group(3) ?? '').isEmpty)) {
      throw FormatException('Invalid decimal: $text');
    }
    final neg = m.group(1) == '-';
    final intPart = m.group(2) ?? '';
    final frac = m.group(3) ?? '';
    final exp = int.parse(m.group(4) ?? '0');
    var c = BigInt.parse('${intPart.isEmpty ? '0' : intPart}$frac');
    if (neg) c = -c;
    return Dec._norm(c, exp - frac.length);
  }

  static String _shortest(double v) {
    // Dart and JS both print the shortest round-trip representation.
    final s = v.toString();
    return s;
  }

  static Dec _norm(BigInt c, int e) {
    if (c == BigInt.zero) return Dec._(BigInt.zero, 0);
    while (c % _ten == BigInt.zero) {
      c = c ~/ _ten;
      e++;
    }
    return Dec._(c, e);
  }

  static int _digits(BigInt v) => v == BigInt.zero ? 1 : v.abs().toString().length;

  bool get isZero => _c == BigInt.zero;
  bool get isNegative => _c < BigInt.zero || _negZero;

  /// Rounds c×10^e so that digits below 10^[keepExp] are dropped, HALF_UP
  /// (ties away from zero). The dropped block is a power of ten, so "at
  /// least half" is exact; digits already discarded below it (e.g. a
  /// division remainder) can never lift a value below half to half.
  static Dec _roundAt(BigInt c, int e, int keepExp) {
    if (e >= keepExp) return _norm(c, e);
    final neg = c < BigInt.zero;
    final div = _ten.pow(keepExp - e);
    var q = c.abs() ~/ div;
    if (c.abs() % div >= div ~/ BigInt.two) q += BigInt.one;
    if (neg && q == BigInt.zero) return Dec._(BigInt.zero, 0, true);
    return _norm(neg ? -q : q, keepExp);
  }

  /// Rounds to [precision] significant digits.
  static Dec _roundSig(BigInt c, int e) {
    final d = _digits(c);
    if (d <= precision) return _norm(c, e);
    return _roundAt(c, e, e + (d - precision));
  }

  static (BigInt, BigInt, int) _align(Dec a, Dec b) {
    final e = a._e < b._e ? a._e : b._e;
    return (a._c * _ten.pow(a._e - e), b._c * _ten.pow(b._e - e), e);
  }

  Dec plus(Object other) {
    final o = Dec(other);
    final (x, y, e) = _align(this, o);
    return _roundSig(x + y, e);
  }

  Dec minus(Object other) {
    final o = Dec(other);
    final (x, y, e) = _align(this, o);
    return _roundSig(x - y, e);
  }

  Dec times(Object other) {
    final o = Dec(other);
    return _roundSig(_c * o._c, _e + o._e);
  }

  Dec div(Object other) {
    final o = Dec(other);
    if (o.isZero) throw ArgumentError('Division by zero');
    if (isZero) return zero;
    final neg = (_c < BigInt.zero) != (o._c < BigInt.zero);
    final a = _c.abs();
    final b = o._c.abs();
    // At least precision + 2 digits in the integer quotient, so the digit
    // that decides the rounding is inside it (the remainder is only a tail).
    var k = precision + 2 + _digits(b) - _digits(a);
    if (k < 0) k = 0;
    final q = (a * _ten.pow(k)) ~/ b;
    final e = _e - o._e - k;
    return _roundSig(neg ? -q : q, e);
  }

  @override
  int compareTo(Dec other) {
    final (x, y, _) = _align(this, other);
    return x.compareTo(y);
  }

  bool operator <(Dec other) => compareTo(other) < 0;
  bool operator >(Dec other) => compareTo(other) > 0;

  @override
  bool operator ==(Object other) => other is Dec && compareTo(other) == 0;

  @override
  int get hashCode => Object.hash(_c, _e);

  /// Rounds to [dp] decimal places (HALF_UP).
  Dec toDecimalPlaces(int dp) => _roundAt(_c, _e, -dp);

  /// Fixed notation with exactly [dp] decimals (HALF_UP), like decimal.js.
  String toFixed(int dp) {
    final r = toDecimalPlaces(dp);
    final neg = r._c < BigInt.zero || r._negZero || (r.isZero && isNegative && !isZero);
    final scaled = r._c.abs() * _ten.pow(r._e + dp); // r._e >= -dp
    var s = scaled.toString();
    if (dp > 0) {
      s = s.padLeft(dp + 1, '0');
      s = '${s.substring(0, s.length - dp)}.${s.substring(s.length - dp)}';
    }
    return neg ? '-$s' : s;
  }

  /// Shortest plain notation (decimal.js `toString` for |exponent| in the
  /// normal range; exponent notation below 1e-7 like decimal.js).
  @override
  String toString() {
    if (isZero) return '0';
    final neg = _c < BigInt.zero;
    final digits = _c.abs().toString();
    final pointPos = digits.length + _e; // position of the decimal point
    final exponent = pointPos - 1;
    String out;
    if (exponent < -7 || exponent >= 21) {
      final mant = digits.length == 1 ? digits : '${digits[0]}.${digits.substring(1)}';
      out = '${mant}e${exponent < 0 ? '-' : '+'}${exponent.abs()}';
    } else if (_e >= 0) {
      out = digits + '0' * _e;
    } else if (pointPos > 0) {
      out = '${digits.substring(0, pointPos)}.${digits.substring(pointPos)}';
    } else {
      out = '0.${'0' * (-pointPos)}$digits';
    }
    return neg ? '-$out' : out;
  }

  double toDouble() => double.parse(toString());
}
