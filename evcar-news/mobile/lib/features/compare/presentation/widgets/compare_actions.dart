import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/api/api_exception.dart';
import '../../../../core/app_config/app_config_controller.dart';
import '../../../../core/errors/app_errors.dart';
import '../../../../shared/widgets/kit.dart';
import '../../../auth/presentation/auth_controller.dart';
import '../../application/compare_providers.dart';
import '../../domain/comparison_models.dart';

/// Picker route that fills a new slot, or replaces [replaceKey] in the tray.
String comparePickerLocation({String? replaceKey}) => replaceKey == null
    ? AppRoutes.comparePicker
    : Uri(path: AppRoutes.comparePicker, queryParameters: {'replace': replaceKey}).toString();

/// Localized message for a failed save / share.
String compareSaveErrorMessage(AppLocalizations l10n, Object error) {
  if (error is ApiException && error.code == 'COMPARISON_LIMIT_REACHED') return l10n.compareSaveLimitReached;
  return errorMessage(l10n, error);
}

/// Saves the tray: signed in → the account (+ share link); guests are asked
/// to sign in or to create a share link instead.
Future<SavedComparison?> saveTrayComparison(BuildContext context, WidgetRef ref, List<CompareSelection> items) async {
  final l10n = context.l10n;
  final signedIn = ref.read(authControllerProvider).isSignedIn;
  if (!signedIn) {
    final choice = await showAppBottomSheet<String>(
      context: context,
      title: l10n.compareSaveGuestTitle,
      builder: (context) => Padding(
        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.compareSaveGuestMessage, style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: AppSpacing.lg),
            PrimaryButton(
              label: l10n.commonSignIn,
              icon: Icons.login,
              expand: true,
              onPressed: () => Navigator.of(context).pop('signin'),
            ),
            const SizedBox(height: AppSpacing.sm),
            SecondaryButton(
              label: l10n.compareShareLinkInstead,
              icon: Icons.link,
              expand: true,
              onPressed: () => Navigator.of(context).pop('share'),
            ),
          ],
        ),
      ),
    );
    if (!context.mounted) return null;
    if (choice == 'signin') {
      await context.push(AppRoutes.login(from: AppRoutes.compare));
      return null;
    }
    if (choice == 'share') return shareTrayComparison(context, ref, items);
    return null;
  }
  try {
    final saved = await ref.read(compareRepositoryProvider).create(items);
    ref.invalidate(myComparisonsProvider);
    if (!context.mounted) return saved;
    showAppSnackBar(
      context,
      saved.reused == true ? l10n.compareAlreadySaved : l10n.compareSaved,
      tone: AppTone.success,
      icon: Icons.bookmark_added_outlined,
      actionLabel: l10n.compareShare,
      onAction: () => shareComparisonLink(ref, saved),
    );
    return saved;
  } on Object catch (e) {
    if (context.mounted) showAppSnackBar(context, compareSaveErrorMessage(l10n, e), tone: AppTone.danger);
    return null;
  }
}

/// Creates (or reuses) a share link for the tray and opens the share sheet.
Future<SavedComparison?> shareTrayComparison(BuildContext context, WidgetRef ref, List<CompareSelection> items) async {
  final l10n = context.l10n;
  try {
    final created = await ref.read(compareRepositoryProvider).create(items);
    if (created.saved == true) ref.invalidate(myComparisonsProvider);
    await shareComparisonLink(ref, created);
    return created;
  } on Object catch (e) {
    if (context.mounted) showAppSnackBar(context, compareSaveErrorMessage(l10n, e), tone: AppTone.danger);
    return null;
  }
}

/// Share sheet with `"<title>\n<https://evcar.news/compare/<shareId>>"`.
Future<void> shareComparisonLink(WidgetRef ref, SavedComparison c) {
  final base = ref.read(appConfigProvider).share;
  final url = c.shareUrl.startsWith('https://') ? c.shareUrl : base.comparisonUrl(c.shareId);
  return ref.read(compareShareProvider)(text: '${c.displayTitle}\n$url', subject: c.displayTitle);
}
