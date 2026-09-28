/// Small helpers shared by the personal features' forms (garage, charging
/// log, reminders, calculators, trips): number parsing from Arabic or Latin
/// keyboards, API date strings and server field errors.
library;

import 'package:flutter/material.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/formatting/digits.dart';

/// Normalizes user number input: Arabic-Indic / Persian digits → Western,
/// Arabic decimal separator `٫` and a lone `,` → `.`, spaces and thousands
/// separators removed. Returns the cleaned text (may still be invalid).
String normalizeNumberInput(String raw) {
  var s = toWesternDigits(raw.trim()).replaceAll('٬', '').replaceAll(' ', '').replaceAll(' ', '');
  // "1,5" (comma decimal) → "1.5"; "1,234.5" → "1234.5".
  if (s.contains(',') && !s.contains('.')) {
    final parts = s.split(',');
    s = parts.length == 2 && parts[1].length != 3 ? '${parts[0]}.${parts[1]}' : parts.join();
  } else {
    s = s.replaceAll(',', '');
  }
  return s;
}

final _numberRe = RegExp(r'^-?\d+(\.\d+)?$');

/// Parses a number typed by the user; `null` for empty input. Throws
/// [FormatException] for garbage so the form can show "enter a number".
num? parseNumberInput(String raw) {
  final s = normalizeNumberInput(raw);
  if (s.isEmpty) return null;
  if (!_numberRe.hasMatch(s)) throw FormatException('Not a number: $raw');
  return num.parse(s);
}

/// Like [parseNumberInput] but returns the cleaned text instead of throwing,
/// so the calculators engine reports its own `isNumber` problem.
Object? numberOrRaw(String raw) {
  final s = normalizeNumberInput(raw);
  if (s.isEmpty) return null;
  return _numberRe.hasMatch(s) ? num.parse(s) : s;
}

/// Shows a number in an input without a useless ".0".
String numberToInput(num? v) {
  if (v == null) return '';
  if (v is int || v == v.truncateToDouble()) return v.toInt().toString();
  return v.toString();
}

/// `YYYY-MM-DD` of a calendar date (no time zone shift).
String isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Parses `YYYY-MM-DD` as a local calendar date.
DateTime? parseIsoDate(String? s) {
  if (s == null || s.length < 10) return null;
  final d = DateTime.tryParse(s.substring(0, 10));
  return d == null ? null : DateTime(d.year, d.month, d.day);
}

/// Server field errors (`422 VALIDATION_FAILED`) as `field → message`.
Map<String, String> fieldErrorsOf(Object error) {
  if (error is! ApiException) return const {};
  final out = <String, String>{};
  for (final f in error.fieldErrors) {
    out[f.field] = [...?out[f.field]?.split('\n'), ...f.messages].join('\n');
  }
  return out;
}

/// A text field for numbers with the app's standard decoration; accepts
/// Arabic digits and decimal separators.
class NumberField extends StatelessWidget {
  const NumberField({
    super.key,
    required this.controller,
    required this.label,
    this.unit,
    this.helper,
    this.errorText,
    this.allowDecimal = true,
    this.allowNegative = false,
    this.onChanged,
    this.validator,
    this.textInputAction = TextInputAction.next,
    this.enabled = true,
    this.fieldKey,
  });

  final TextEditingController controller;
  final String label;
  final String? unit;
  final String? helper;
  final String? errorText;
  final bool allowDecimal;
  final bool allowNegative;
  final ValueChanged<String>? onChanged;
  final FormFieldValidator<String>? validator;
  final TextInputAction textInputAction;
  final bool enabled;
  final Key? fieldKey;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      key: fieldKey,
      controller: controller,
      enabled: enabled,
      keyboardType: TextInputType.numberWithOptions(decimal: allowDecimal, signed: allowNegative),
      textInputAction: textInputAction,
      onChanged: onChanged,
      validator: validator,
      decoration: InputDecoration(
        labelText: label,
        suffixText: unit,
        helperText: helper,
        helperMaxLines: 3,
        errorText: errorText,
        errorMaxLines: 3,
      ),
    );
  }
}
