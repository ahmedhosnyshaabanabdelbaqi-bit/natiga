/// Small presentational pieces shared by the personal features.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/kit.dart';
import '../../auth/domain/app_user.dart';
import '../../auth/domain/auth_state.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../auth/presentation/auth_gate.dart';

/// "Next" chevron that points the right way in RTL and LTR.
class ForwardChevron extends StatelessWidget {
  const ForwardChevron({super.key, this.size});

  final double? size;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(child: Icon(Icons.chevron_right, size: size));
}

/// Label + value line that wraps at large text sizes; `null` value →
/// "Not available" (never 0).
class InfoRow extends StatelessWidget {
  const InfoRow({super.key, required this.label, required this.value, this.icon, this.valueStyle, this.trailing});

  final String label;
  final String? value;
  final IconData? icon;
  final TextStyle? valueStyle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      container: true,
      label: '$label: ${value ?? context.l10n.commonNotAvailable}',
      excludeSemantics: trailing == null,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 20, color: theme.colorScheme.onSurfaceVariant),
              const SizedBox(width: AppSpacing.sm),
            ],
            Expanded(
              child: Wrap(
                alignment: WrapAlignment.spaceBetween,
                spacing: AppSpacing.md,
                runSpacing: AppSpacing.xxs,
                children: [
                  Text(label, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                  ValueOrNotAvailable(
                    value,
                    style: valueStyle ?? theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
            ?trailing,
          ],
        ),
      ),
    );
  }
}

/// Titled card section used in detail and form screens.
class SectionCard extends StatelessWidget {
  const SectionCard({super.key, required this.title, required this.child, this.icon, this.trailing, this.subtitle});

  final String title;
  final String? subtitle;
  final IconData? icon;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              if (icon != null) ...[
                Icon(icon, color: theme.colorScheme.primary, size: 22),
                const SizedBox(width: AppSpacing.sm),
              ],
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                ),
              ),
              ?trailing,
            ],
          ),
          if (subtitle != null) ...[
            const SizedBox(height: AppSpacing.xxs),
            Text(subtitle!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ],
          const SizedBox(height: AppSpacing.md),
          child,
        ],
      ),
    );
  }
}

/// Inline notice with icon + text (never colour alone).
class InlineNotice extends StatelessWidget {
  const InlineNotice({super.key, required this.message, this.tone = AppTone.info, this.icon, this.action});

  final String message;
  final AppTone tone;
  final IconData? icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final colors = palette.tone(tone);
    final theme = Theme.of(context);
    return Semantics(
      container: true,
      liveRegion: tone == AppTone.danger || tone == AppTone.warning,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(color: colors.container, borderRadius: BorderRadius.circular(AppRadii.md)),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              icon ??
                  switch (tone) {
                    AppTone.warning => Icons.warning_amber_rounded,
                    AppTone.danger => Icons.error_outline,
                    AppTone.success => Icons.check_circle_outline,
                    _ => Icons.info_outline,
                  },
              color: colors.onContainer,
              size: 20,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(message, style: theme.textTheme.bodyMedium?.copyWith(color: colors.onContainer)),
                  if (action != null) ...[const SizedBox(height: AppSpacing.xs), action!],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Floating action button with a label that collapses at huge text sizes.
class AddFab extends StatelessWidget {
  const AddFab({super.key, required this.label, required this.onPressed, this.icon = Icons.add, this.heroTag});

  final String label;
  final VoidCallback? onPressed;
  final IconData icon;
  final Object? heroTag;

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton.extended(
      heroTag: heroTag,
      onPressed: onPressed,
      icon: Icon(icon),
      label: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.55),
        child: Text(label, overflow: TextOverflow.ellipsis),
      ),
    );
  }
}

/// Personal screens: the signed-in [builder] draws its own scaffold; guests
/// (and a session being restored) get a plain page with [title] and the
/// "sign in to use this" explanation that returns to [returnTo].
class PersonalPage extends ConsumerWidget {
  const PersonalPage({
    super.key,
    required this.title,
    required this.returnTo,
    required this.builder,
    this.guestMessage,
  });

  final String title;
  final String returnTo;
  final String? guestMessage;
  final Widget Function(BuildContext context, AppUser user) builder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    if (auth is AuthSignedIn) return builder(context, auth.user);
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: AuthGate(
        returnTo: returnTo,
        guestMessage: guestMessage,
        builder: (context, user) => const SizedBox.shrink(),
      ),
    );
  }
}
