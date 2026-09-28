import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/app_config/app_config_controller.dart';
import '../../../../shared/widgets/kit.dart';
import '../../domain/tour_models.dart';
import 'tour_labels.dart';

/// What the tour is bound to — trim, model year, market, interior colour and
/// drive side (REQUIREMENTS §8) — as wrapping pills (never colour-only: the
/// swatch always has its name next to it).
class TourBindingPills extends ConsumerWidget {
  const TourBindingPills({super.key, required this.card, this.onDark = false, this.dense = false});

  final TourCard card;

  /// Glass style over the panorama.
  final bool onDark;
  final bool dense;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final market = marketName(ref, context, card.marketCode);
    final items = <(IconData?, Color?, String)>[
      if (card.variantName != null) (Icons.tune, null, l10n.toursTrim(card.variantName!)),
      if (card.modelYear != null) (Icons.calendar_today_outlined, null, l10n.toursModelYear(TourLabels.year(fmt, card.modelYear!))),
      if (market != null) (Icons.public, null, l10n.toursMarket(market)),
      if (card.interiorColorName != null)
        (null, TourLabels.parseHex(card.interiorColorHex), l10n.toursInterior(card.interiorColorName!)),
      (Icons.swap_horiz, null, TourLabels.driveSide(l10n, card.driveSide)),
    ];
    return Wrap(
      spacing: AppSpacing.xs,
      runSpacing: AppSpacing.xs,
      children: [for (final (icon, swatch, label) in items) _BindingPill(icon: icon, swatch: swatch, label: label, onDark: onDark, dense: dense)],
    );
  }

  static String? marketName(WidgetRef ref, BuildContext context, String? code) {
    if (code == null) return null;
    final config = ref.watch(appConfigProvider);
    return config.marketByCode(code)?.nameFor(context.languageCode) ?? code;
  }
}

class _BindingPill extends StatelessWidget {
  const _BindingPill({required this.label, required this.onDark, required this.dense, this.icon, this.swatch});

  final String label;
  final IconData? icon;
  final Color? swatch;
  final bool onDark;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fg = onDark ? Colors.white : theme.colorScheme.onSurfaceVariant;
    final bg = onDark ? Colors.black.withValues(alpha: 0.45) : theme.colorScheme.surfaceContainerHighest;
    return Container(
      padding: EdgeInsetsDirectional.fromSTEB(8, dense ? 3 : 5, 10, dense ? 3 : 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: AppRadii.pill,
        border: Border.all(color: onDark ? Colors.white.withValues(alpha: 0.3) : theme.colorScheme.outlineVariant),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (swatch != null)
            Container(
              width: 14,
              height: 14,
              decoration: BoxDecoration(
                color: swatch,
                shape: BoxShape.circle,
                border: Border.all(color: onDark ? Colors.white : theme.colorScheme.outline),
              ),
            )
          else
            Icon(icon ?? Icons.circle_outlined, size: 14, color: fg),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label,
              style: theme.textTheme.labelMedium?.copyWith(color: fg, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

/// Prominent note for a tour photographed in a similar trim.
class ReferenceTrimNotice extends StatelessWidget {
  const ReferenceTrimNotice({super.key, required this.card, this.compact = false});

  final TourCard card;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final tone = context.palette.tone(AppTone.warning);
    return Semantics(
      container: true,
      child: Container(
        padding: EdgeInsets.all(compact ? AppSpacing.sm : AppSpacing.md),
        decoration: BoxDecoration(
          color: tone.container,
          borderRadius: BorderRadius.circular(AppRadii.md),
          border: Border.all(color: tone.border),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.compare_arrows, color: tone.onContainer, size: 20),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.toursReferenceTitle,
                    style: theme.textTheme.labelLarge?.copyWith(color: tone.onContainer, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    [
                      l10n.toursReferenceBody(card.referenceVariantName ?? l10n.commonNotAvailable),
                      if (card.differenceNote != null) card.differenceNote!,
                    ].join('\n'),
                    maxLines: compact ? 4 : null,
                    overflow: compact ? TextOverflow.ellipsis : null,
                    style: theme.textTheme.bodySmall?.copyWith(color: tone.onContainer),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// "Demo — not a real car interior" banner for demo panoramas.
class DemoTourNotice extends StatelessWidget {
  const DemoTourNotice({super.key, required this.card, this.compact = false});

  final TourCard card;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = context.palette.tone(AppTone.demo);
    final text = TourLabels.demo(context.l10n, card);
    return Semantics(
      container: true,
      label: text,
      excludeSemantics: true,
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: compact ? AppSpacing.xs : AppSpacing.sm),
        decoration: BoxDecoration(
          color: tone.container,
          borderRadius: BorderRadius.circular(AppRadii.md),
          border: Border.all(color: tone.border),
        ),
        child: Row(
          children: [
            Icon(Icons.science_outlined, size: 18, color: tone.onContainer),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                text,
                style: theme.textTheme.labelLarge?.copyWith(color: tone.onContainer, fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
