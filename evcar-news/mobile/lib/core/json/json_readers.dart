/// Small, defensive helpers for hand-written `fromJson` factories.
///
/// The project deliberately avoids code generation (ARCHITECTURE §6), so every
/// model parses JSON by hand. These helpers keep that code short and make
/// missing values stay `null` (never silently `0`), which matters for specs:
/// a missing value must be rendered as "غير متوفر / Not available".
library;

/// Casts [value] to a JSON object or throws a [FormatException].
Map<String, dynamic> asJsonObject(Object? value, [String what = 'value']) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((k, v) => MapEntry(k.toString(), v));
  }
  throw FormatException('Expected a JSON object for $what, got ${value.runtimeType}');
}

/// Casts [value] to a JSON list or throws a [FormatException].
List<dynamic> asJsonList(Object? value, [String what = 'value']) {
  if (value is List) return value;
  throw FormatException('Expected a JSON array for $what, got ${value.runtimeType}');
}

extension JsonObjectReaders on Map<String, dynamic> {
  /// Required string; throws [FormatException] when absent or not a string.
  String requireString(String key) {
    final v = this[key];
    if (v is String) return v;
    throw FormatException('Missing or invalid string field "$key"');
  }

  String? stringOrNull(String key) {
    final v = this[key];
    if (v == null) return null;
    if (v is String) return v;
    return v.toString();
  }

  /// Integer that may arrive as a number or a numeric string.
  int? intOrNull(String key) {
    final v = this[key];
    if (v is int) return v;
    if (v is num) return v.toInt();
    if (v is String) return int.tryParse(v);
    return null;
  }

  /// Double that may arrive as a number or a decimal string (e.g. money).
  double? doubleOrNull(String key) {
    final v = this[key];
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v);
    return null;
  }

  bool? boolOrNull(String key) {
    final v = this[key];
    if (v is bool) return v;
    if (v is String) {
      if (v == 'true') return true;
      if (v == 'false') return false;
    }
    return null;
  }

  bool boolOr(String key, bool fallback) => boolOrNull(key) ?? fallback;

  /// ISO-8601 date-time (the API always sends UTC).
  DateTime? dateTimeOrNull(String key) {
    final v = this[key];
    if (v is String) return DateTime.tryParse(v);
    return null;
  }

  Map<String, dynamic>? objectOrNull(String key) {
    final v = this[key];
    if (v is Map) return asJsonObject(v, key);
    return null;
  }

  List<String> stringList(String key) {
    final v = this[key];
    if (v is List) return v.whereType<String>().toList(growable: false);
    return const [];
  }

  /// Parses a list of objects, skipping entries that are not objects.
  List<T> objectList<T>(String key, T Function(Map<String, dynamic> json) parse) {
    final v = this[key];
    if (v is! List) return const [];
    return v.whereType<Map<dynamic, dynamic>>().map((e) => parse(asJsonObject(e, key))).toList(growable: false);
  }
}
