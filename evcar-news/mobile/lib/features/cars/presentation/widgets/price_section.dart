import 'package:flutter/material.dart';

import '../../../../shared/widgets/kit.dart';
import '../../domain/catalog_models.dart';
import '../../domain/variant_sheet.dart';
import 'car_labels.dart';

/// Current price of the trim in the chosen market (type, effective date,
/// source) + the full price history. A foreign-currency figure is always
/// labelled as a converted estimate, never as a local official price.
class PriceSection extends StatelessWidget {
  const PriceSection({super.key, required this.sheet, this.showHistory = true});

  final VariantSheet sheet;
  final bool showHistory;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final p = sheet.currentPrice;
    final market = sheet.market;
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.sell_outlined, color: theme.colorScheme.primary),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    l10n.carsPriceIn(market.name),
                    style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          PriceTag(
            price: p == null ? null : fmt.money(p.amount.amount, p.amount.currency),
            type: p == null ? null : PriceType.fromApi(p.priceType),
            isConverted: p != null && !p.inMarketCurrency,
            effectiveDate: p?.effectiveFrom,
            sourceName: p?.provenance.source?.displayName,
            onSourceTap: p?.provenance.source == null
                ? null
                : () => showSourceSheet(context, p!.provenance.source!, p.provenance),
          ),
          if (p != null && reliabilityOf(p.provenance) != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: ReliabilityBadge(reliability: reliabilityOf(p.provenance)!, dense: true),
            ),
          ],
          if (p != null && p.notes != null && p.notes!.trim().isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(p.notes!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ],
          if (p == null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              market.offered ? l10n.carsNoLocalPrice(market.name) : l10n.carsNotOfferedInMarket(market.name),
              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
          if (showHistory && sheet.priceHistory.length > 1) ...[
            const SizedBox(height: AppSpacing.md),
            _PriceHistory(history: sheet.priceHistory),
          ],
        ],
      ),
    );
  }
}

class _PriceHistory extends StatelessWidget {
  const _PriceHistory({required this.history});

  final List<CarPrice> history;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    return Theme(
      data: theme.copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        childrenPadding: EdgeInsets.zero,
        leading: const Icon(Icons.history),
        title: Text(l10n.carsPriceHistory(history.length)),
        children: [
          for (final h in history)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.xs,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        fmt.money(h.amount.amount, h.amount.currency) ?? l10n.commonNotAvailable,
                        style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      if (!h.inMarketCurrency)
                        Pill(
                          label: l10n.commonPriceConverted,
                          icon: Icons.currency_exchange,
                          tone: AppTone.warning,
                          dense: true,
                        )
                      else if (PriceType.fromApi(h.priceType) != null)
                        Pill(label: PriceTag.typeLabel(l10n, PriceType.fromApi(h.priceType)!), dense: true),
                      if (h.isCurrent)
                        Pill(label: l10n.carsPriceCurrent, icon: Icons.check, tone: AppTone.success, dense: true),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    h.effectiveTo == null
                        ? l10n.carsPriceSince(fmt.date(h.effectiveFrom) ?? l10n.commonNotAvailable)
                        : l10n.carsPricePeriod(
                            fmt.date(h.effectiveFrom) ?? l10n.commonNotAvailable,
                            fmt.date(h.effectiveTo)!,
                          ),
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                  if (h.provenance.source != null)
                    SourceBadge(
                      sourceName: h.provenance.source!.displayName,
                      verifiedAt: h.provenance.verifiedAt,
                      onTap: () => showSourceSheet(context, h.provenance.source!, h.provenance),
                      dense: true,
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
