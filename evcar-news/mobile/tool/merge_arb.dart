// Merges per-feature ARB parts into the files consumed by `flutter gen-l10n`.
//
//   lib/l10n/parts/<feature>_<locale>.arb  →  lib/l10n/app_<locale>.arb
//
// Usage (from mobile/):
//   dart run tool/merge_arb.dart          # write merged files
//   dart run tool/merge_arb.dart --check  # CI: fail if merged files are stale
//   flutter gen-l10n                      # then regenerate Dart code
//
// Rules (any violation → exit code 1, nothing written):
//  * part file names are `<feature>_<locale>.arb` (feature = snake_case);
//  * every message key starts with the camelCase feature name
//    (`charging_logs` → `chargingLogs…`), so features never collide;
//  * a key may be defined only once per locale — duplicates inside one file
//    or across files are errors;
//  * `@key` metadata must belong to a message key of the same file;
//  * every locale must define exactly the same message keys;
//  * `@@locale`, if present, must match the file name.
//
// See mobile/README.md → "Localization".

import 'dart:convert';
import 'dart:io';

const partsDir = 'lib/l10n/parts';
const outDir = 'lib/l10n';
const outPrefix = 'app';

final _partName = RegExp(r'^([a-z][a-z0-9]*(?:_[a-z0-9]+)*)_([a-z]{2}(?:_[A-Z]{2})?)\.arb$');

/// Input: one ARB part file.
class ArbPart {
  ArbPart(this.fileName, this.content);

  final String fileName;
  final String content;
}

/// Output of [mergeArbParts].
class MergeResult {
  MergeResult(this.outputs, this.errors);

  /// locale → merged JSON text (only meaningful when [errors] is empty).
  final Map<String, String> outputs;
  final List<String> errors;

  bool get ok => errors.isEmpty;
}

/// `charging_logs` → `chargingLogs`.
String featurePrefix(String feature) {
  final parts = feature.split('_');
  return parts.first + parts.skip(1).map((p) => p.isEmpty ? '' : p[0].toUpperCase() + p.substring(1)).join();
}

/// Returns the top-level keys of a JSON object in source order, including
/// duplicates (which `jsonDecode` would silently collapse).
List<String> topLevelKeys(String source) {
  final keys = <String>[];
  var depth = 0;
  var i = 0;
  String? pendingString;
  while (i < source.length) {
    final c = source[i];
    if (c == '"') {
      final b = StringBuffer();
      i++;
      while (i < source.length && source[i] != '"') {
        if (source[i] == r'\' && i + 1 < source.length) {
          b.write(source[i]);
          i++;
        }
        b.write(source[i]);
        i++;
      }
      if (i >= source.length) break; // unterminated; jsonDecode reports it
      pendingString = depth == 1 ? _unescape(b.toString()) : null;
      i++;
      continue;
    }
    if (c == ':' && pendingString != null && depth == 1) {
      keys.add(pendingString);
    }
    if (c != ' ' && c != '\n' && c != '\r' && c != '\t' && c != ':') pendingString = null;
    if (c == '{' || c == '[') depth++;
    if (c == '}' || c == ']') depth--;
    i++;
  }
  return keys;
}

String _unescape(String raw) {
  try {
    return jsonDecode('"$raw"') as String;
  } on FormatException {
    return raw;
  }
}

