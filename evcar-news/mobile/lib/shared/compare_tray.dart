import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/settings/settings_controller.dart';

/// One car chosen for comparison: a **variant (trim) of a model year in a
/// market** — REQUIREMENTS §7 makes year, trim and market mandatory, and the
/// backend pins each comparison item to `(variantId, marketCode)`.
///
/// The display fields are a snapshot so the tray renders offline and before
/// the comparison is loaded; the compare screen always reloads real data.
@immutable
class CompareSelection {
  const CompareSelection({
    required this.variantId,
    required this.modelYear,
    required this.marketCode,
    required this.title,
    this.variantSlug,
    this.modelSlug,
    this.subtitle,
    this.imageUrl,
    this.addedAt,
  });

  final String variantId;
  final int modelYear;

  /// ISO market code (`EG`, `SA`, …) the specs/prices are taken from.
  final String marketCode;

  /// e.g. "BYD Atto 3".
  final String title;
  final String? variantSlug;
  final String? modelSlug;

  /// e.g. "Extended Range · 2025 · EG".
  final String? subtitle;
  final String? imageUrl;
  final DateTime? addedAt;

  /// Identity inside the tray: the same trim can be compared across markets.
  String get key => '$variantId@$marketCode';

  Map<String, Object?> toJson() => {
    'variantId': variantId,
    'modelYear': modelYear,
    'marketCode': marketCode,
    'title': title,
    'variantSlug': variantSlug,
    'modelSlug': modelSlug,
    'subtitle': subtitle,
    'imageUrl': imageUrl,
    'addedAt': addedAt?.toUtc().toIso8601String(),
  };

  /// Returns null for malformed entries (they are dropped, never crash).
  static CompareSelection? tryFromJson(Object? json) {
    if (json is! Map) return null;
    final variantId = json['variantId'];
    final year = json['modelYear'];
    final market = json['marketCode'];
    final title = json['title'];
    if (variantId is! String || variantId.isEmpty) return null;
    if (year is! int || market is! String || market.isEmpty || title is! String) return null;
    String? str(String k) => json[k] is String ? json[k] as String : null;
    return CompareSelection(
      variantId: variantId,
      modelYear: year,
      marketCode: market.toUpperCase(),
      title: title,
      variantSlug: str('variantSlug'),
      modelSlug: str('modelSlug'),
      subtitle: str('subtitle'),
      imageUrl: str('imageUrl'),
      addedAt: DateTime.tryParse(str('addedAt') ?? ''),
    );
  }

  @override
  bool operator ==(Object other) =>
      other is CompareSelection &&
      other.variantId == variantId &&
      other.modelYear == modelYear &&
      other.marketCode == marketCode &&
      other.title == title &&
      other.variantSlug == variantSlug &&
      other.modelSlug == modelSlug &&
      other.subtitle == subtitle &&
      other.imageUrl == imageUrl;

  @override
  int get hashCode => Object.hash(variantId, modelYear, marketCode, title, variantSlug, modelSlug, subtitle, imageUrl);
}

/// Result of [CompareTrayController.add].
enum CompareAddResult { added, alreadyInTray, full }

/// The cars selected for comparison (2–4), shared by the cars and compare
/// features and persisted across restarts (REQUIREMENTS §22: comparisons
/// survive a restart).
///
/// ```dart
/// final tray = ref.watch(compareTrayProvider);            // List<CompareSelection>
/// final result = ref.read(compareTrayProvider.notifier).add(selection);
/// if (result == CompareAddResult.full) showAppSnackBar(context, l10n.commonCompareFull(CompareTrayController.maxItems));
/// ```
class CompareTrayController extends Notifier<List<CompareSelection>> {
  static const maxItems = 4;
  static const minItems = 2;
  static const storageKey = 'compare.tray.v1';

  @override
  List<CompareSelection> build() {
    final raw = ref.watch(sharedPreferencesProvider).getString(storageKey);
    if (raw == null) return const [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      final seen = <String>{};
      final items = <CompareSelection>[];
      for (final e in decoded) {
        final s = CompareSelection.tryFromJson(e);
        if (s != null && seen.add(s.key) && items.length < maxItems) items.add(s);
      }
      return List.unmodifiable(items);
    } on FormatException {
      return const [];
    }
  }

  bool contains(String variantId, String marketCode) =>
      state.any((s) => s.variantId == variantId && s.marketCode == marketCode.toUpperCase());

  bool get isFull => state.length >= maxItems;

  /// Whether a comparison can be opened (at least [minItems]).
  bool get canCompare => state.length >= minItems;

  CompareAddResult add(CompareSelection selection) {
    if (state.any((s) => s.key == selection.key)) return CompareAddResult.alreadyInTray;
    if (isFull) return CompareAddResult.full;
    final stamped = selection.addedAt == null
        ? CompareSelection(
            variantId: selection.variantId,
            modelYear: selection.modelYear,
            marketCode: selection.marketCode.toUpperCase(),
            title: selection.title,
            variantSlug: selection.variantSlug,
            modelSlug: selection.modelSlug,
            subtitle: selection.subtitle,
            imageUrl: selection.imageUrl,
            addedAt: DateTime.now().toUtc(),
          )
        : selection;
    _set([...state, stamped]);
    return CompareAddResult.added;
  }

  void remove(String key) => _set(state.where((s) => s.key != key).toList());

  /// Adds or removes; returns the add result (or null when removed).
  CompareAddResult? toggle(CompareSelection selection) {
    if (state.any((s) => s.key == selection.key)) {
      remove(selection.key);
      return null;
    }
    return add(selection);
  }

  /// Replaces one item (e.g. the user picked another trim/year/market for
  /// the same slot). No-op when [oldKey] is not in the tray; refuses a
  /// duplicate of another slot.
  bool replace(String oldKey, CompareSelection next) {
    final i = state.indexWhere((s) => s.key == oldKey);
    if (i < 0) return false;
    if (next.key != oldKey && state.any((s) => s.key == next.key)) return false;
    final list = [...state]..[i] = next;
    _set(list);
    return true;
  }

  void reorder(int oldIndex, int newIndex) {
    if (oldIndex < 0 || oldIndex >= state.length) return;
    final list = [...state];
    final item = list.removeAt(oldIndex);
    list.insert(newIndex.clamp(0, list.length), item);
    _set(list);
  }

  /// Replaces the whole tray (e.g. "edit this shared comparison").
  void setAll(List<CompareSelection> items) {
    final seen = <String>{};
    _set(
      [
        for (final s in items)
          if (seen.add(s.key)) s,
      ].take(maxItems).toList(),
    );
  }

  void clear() => _set(const []);

  void _set(List<CompareSelection> next) {
    state = List.unmodifiable(next);
    // Fire-and-forget: SharedPreferences updates its cache synchronously.
    ref.read(sharedPreferencesProvider).setString(storageKey, jsonEncode([for (final s in next) s.toJson()]));
  }
}

final compareTrayProvider = NotifierProvider<CompareTrayController, List<CompareSelection>>(CompareTrayController.new);
