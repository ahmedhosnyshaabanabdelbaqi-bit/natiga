import 'package:flutter/material.dart';

import '../../app/theme/app_palette.dart';
import '../../core/formatting/formatters.dart';
import '../../core/l10n/l10n.dart';
import 'badges.dart';
import 'source_badge.dart';

/// `priceType` of the API (ARCHITECTURE §3).
enum PriceType {
  officialMsrp('official_msrp'),
  dealer('dealer'),
  marketEstimate('market_estimate');

  const PriceType(this.apiValue);

  final String apiValue;

  static PriceType? fromApi(String? value) {
    for (final t in values) {
      if (t.apiValue == value) return t;
    }
    return null;
  }
}

/// A price exactly as the rules require: amount (already formatted with
/// `AppFormatters.money`) + its type + effective date + source.
///
/// * `price == null` → "Price not available" (never 0).
/// * [isConverted] → mandatory "Estimate after conversion" warning pill; a
///   converted price is never presented as an official local price.
///
/// ```dart
/// PriceTag(
///   price: fmt.money(p.amount, p.currency),
///   type: PriceType.fromApi(p.priceType),
///   isConverted: p.isConverted,
///   effectiveDate: p.effectiveFrom,
///   sourceName: p.source?.name,
/// )
/// ```
class PriceTag extends StatelessWidget {
  const PriceTag({
    super.key,
    required this.price,
    this.type,
    this.isConverted = false,
    this.effectiveDate,
    this.sourceName,
    this.onSourceTap,
    this.compact = false,
  });

  final String? price;
  final PriceType? type;
  final bool isConverted;
  final DateTime? effectiveDate;
  final String? sourceName;
  final VoidCallback? onSourceTap;

  /// One line + pills only (cards); the full form adds date and source.
  final bool compact;

  static String typeLabel(AppLocalizations l10n, PriceType type) => switch (type) {
    PriceType.officialMsrp => l10n.commonPriceOfficialMsrp,
    PriceType.dealer => l10n.commonPriceDealer,
    PriceType.marketEstimate => l10n.commonPriceMarketEstimate,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final value = price?.trim();
    final hasPrice = value != null && value.isNotEmpty;
    final date = fmt.date(effectiveDate);

    final priceText = hasPrice
        ? Text(
            value,
            style: (compact ? theme.textTheme.titleMedium : theme.textTheme.headlineSmall)?.copyWith(
              fontWeight: FontWeight.w700,
              color: theme.colorScheme.onSurface,
            ),
          )
        : Text(
            l10n.commonPriceNotAvailable,
            style: (compact ? theme.textTheme.bodyMedium : theme.textTheme.titleMedium)?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              fontStyle: FontStyle.italic,
            ),
          );

    final pills = <Widget>[
      if (hasPrice && isConverted)
        Pill(label: l10n.commonPriceConverted, icon: Icons.currency_exchange, tone: AppTone.warning, dense: compact)
      else if (hasPrice && type != null)
        Pill(
          label: typeLabel(l10n, type!),
          icon: type == PriceType.officialMsrp ? Icons.verified_outlined : Icons.sell_outlined,
          tone: type == PriceType.officialMsrp ? AppTone.success : AppTone.neutral,
          dense: compact,
        ),
      if (hasPrice && isConverted && type != null && type != PriceType.marketEstimate)
        Pill(label: typeLabel(l10n, type!), icon: Icons.sell_outlined, dense: compact),
    ];

    final semantics = [
      hasPrice ? value : l10n.commonPriceNotAvailable,
      if (hasPrice && isConverted) l10n.commonPriceConverted,
      if (hasPrice && type != null) typeLabel(l10n, type!),
      if (hasPrice && date != null) l10n.commonPriceAsOf(date),
    ].join('. ');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Semantics(
          label: semantics,
          excludeSemantics: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              priceText,
              if (pills.isNotEmpty) ...[const SizedBox(height: 4), Wrap(spacing: 6, runSpacing: 4, children: pills)],
              if (!compact && hasPrice && date != null) ...[
                const SizedBox(height: 4),
                Text(
                  l10n.commonPriceAsOf(date),
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
            ],
          ),
        ),
        if (!compact && hasPrice) SourceBadge(sourceName: sourceName, onTap: onSourceTap, dense: true),
      ],
    );
  }
}