/// Pure merge logic (unit-tested). [parts] are all files of the parts dir.
MergeResult mergeArbParts(List<ArbPart> parts) {
  final errors = <String>[];
  // locale → key → (value, sourceFile)
  final merged = <String, Map<String, Object?>>{};
  final origin = <String, Map<String, String>>{};
  final messageKeysByLocale = <String, Set<String>>{};

  final sorted = [...parts]..sort((a, b) => a.fileName.compareTo(b.fileName));
  for (final part in sorted) {
    final m = _partName.firstMatch(part.fileName);
    if (m == null) {
      errors.add('${part.fileName}: file name must be <feature>_<locale>.arb (snake_case feature)');
      continue;
    }
    final feature = m.group(1)!;
    final locale = m.group(2)!;
    final prefix = featurePrefix(feature);

    Object? decoded;
    try {
      decoded = jsonDecode(part.content);
    } on FormatException catch (e) {
      errors.add('${part.fileName}: invalid JSON (${e.message})');
      continue;
    }
    if (decoded is! Map<String, dynamic>) {
      errors.add('${part.fileName}: top level must be a JSON object');
      continue;
    }

    final seen = <String>{};
    for (final k in topLevelKeys(part.content)) {
      if (!seen.add(k)) errors.add('${part.fileName}: duplicate key "$k" in the same file');
    }

    final localeMap = merged.putIfAbsent(locale, () => {});
    final localeOrigin = origin.putIfAbsent(locale, () => {});
    final messageKeys = messageKeysByLocale.putIfAbsent(locale, () => {});

    for (final entry in decoded.entries) {
      final key = entry.key;
      if (key == '@@locale') {
        if (entry.value != locale) {
          errors.add('${part.fileName}: "@@locale" is "${entry.value}" but the file name says "$locale"');
        }
        continue;
      }
      if (key.startsWith('@@')) {
        errors.add('${part.fileName}: global attribute "$key" is not allowed in parts');
        continue;
      }
      final isMeta = key.startsWith('@');
      final messageKey = isMeta ? key.substring(1) : key;
      if (isMeta) {
        if (!decoded.containsKey(messageKey)) {
          errors.add('${part.fileName}: metadata "$key" has no message "$messageKey" in this file');
        }
        if (entry.value is! Map) {
          errors.add('${part.fileName}: metadata "$key" must be an object');
        }
      } else {
        if (entry.value is! String) {
          errors.add('${part.fileName}: message "$key" must be a string');
        }
        if (!RegExp('^$prefix(?:[A-Z0-9].*)?\$').hasMatch(key)) {
          errors.add(
            '${part.fileName}: key "$key" must start with the feature prefix "$prefix" '
            'followed by an upper-case letter or digit',
          );
        }
      }
      final previous = localeOrigin[key];
      if (previous != null) {
        errors.add('duplicate key "$key" for locale "$locale": defined in $previous and ${part.fileName}');
        continue;
      }
      localeOrigin[key] = part.fileName;
      localeMap[key] = entry.value;
      if (!isMeta) messageKeys.add(key);
    }
  }

  // Every locale must define the same message keys.
  if (messageKeysByLocale.isNotEmpty) {
    final all = messageKeysByLocale.values.expand((s) => s).toSet();
    for (final entry in messageKeysByLocale.entries) {
      final missing = all.difference(entry.value).toList()..sort();
      for (final k in missing) {
        final definedIn = messageKeysByLocale.entries
            .where((e) => e.value.contains(k))
            .map((e) => origin[e.key]![k])
            .join(', ');
        errors.add('locale "${entry.key}" is missing key "$k" (defined in $definedIn)');
      }
    }
  }

  final outputs = <String, String>{};
  if (errors.isEmpty) {
    const encoder = JsonEncoder.withIndent('  ');
    for (final entry in merged.entries) {
      final locale = entry.key;
      final map = entry.value;
      final messageKeys = map.keys.where((k) => !k.startsWith('@')).toList()..sort();
      final ordered = <String, Object?>{'@@locale': locale};
      for (final k in messageKeys) {
        ordered[k] = map[k];
        if (map.containsKey('@$k')) ordered['@$k'] = map['@$k'];
      }
      outputs[locale] = '${encoder.convert(ordered)}\n';
    }
  }
  return MergeResult(outputs, errors);
}

void main(List<String> args) {
  final check = args.contains('--check');
  final dir = Directory(partsDir);
  if (!dir.existsSync()) {
    stderr.writeln('merge_arb: $partsDir not found (run from the mobile/ directory)');
    exitCode = 2;
    return;
  }
  final parts = dir
      .listSync()
      .whereType<File>()
      .where((f) => f.path.endsWith('.arb'))
      .map((f) => ArbPart(f.uri.pathSegments.last, f.readAsStringSync()))
      .toList();

  final result = mergeArbParts(parts);
  if (!result.ok) {
    stderr.writeln('merge_arb: ${result.errors.length} error(s):');
    for (final e in result.errors) {
      stderr.writeln('  - $e');
    }
    exitCode = 1;
    return;
  }

  var stale = false;
  for (final entry in result.outputs.entries) {
    final file = File('$outDir/${outPrefix}_${entry.key}.arb');
    final current = file.existsSync() ? file.readAsStringSync() : null;
    if (current == entry.value) continue;
    if (check) {
      stderr.writeln('merge_arb: ${file.path} is out of date');
      stale = true;
    } else {
      file.writeAsStringSync(entry.value);
      stdout.writeln('merge_arb: wrote ${file.path}');
    }
  }
  if (check && stale) {
    stderr.writeln('Run: dart run tool/merge_arb.dart && flutter gen-l10n');
    exitCode = 1;
    return;
  }
  stdout.writeln('merge_arb: ${parts.length} part(s), ${result.outputs.length} locale(s) OK');
}
