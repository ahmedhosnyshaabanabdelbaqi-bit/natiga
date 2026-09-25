import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../core/l10n/l10n.dart';

/// Reliability of a spec value (ARCHITECTURE §3).
enum Reliability {
  verified('verified'),
  manufacturerClaim('manufacturer_claim'),
  estimated('estimated'),
  unverified('unverified'),
  disputed('disputed');

  const Reliability(this.apiValue);

  /// Value used by the API.
  final String apiValue;

  static Reliability? fromApi(String? value) {
    for (final r in values) {
      if (r.apiValue == value) return r;
    }
    return null;
  }
}

/// Icon + text badge for a [Reliability] level — never colour-only.
class ReliabilityBadge extends StatelessWidget {
  const ReliabilityBadge({super.key, required this.reliability, this.dense = false});

  final Reliability reliability;
  final bool dense;

  static String labelFor(AppLocalizations l10n, Reliability r) => switch (r) {
    Reliability.verified => l10n.commonReliabilityVerified,
    Reliability.manufacturerClaim => l10n.commonReliabilityManufacturerClaim,
    Reliability.estimated => l10n.commonReliabilityEstimated,
    Reliability.unverified => l10n.commonReliabilityUnverified,
    Reliability.disputed => l10n.commonReliabilityDisputed,
  };

  static IconData iconFor(Reliability r) => switch (r) {
    Reliability.verified => Icons.verified_outlined,
    Reliability.manufacturerClaim => Icons.factory_outlined,
    Reliability.estimated => Icons.calculate_outlined,
    Reliability.unverified => Icons.help_outline,
    Reliability.disputed => Icons.report_problem_outlined,
  };

  static Color colorFor(Reliability r) => switch (r) {
    Reliability.verified => AppColors.success,
    Reliability.manufacturerClaim => AppColors.info,
    Reliability.estimated => AppColors.warning,
    Reliability.unverified => AppColors.neutral,
    Reliability.disputed => AppColors.danger,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final label = labelFor(l10n, reliability);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final base = colorFor(reliability);
    final fg = isDark ? Color.lerp(base, Colors.white, 0.55)! : base;
    final textStyle = (dense ? Theme.of(context).textTheme.labelSmall : Theme.of(context).textTheme.labelMedium)
        ?.copyWith(color: fg, fontWeight: FontWeight.w600);
    return Semantics(
      label: l10n.commonReliabilityLabel(label),
      excludeSemantics: true,
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: dense ? 6 : 8, vertical: dense ? 2 : 4),
        decoration: BoxDecoration(
          color: fg.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: fg.withValues(alpha: 0.45)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(iconFor(reliability), size: dense ? 14 : 16, color: fg),
            const SizedBox(width: 4),
            Flexible(
              child: Text(label, style: textStyle, overflow: TextOverflow.ellipsis),
            ),
          ],
        ),
      ),
    );
  }
}
