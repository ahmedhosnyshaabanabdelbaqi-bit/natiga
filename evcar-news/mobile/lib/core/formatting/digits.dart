/// Digit-shaping helpers for Arabic UI text.
library;

const _western = '0123456789';
const _arabicIndic = '٠١٢٣٤٥٦٧٨٩';

/// Converts Western digits to Arabic-Indic (٠١٢٣…). When [numberSeparators]
/// is true, `,` `.` and `%` are also converted to the Arabic thousands
/// separator `٬`, decimal separator `٫` and percent sign `٪`; only use that
/// for strings produced by a number formatter.
String toArabicIndicDigits(String input, {bool numberSeparators = false}) {
  final b = StringBuffer();
  for (final rune in input.runes) {
    final ch = String.fromCharCode(rune);
    final i = _western.indexOf(ch);
    if (i >= 0) {
      b.write(_arabicIndic[i]);
    } else if (numberSeparators && ch == ',') {
      b.write('٬');
    } else if (numberSeparators && ch == '.') {
      b.write('٫');
    } else if (numberSeparators && ch == '%') {
      b.write('٪');
    } else {
      b.write(ch);
    }
  }
  return b.toString();
}

/// Converts Arabic-Indic and Eastern Arabic-Indic (Persian) digits to Western
/// digits, e.g. for parsing user input typed with an Arabic keyboard.
String toWesternDigits(String input) {
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  final b = StringBuffer();
  for (final rune in input.runes) {
    final ch = String.fromCharCode(rune);
    var i = _arabicIndic.indexOf(ch);
    if (i < 0) i = persian.indexOf(ch);
    if (i >= 0) {
      b.write(_western[i]);
    } else if (ch == '٫') {
      b.write('.');
    } else if (ch == '٬') {
      b.write(',');
    } else {
      b.write(ch);
    }
  }
  return b.toString();
}
