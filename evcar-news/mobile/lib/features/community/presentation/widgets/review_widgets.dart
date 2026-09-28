import 'package:flutter/material.dart';

import '../../../../shared/widgets/kit.dart';
import '../../domain/community_models.dart';
import 'community_ui.dart';

/// Localized name of a rating dimension (server labels win when present).
String dimensionLabel(AppLocalizations l10n, String code, {String? serverLabel}) {
  if (serverLabel != null && serverLabel.isNotEmpty && serverLabel != code) return serverLabel;
  return switch (code) {
    'range_real_world' => l10n.communityDimRange,
    'charging' => l10n.communityDimCharging,
    'comfort' => l10n.communityDimComfort,
    'technology' => l10n.communityDimTechnology,
    'build_quality' => l10n.communityDimBuildQuality,
    'value_for_money' => l10n.communityDimValue,
    'reliability' => l10n.communityDimReliability,
    'after_sales' => l10n.communityDimAfterSales,
    _ => code,
  };
}

/// "8 months" / "2 years 3 months" of ownership.
String? ownershipLabel(AppLocalizations l10n, int? months) {
  if (months == null) return null;
  if (months < 12) return l10n.communityOwnedMonths(months);
  final years = months ~/ 12;
  final rest = months % 12;
  return rest == 0 ? l10n.communityOwnedYears(years) : l10n.communityOwnedYearsMonths(years, rest);
}

/// Average, distribution (bars with counts in text) and dimension averages.
///
/// No review → nothing is averaged: the caller shows an empty state; a
/// dimension nobody rated shows "Not available", never 0.
class ReviewSummaryCard extends StatelessWidget {
  const ReviewSummaryCard({super.key, required this.summary});

  final ReviewSummary summary;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final avg = summary.average;
    final rated = summary.dimensions.where((d) => d.count > 0).toList();
    final maxCount = summary.distribution.fold<int>(0, (m, b) => b.count > m ? b.count : m);
    final avgText = avg == null ? null : fmt.number(avg, maxDecimals: 1, minDecimals: 1);

