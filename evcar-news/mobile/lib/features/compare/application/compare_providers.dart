import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/paged.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../core/settings/settings_controller.dart';
import '../../../shared/compare_tray.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/compare_repository.dart';
import '../domain/comparison_models.dart';
import '../domain/picker_models.dart';
import '../domain/recommendation_models.dart';

final compareRepositoryProvider = Provider<CompareRepository>(
  (ref) => CompareRepository(
    api: ref.watch(apiClientProvider),
    cache: ref.watch(jsonCacheProvider),
    locale: () => ref.read(requestLocaleProvider),
  ),
);

/// Share sheet (injectable for tests).
final compareShareProvider = Provider<Future<void> Function({required String text, required String subject})>(
  (ref) =>
      ({required text, required subject}) => SharePlus.instance.share(ShareParams(text: text, subject: subject)),
);

// ---------------------------------------------------------------------------
// Comparison of the tray
// ---------------------------------------------------------------------------

/// The ordered items of a comparison request (equality by signature).
@immutable
class CompareRequest {
  CompareRequest(List<CompareSelection> items)
    : items = List.unmodifiable(items),
      signature = comparisonSignature(items);

  final List<CompareSelection> items;
  final String signature;

  @override
  bool operator ==(Object other) => other is CompareRequest && other.signature == signature;

  @override
  int get hashCode => signature.hashCode;
}

final comparisonProvider = FutureProvider.autoDispose.family<CachedResult<ComparisonData>, CompareRequest>((
  ref,
  request,
) {
  ref.watch(effectiveLanguageProvider);
  return ref.watch(compareRepositoryProvider).compute(request.items);
});

/// How the comparison is shown: summary (key rows) or detailed, and whether
/// rows where every car is equal are hidden. Remembered on the device.
@immutable
class CompareViewOptions {
  const CompareViewOptions({this.summary = false, this.differencesOnly = false});

  final bool summary;
  final bool differencesOnly;

  CompareViewOptions copyWith({bool? summary, bool? differencesOnly}) =>
      CompareViewOptions(summary: summary ?? this.summary, differencesOnly: differencesOnly ?? this.differencesOnly);

  @override
  bool operator ==(Object other) =>
      other is CompareViewOptions && other.summary == summary && other.differencesOnly == differencesOnly;

  @override
  int get hashCode => Object.hash(summary, differencesOnly);
}

class CompareViewController extends Notifier<CompareViewOptions> {
  static const _summaryKey = 'compare.view.summary.v1';
  static const _diffKey = 'compare.view.differencesOnly.v1';

  @override
  CompareViewOptions build() {
    final prefs = ref.watch(sharedPreferencesProvider);
    return CompareViewOptions(
      summary: prefs.getBool(_summaryKey) ?? false,
      differencesOnly: prefs.getBool(_diffKey) ?? false,
    );
  }

  void setSummary(bool value) {
    state = state.copyWith(summary: value);
    ref.read(sharedPreferencesProvider).setBool(_summaryKey, value);
  }

  void setDifferencesOnly(bool value) {
    state = state.copyWith(differencesOnly: value);
    ref.read(sharedPreferencesProvider).setBool(_diffKey, value);
  }
}

final compareViewProvider = NotifierProvider<CompareViewController, CompareViewOptions>(CompareViewController.new);

// ---------------------------------------------------------------------------
// Saved / shared / featured
// ---------------------------------------------------------------------------

final sharedComparisonProvider = FutureProvider.autoDispose.family<CachedResult<SharedComparison>, String>((
  ref,
  shareId,
) {
  ref.watch(effectiveLanguageProvider);
  return ref.watch(compareRepositoryProvider).shared(shareId);
});

final featuredComparisonsProvider = FutureProvider.autoDispose<CachedResult<List<SavedComparison>>>((ref) {
  ref.watch(requestLocaleProvider);
  return ref.watch(compareRepositoryProvider).featured();
});

/// The signed-in user's saved comparisons; null for guests.
final myComparisonsProvider = FutureProvider.autoDispose<Paged<SavedComparison>?>((ref) async {
  ref.watch(effectiveLanguageProvider);
  final signedIn = ref.watch(authControllerProvider.select((s) => s.isSignedIn));
  if (!signedIn) return null;
  return ref.watch(compareRepositoryProvider).mine();
});

// ---------------------------------------------------------------------------
// Picker + recommendations
// ---------------------------------------------------------------------------

final pickerProvider = FutureProvider.autoDispose.family<CachedResult<PickerPage>, PickerQuery>((ref, query) {
  ref.watch(effectiveLanguageProvider);
  return ref.watch(compareRepositoryProvider).pickers(query);
});

final recommendationProvider = FutureProvider.autoDispose.family<RecommendationResult, RecommendationInput>((
  ref,
  input,
) {
  ref.watch(effectiveLanguageProvider);
  return ref.watch(compareRepositoryProvider).recommend(input);
});
