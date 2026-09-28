import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/api/api_exception.dart';
import '../../../../core/errors/app_errors.dart';
import '../../../../shared/widgets/kit.dart';

/// User-facing message for a failed community write (409 duplicate, 429
/// limits with Retry-After, 422 fields, offline…). Server messages are
/// already localized.
String submitErrorMessage(AppLocalizations l10n, Object e) {
  if (e is ApiException) {
    if (e.kind == ApiErrorKind.unauthorized) return l10n.chargingSignInAgain;
    if (e.kind == ApiErrorKind.validation && e.fieldErrors.isNotEmpty) {
      return [for (final f in e.fieldErrors) ...f.messages].join('\n');
    }
  }
  return errorMessage(l10n, e);
}

/// Inline error banner of a form.
class FormErrorBanner extends StatelessWidget {
  const FormErrorBanner({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = context.palette.tone(AppTone.danger);
    return Semantics(
      liveRegion: true,
      child: Container(
        margin: const EdgeInsets.only(bottom: AppSpacing.lg),
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: colors.container,
          border: Border.all(color: colors.border),
          borderRadius: const BorderRadius.all(Radius.circular(AppRadii.md)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.error_outline, color: colors.onContainer),
            const SizedBox(width: AppSpacing.sm),
            Expanded(child: Text(message, style: TextStyle(color: colors.onContainer))),
          ],
        ),
      ),
    );
  }
}

/// Section title inside forms.
class FormLabel extends StatelessWidget {
  const FormLabel(this.text, {super.key, this.optional = false});

  final String text;
  final bool optional;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.lg, bottom: AppSpacing.sm),
      child: Semantics(
        header: true,
        child: Text.rich(
          TextSpan(
            text: text,
            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
            children: [
              if (optional)
                TextSpan(
                  text: ' · ${context.l10n.chargingOptional}',
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// "Thanks" state after a successful submission.
class SubmittedView extends StatelessWidget {
  const SubmittedView({super.key, required this.title, required this.message, this.extra});

  final String title;
  final String message;
  final Widget? extra;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n;
    return ListView(
      padding: EdgeInsets.all(context.pageGutter),
      children: [
        const SizedBox(height: AppSpacing.xxl),
        Icon(Icons.check_circle_outline, size: 72, color: theme.colorScheme.primary),
        const SizedBox(height: AppSpacing.lg),
        Semantics(
          header: true,
          liveRegion: true,
          child: Text(
            title,
            textAlign: TextAlign.center,
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(message, textAlign: TextAlign.center, style: theme.textTheme.bodyMedium),
        if (extra != null) ...[const SizedBox(height: AppSpacing.xl), extra!],
        const SizedBox(height: AppSpacing.xl),
        Center(
          child: PrimaryButton(
            label: l10n.commonDone,
            onPressed: () => context.canPop() ? context.pop() : context.go('/charging'),
          ),
        ),
      ],
    );
  }
}
