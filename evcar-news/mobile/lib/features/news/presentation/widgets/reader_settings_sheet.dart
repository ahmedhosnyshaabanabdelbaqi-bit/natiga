import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/text_scaling.dart';
import '../../../../shared/widgets/kit.dart';
import '../../application/reader_settings.dart';

/// Opens the reading comfort sheet (text size, line spacing, theme). Changes
/// apply live and are remembered on the device.
Future<void> showReaderSettingsSheet(BuildContext context) {
  final l10n = context.l10n;
  return showAppBottomSheet<void>(
    context: context,
    title: l10n.newsReaderSettings,
    builder: (context) => const _ReaderSettingsForm(),
  );
}

class _ReaderSettingsForm extends ConsumerWidget {
  const _ReaderSettingsForm();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final s = ref.watch(readerSettingsProvider);
    final ctrl = ref.read(readerSettingsProvider.notifier);
    final percent = AppFormatters.of(context).percent(s.fontScale * 100) ?? '${(s.fontScale * 100).round()}%';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(header: true, child: Text(l10n.newsFontSize, style: theme.textTheme.titleSmall)),
        const SizedBox(height: AppSpacing.sm),
        Row(
          children: [
            IconButton.filledTonal(
              tooltip: l10n.newsFontSmaller,
              onPressed: s.canShrink ? ctrl.shrink : null,
              icon: const Icon(Icons.text_decrease),
            ),
            Expanded(
              child: Semantics(
                liveRegion: true,
                label: l10n.newsFontScaleValue(percent),
                excludeSemantics: true,
                child: Text(percent, textAlign: TextAlign.center, style: theme.textTheme.titleMedium),
              ),
            ),
            IconButton.filledTonal(
              tooltip: l10n.newsFontLarger,
              onPressed: s.canGrow ? ctrl.grow : null,
              icon: const Icon(Icons.text_increase),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.xl),
        Semantics(header: true, child: Text(l10n.newsLineSpacing, style: theme.textTheme.titleSmall)),
        const SizedBox(height: AppSpacing.sm),
        ChoicePills<ReaderLineSpacing>(
          options: {
            ReaderLineSpacing.compact: l10n.newsLineSpacingCompact,
            ReaderLineSpacing.comfortable: l10n.newsLineSpacingComfortable,
            ReaderLineSpacing.relaxed: l10n.newsLineSpacingRelaxed,
          },
          selected: s.lineSpacing,
          onSelected: ctrl.setLineSpacing,
        ),
        const SizedBox(height: AppSpacing.xl),
        Semantics(header: true, child: Text(l10n.newsReaderTheme, style: theme.textTheme.titleSmall)),
        const SizedBox(height: AppSpacing.sm),
        ChoicePills<ReaderTheme>(
          options: {
            ReaderTheme.app: l10n.newsReaderThemeApp,
            ReaderTheme.light: l10n.newsReaderThemeLight,
            ReaderTheme.dark: l10n.newsReaderThemeDark,
          },
          selected: s.theme,
          onSelected: ctrl.setTheme,
        ),
        const SizedBox(height: AppSpacing.xl),
        // Live sample of the chosen size and spacing.
        AppCard(
          child: MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: MultipliedTextScaler(MediaQuery.textScalerOf(context), s.fontScale)),
            child: Text(
              l10n.newsReaderPreview,
              style: theme.textTheme.bodyLarge?.copyWith(fontSize: 17, height: s.lineSpacing.height),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton.icon(
            onPressed: ctrl.reset,
            icon: const Icon(Icons.restart_alt),
            label: Text(l10n.commonReset),
          ),
        ),
      ],
    );
  }
}
