/// Fixed-point decimal arithmetic on integers.
///
/// Dart's `double` cannot represent 0.1 exactly, so no money or quantity in
/// this app is ever a double. Values are carried as strings across the wire
/// and as scaled BigInt internally, matching the server's NUMERIC semantics.
class Dec implements Comparable<Dec> {
  const Dec._(this._units, this._scale);

  final BigInt _units;
  final int _scale;

  static const int money = 2;
  static const int qty = 4;
  static const int calc = 8;

  static final Dec zero = Dec.parse('0');

  factory Dec.parse(String? value, {int scale = calc}) {
    if (value == null || value.trim().isEmpty) {
      return Dec._(BigInt.zero, scale);
    }

    var text = value.trim();
    var negative = false;

    if (text.startsWith('-')) {
      negative = true;
      text = text.substring(1);
    } else if (text.startsWith('+')) {
      text = text.substring(1);
    }

    final parts = text.split('.');
    final whole = parts[0].isEmpty ? '0' : parts[0];
    var fraction = parts.length > 1 ? parts[1] : '';

    if (fraction.length > scale) {
      // Round half-up at the requested scale rather than truncating.
      final keep = fraction.substring(0, scale);
      final nextDigit = int.tryParse(fraction[scale]) ?? 0;
      var units = BigInt.parse('$whole$keep');
      if (nextDigit >= 5) units += BigInt.one;
      return Dec._(negative ? -units : units, scale);
    }

    fraction = fraction.padRight(scale, '0');
    final units = BigInt.parse('$whole$fraction');

    return Dec._(negative ? -units : units, scale);
  }

  Dec _align(Dec other) {
    if (_scale == other._scale) return other;
    if (other._scale < _scale) {
      final factor = BigInt.from(10).pow(_scale - other._scale);
      return Dec._(other._units * factor, _scale);
    }
    return other.rescale(_scale);
  }

  Dec rescale(int scale) {
    if (scale == _scale) return this;

    if (scale > _scale) {
      final factor = BigInt.from(10).pow(scale - _scale);
      return Dec._(_units * factor, scale);
    }

    final factor = BigInt.from(10).pow(_scale - scale);
    final quotient = _units.abs() ~/ factor;
    final remainder = _units.abs() % factor;
    var result = quotient;

    // Half-up, away from zero, matching the server.
    if (remainder * BigInt.two >= factor) result += BigInt.one;

    return Dec._(_units.isNegative ? -result : result, scale);
  }

  Dec operator +(Dec other) {
    final aligned = _align(other);
    final scale = _scale > other._scale ? _scale : other._scale;
    return Dec._(rescale(scale)._units + aligned.rescale(scale)._units, scale);
  }

  Dec operator -(Dec other) {
    final scale = _scale > other._scale ? _scale : other._scale;
    return Dec._(rescale(scale)._units - other.rescale(scale)._units, scale);
  }

  Dec operator *(Dec other) {
    final product = _units * other._units;
    final rawScale = _scale + other._scale;
    return Dec._(product, rawScale).rescale(calc);
  }

  /// Division by zero yields zero — the caller decides what that means.
  Dec divide(Dec other, {int scale = calc}) {
    if (other._units == BigInt.zero) return Dec._(BigInt.zero, scale);

    final numerator = _units * BigInt.from(10).pow(other._scale + scale + 1);
    final raw = numerator ~/ other._units;
    return Dec._(raw, _scale + scale + 1).rescale(scale);
  }

  Dec percentOf(Dec percent) => (this * percent).divide(Dec.parse('100'));

  bool get isZero => _units == BigInt.zero;
  bool get isPositive => _units > BigInt.zero;
  bool get isNegative => _units < BigInt.zero;

  Dec get abs => Dec._(_units.abs(), _scale);

  Dec min(Dec other) => compareTo(other) <= 0 ? this : other;
  Dec max(Dec other) => compareTo(other) >= 0 ? this : other;

  @override
  int compareTo(Dec other) {
    final scale = _scale > other._scale ? _scale : other._scale;
    return rescale(scale)._units.compareTo(other.rescale(scale)._units);
  }

  @override
  bool operator ==(Object other) => other is Dec && compareTo(other) == 0;

  @override
  int get hashCode => toString().hashCode;

  /// The wire format: a plain decimal string the server parses as NUMERIC.
  @override
  String toString() {
    if (_scale == 0) return _units.toString();

    final negative = _units.isNegative;
    final digits = _units.abs().toString().padLeft(_scale + 1, '0');
    final whole = digits.substring(0, digits.length - _scale);
    final fraction = digits.substring(digits.length - _scale);

    return '${negative ? '-' : ''}$whole.$fraction';
  }

  String toMoney() => rescale(money).toString();
  String toQty() => rescale(qty).toString();
}