    final headline = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (avgText != null)
          Text(
            avgText,
            style: theme.textTheme.displaySmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: theme.colorScheme.primary,
            ),
          )
        else
          const NotAvailableValue(),
        if (avg != null) StarRatingDisplay(rating: avg, size: 20),
        const SizedBox(height: AppSpacing.xs),
        Text(
          l10n.communityReviewCount(summary.count),
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
      ],
    );

    final bars = Column(
      children: [
        for (final b in summary.distribution)
          Semantics(
            label: l10n.communityDistributionRow(b.rating, b.count),
            excludeSemantics: true,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  SizedBox(
                    width: 28,
                    child: Text(fmt.number(b.rating) ?? '${b.rating}', style: theme.textTheme.labelMedium),
                  ),
                  Icon(Icons.star_rounded, size: 14, color: context.palette.tone(AppTone.warning).onContainer),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: AppRadii.pill,
                      child: LinearProgressIndicator(
                        value: maxCount == 0 ? 0 : b.count / maxCount,
                        minHeight: 8,
                        backgroundColor: theme.colorScheme.surfaceContainerHighest,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  SizedBox(
                    width: 32,
                    child: Text(
                      fmt.number(b.count) ?? '${b.count}',
                      textAlign: TextAlign.end,
                      style: theme.textTheme.labelMedium,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LayoutBuilder(
            builder: (context, c) {
              final stacked = c.maxWidth < 320 || context.textScale > 1.4;
              if (stacked) {
                return Column(
                  children: [
                    headline,
                    const SizedBox(height: AppSpacing.md),
                    bars,
                  ],
                );
              }
              return Row(
                children: [
                  SizedBox(width: 112, child: headline),
                  const SizedBox(width: AppSpacing.lg),
                  Expanded(child: bars),
                ],
              );
            },
          ),
          if (summary.verifiedOwnerCount > 0) ...[
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                const Icon(Icons.verified_outlined, size: 18),
                const SizedBox(width: AppSpacing.sm),
                Expanded(child: Text(l10n.communityVerifiedOwnerCount(summary.verifiedOwnerCount))),
              ],
            ),
          ],
          if (rated.isNotEmpty) ...[
            const Divider(height: AppSpacing.xl),
            Semantics(
              header: true,
              child: Text(
                l10n.communityDimensionsTitle,
                style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            for (final d in summary.dimensions)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                child: Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.xs,
                  children: [
                    Text(dimensionLabel(l10n, d.dimension, serverLabel: d.label)),
                    if (d.average == null)
                      const NotAvailableValue()
                    else
                      Semantics(
                        label: l10n.communityDimensionValue(fmt.number(d.average, maxDecimals: 1) ?? '', d.count),
                        excludeSemantics: true,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            StarRatingDisplay(rating: d.average!, size: 14),
                            const SizedBox(width: AppSpacing.xs),
                            Text(
                              fmt.number(d.average, maxDecimals: 1, minDecimals: 1) ?? '',
                              style: theme.textTheme.labelLarge,
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}

/// One owner review.
class ReviewCard extends StatelessWidget {
  const ReviewCard({
    super.key,
    required this.review,
    required this.onVote,
    this.onEdit,
    this.onDelete,
    this.onReport,
    this.onMute,
    this.trimLabel,
  });

  final Review review;
  final ValueChanged<int> onVote;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;
  final VoidCallback? onReport;
  final VoidCallback? onMute;

  /// Trim reviewed (shown when the list mixes trims).
  final String? trimLabel;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final r = review;
    final owned = ownershipLabel(l10n, r.ownershipMonths);
    return AppCard(
      padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.lg, AppSpacing.md, AppSpacing.xs, AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PostHeader(
            author: r.author,
            createdAt: r.createdAt,
            editedAt:
                (r.updatedAt != null && r.createdAt != null && r.updatedAt!.difference(r.createdAt!).inMinutes > 1)
                ? r.updatedAt
                : null,
            isMine: r.isMine,
            // The badge only when the API says the author is a verified owner.
            badges: [if (r.verifiedOwner) VerifiedOwnerBadge(label: r.verifiedOwnerLabel)],
            trailing: PostActionsMenu(
              isMine: r.isMine,
              onEdit: r.status == ModerationStatus.hidden ? null : onEdit,
              onDelete: onDelete,
              onReport: r.status.isPublic ? onReport : null,
              onMute: r.author.id == null ? null : onMute,
            ),
          ),
          Padding(
            padding: const EdgeInsetsDirectional.only(end: AppSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (!r.status.isPublic) ...[
                  const SizedBox(height: AppSpacing.sm),
                  ModerationNotice(status: r.status, isReview: true),
                ],
                const SizedBox(height: AppSpacing.md),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.xs,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    StarRatingDisplay(rating: r.rating.toDouble()),
                    if (owned != null) Pill(label: owned, icon: Icons.schedule, dense: true),
                    if (trimLabel != null) Pill(label: trimLabel!, icon: Icons.directions_car_outlined, dense: true),
                  ],
                ),
                if (r.title != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Text(r.title!, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                ],
                const SizedBox(height: AppSpacing.xs),
                ExpandableBody(text: r.body),
                if (r.pros != null) _ProsCons(positive: true, text: r.pros!),
                if (r.cons != null) _ProsCons(positive: false, text: r.cons!),
                if (r.ratings.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.xs,
                    children: [
                      for (final d in r.ratings)
                        Pill(
                          label:
                              '${dimensionLabel(l10n, d.dimension, serverLabel: d.label)} · ${AppFormatters.of(context).number(d.score) ?? d.score}/5',
                          semanticLabel: l10n.communityDimensionScore(
                            dimensionLabel(l10n, d.dimension, serverLabel: d.label),
                            d.score,
                          ),
                          dense: true,
                          tone: AppTone.info,
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          HelpfulVoteBar(votes: r.votes, isMine: r.isMine, enabled: r.status.isPublic, onVote: onVote),
        ],
      ),
    );
  }
}

class _ProsCons extends StatelessWidget {
  const _ProsCons({required this.positive, required this.text});

  final bool positive;
  final String text;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final colors = context.palette.tone(positive ? AppTone.success : AppTone.danger);
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(positive ? Icons.add_circle_outline : Icons.remove_circle_outline, size: 20, color: colors.onContainer),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: '${positive ? l10n.communityPros : l10n.communityCons}: ',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  TextSpan(text: text),
                ],
              ),
              style: theme.textTheme.bodyMedium,
            ),
          ),
        ],
      ),
    );
  }
}

/// Trim picker (reviews are per trim): opens a sheet with every trim.
class TrimSelector extends StatelessWidget {
  const TrimSelector({super.key, required this.trims, required this.selected, required this.onChanged});

  final List<CommunityTrim> trims;
  final CommunityTrim selected;
  final ValueChanged<CommunityTrim> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      semanticLabel: l10n.communityTrimSemantics(selected.label),
      onTap: trims.length < 2
          ? null
          : () => showAppBottomSheet<void>(
              context: context,
              title: l10n.communityChooseTrim,
              builder: (sheetContext) => RadioGroup<String>(
                groupValue: selected.id,
                onChanged: (id) {
                  final t = trims.firstWhere((e) => e.id == id);
                  Navigator.of(sheetContext).pop();
                  onChanged(t);
                },
                child: ListView(
                  shrinkWrap: true,
                  children: [
                    for (final t in trims)
                      RadioListTile<String>(
                        value: t.id,
                        title: Text(t.label),
                        secondary: t.isDemo ? const DemoBadge(dense: true) : null,
                      ),
                  ],
                ),
              ),
            ),
      child: Row(
        children: [
          Icon(Icons.tune, color: theme.colorScheme.primary),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.communityTrimLabel,
                  style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
                Text(selected.label, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
              ],
            ),
          ),
          if (trims.length > 1) const Icon(Icons.expand_more),
        ],
      ),
    );
  }
}
