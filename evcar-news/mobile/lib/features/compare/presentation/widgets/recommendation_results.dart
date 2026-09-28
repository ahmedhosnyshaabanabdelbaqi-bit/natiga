import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/api/api_exception.dart';
import '../../../../shared/widgets/kit.dart';
import '../../application/compare_providers.dart';
import '../../domain/recommendation_models.dart';
import 'compare_labels.dart';

/// Results of the recommendation wizard: decision (or «لا يمكن الحسم»),
/// ranked cars with score breakdown and reasons, cars that could not be
/// ranked with their missing data, the weights used and why, and the
/// disclosure that ads never change results.
class RecommendationResultsView extends ConsumerWidget {
  const RecommendationResultsView({super.key, required this.input, required this.onEdit, required this.onIgnoreFactor});

  final RecommendationInput input;
  final VoidCallback onEdit;

  /// Re-runs with these raw weights (0–10); used by "ignore this factor".
  final ValueChanged<Map<RecFactor, double>> onIgnoreFactor;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final value = ref.watch(recommendationProvider(input));
    final gutter = context.pageGutter;
    return AppScaffold.slivers(
      title: l10n.compareRecResultsTitle,
      actions: [
        IconButton(tooltip: l10n.compareRecEditAnswers, icon: const Icon(Icons.edit_outlined), onPressed: onEdit),
      ],
      onRefresh: () async {
        ref.invalidate(recommendationProvider(input));
        await ref.read(recommendationProvider(input).future).then((_) {}, onError: (_) {});
      },
      slivers: [
        if (value.hasError && _validation(value.error!) != null)
          SliverFillRemaining(
            hasScrollBody: false,
            child: EmptyState(
              icon: Icons.rule,
              title: l10n.compareRecInvalidTitle,
              message: _validation(value.error!),
              actions: [
                StateAction(
                  label: l10n.compareRecEditAnswers,
                  icon: Icons.edit_outlined,
                  primary: true,
                  onPressed: onEdit,
                ),
              ],
            ),
          )
        else
          SliverAsyncStateView<RecommendationResult>(
            value: value,
            onRetry: () => ref.invalidate(recommendationProvider(input)),
            loading: Padding(
              padding: EdgeInsets.symmetric(horizontal: gutter, vertical: AppSpacing.md),
              child: const Skeleton(child: SkeletonList(item: CarCardSkeleton(), count: 3)),
            ),
            builder: (context, r) => SliverPadding(
              padding: EdgeInsets.fromLTRB(gutter, AppSpacing.sm, gutter, AppSpacing.xxl),
              sliver: SliverList.list(
                children: [
                  for (final w in _sections(context, ref, r)) ResponsiveCenter(padding: EdgeInsets.zero, child: w),
                ],
              ),
            ),
          ),
      ],
    );
  }

  static String? _validation(Object error) {
    if (error is! ApiException || error.kind != ApiErrorKind.validation) return null;
    final msgs = [for (final f in error.fieldErrors) ...f.messages];
    return msgs.isEmpty ? (error.message ?? '') : msgs.join('\n');
  }

  List<Widget> _sections(BuildContext context, WidgetRef ref, RecommendationResult r) {
    final l10n = context.l10n;
    const gap = SizedBox(height: AppSpacing.lg);
    final excluded = r.excluded;
    return [
      _InputSummary(input: input, result: r, onEdit: onEdit),
      gap,
      _DecisionCard(result: r),
      if (r.hasDemo) ...[const SizedBox(height: AppSpacing.md), const _DemoNote()],
      if (r.ranked.isNotEmpty) ...[
        gap,
        SectionHeader(title: l10n.compareRecRankedTitle, icon: Icons.format_list_numbered, padding: EdgeInsets.zero),
        const SizedBox(height: AppSpacing.sm),
        for (final c in r.ranked)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.md),
            child: _RankedCard(ranked: c, result: r, isTop: r.topPick?.car.key == c.car.key),
          ),
      ],
      if (r.notRanked.isNotEmpty) ...[
        gap,
        SectionHeader(
          title: l10n.compareRecNotRankedTitle,
          subtitle: l10n.compareRecNotRankedSubtitle,
          icon: Icons.help_outline,
          padding: EdgeInsets.zero,
        ),
        const SizedBox(height: AppSpacing.sm),
        for (final n in r.notRanked)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: _NotRankedCard(item: n),
          ),
      ],
      if (r.factorAvailability.any((f) => f.suggestion != null)) ...[
        gap,
        _MissingFactors(result: r, input: input, onIgnoreFactor: onIgnoreFactor),
      ],
      if ((excluded.total ?? 0) > 0) ...[gap, _ExcludedCard(excluded: excluded)],
      gap,
      _WeightsCard(result: r),
      if (r.notes.isNotEmpty) ...[
        gap,
        _Bullets(title: l10n.compareRecNotesTitle, icon: Icons.info_outline, lines: r.notes),
      ],
      gap,
      _Disclosure(result: r),
    ];
  }
}

class _DemoNote extends StatelessWidget {
  const _DemoNote();

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.xs,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        const DemoBadge(),
        Text(context.l10n.commonDemoDescription, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

class _InputSummary extends StatelessWidget {
  const _InputSummary({required this.input, required this.result, required this.onEdit});

  final RecommendationInput input;
  final RecommendationResult result;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final budget = result.budget;
    final chips = [
      l10n.compareRecSummaryBudget(
        budget != null
            ? fmt.money(budget.amount, budget.currency) ?? budget.amount
            : fmt.number(input.budget, maxDecimals: 2)!,
      ),
      l10n.compareRecSummaryDaily(fmt.distanceKm(input.dailyKm)!),
      l10n.compareRecSummaryTrips(input.longTripsPerMonth, fmt.number(input.longTripsPerMonth)!),
      input.homeCharging ? l10n.compareRecHomeChargingYes : l10n.compareRecHomeChargingNo,
      l10n.compareRecSummarySeats(fmt.number(input.seatsNeeded)!),
      if (result.marketName != null) result.marketName!,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [for (final c in chips) InfoChip(label: c)],
        ),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton.icon(
            onPressed: onEdit,
            icon: const Icon(Icons.edit_outlined),
            label: Text(l10n.compareRecEditAnswers),
          ),
        ),
      ],
    );
  }
}

class _DecisionCard extends StatelessWidget {
  const _DecisionCard({required this.result});

  final RecommendationResult result;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final top = result.topPick;
    final decisive = top != null;
    final colors = context.palette.tone(decisive ? AppTone.success : AppTone.warning);
    final reasonHint = switch (result.decision.reason) {
      'no_candidates' => l10n.compareRecReasonNoCandidates,
      'no_comparable_candidates' => l10n.compareRecReasonNoComparable,
      'fewer_than_two_comparable' => l10n.compareRecReasonFewer,
      'scores_too_close' => l10n.compareRecReasonTooClose,
      _ => null,
    };
    return Semantics(
      container: true,
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: colors.container,
          borderRadius: AppRadii.card,
          border: Border.all(color: colors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(decisive ? Icons.emoji_events_outlined : Icons.balance, color: colors.onContainer, size: 28),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Text(
                      decisive ? l10n.compareRecTopPick : l10n.compareRecNoDecision,
                      style: theme.textTheme.titleLarge?.copyWith(
                        color: colors.onContainer,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            if (decisive)
              Text(
                top.car.title,
                style: theme.textTheme.titleMedium?.copyWith(color: colors.onContainer, fontWeight: FontWeight.w600),
              ),
            if (result.decision.message != null) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(result.decision.message!, style: theme.textTheme.bodyMedium?.copyWith(color: colors.onContainer)),
            ],
            if (!decisive && reasonHint != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(reasonHint, style: theme.textTheme.bodySmall?.copyWith(color: colors.onContainer)),
            ],
          ],
        ),
      ),
    );
  }
}

class _RankedCard extends StatelessWidget {
  const _RankedCard({required this.ranked, required this.result, required this.isTop});

  final RankedCar ranked;
  final RecommendationResult result;
  final bool isTop;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final car = ranked.car;
    final score = ranked.score;
    final price = car.price;
    final selection = car.modelYear == null || car.marketCode.isEmpty
        ? null
        : CompareSelection(
            variantId: car.variantId,
            modelYear: car.modelYear!,
            marketCode: car.marketCode,
            title: [?car.brandName, ?car.modelName].join(' ').trim().isEmpty
                ? car.title
                : [?car.brandName, ?car.modelName].join(' '),
            subtitle: [car.name, CompareLabels.powertrain(l10n, car.powertrainType)].join(' · '),
            variantSlug: car.variantSlug,
            modelSlug: car.modelSlug,
            imageUrl: car.image?.url,
          );
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      selected: isTop,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(
                label: l10n.compareRecRank(ranked.rank),
                excludeSemantics: true,
                child: CircleAvatar(
                  radius: 18,
                  backgroundColor: theme.colorScheme.primary,
                  child: Text(
                    fmt.number(ranked.rank)!,
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: theme.colorScheme.onPrimary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(car.title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: AppSpacing.xs),
                    Wrap(
                      spacing: AppSpacing.xs,
                      runSpacing: 4,
                      children: [
                        if (isTop)
                          Pill(
                            icon: Icons.emoji_events_outlined,
                            label: l10n.compareRecTopPick,
                            tone: AppTone.success,
                            dense: true,
                          ),
                        if (Powertrain.fromApi(car.powertrainType) case final p?)
                          PowertrainPill(powertrain: p, dense: true),
                        if (car.isDemo) const DemoBadge(dense: true),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          PriceTag(
            price: price == null ? null : fmt.money(price.amount.amount, price.amount.currency),
            type: PriceType.values.where((t) => t.apiValue == price?.priceType).firstOrNull,
            isConverted: price != null && !price.inMarketCurrency,
            compact: true,
          ),
          const SizedBox(height: AppSpacing.md),
          Semantics(
            label: score == null
                ? l10n.compareRecScoreUnknown
                : l10n.compareRecScore(fmt.number(score, maxDecimals: 0)!),
            excludeSemantics: true,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  score == null
                      ? l10n.compareRecScoreUnknown
                      : l10n.compareRecScore(fmt.number(score, maxDecimals: 0)!),
                  style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
                if (score != null) ...[
                  const SizedBox(height: AppSpacing.xs),
                  LinearProgressIndicator(value: (score / 100).clamp(0, 1), minHeight: 8, borderRadius: AppRadii.pill),
                ],
              ],
            ),
          ),
          if (ranked.reasons.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            for (final reason in ranked.reasons) _ReasonLine(reason: reason),
          ],
          if (ranked.contributions.isNotEmpty)
            Theme(
              data: theme.copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                tilePadding: EdgeInsets.zero,
                childrenPadding: EdgeInsets.zero,
                title: Text(l10n.compareRecBreakdown, style: theme.textTheme.titleSmall),
                children: [for (final c in ranked.contributions) _ContributionRow(contribution: c)],
              ),
            ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              if (selection != null) CompareToggleButton(selection: selection, expand: false),
              if (car.variantSlug != null)
                TextButton.icon(
                  onPressed: () => context.push(AppRoutes.variant(car.variantSlug!)),
                  icon: const Icon(Icons.directions_car_outlined),
                  label: Text(l10n.compareOpenCar),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ReasonLine extends StatelessWidget {
  const _ReasonLine({required this.reason});

  final RecReason reason;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final (icon, label, tone) = switch (reason.sentiment) {
      'positive' => (Icons.thumb_up_alt_outlined, l10n.compareRecSentimentPositive, AppTone.success),
      'negative' => (Icons.warning_amber_outlined, l10n.compareRecSentimentNegative, AppTone.warning),
      _ => (Icons.info_outline, l10n.compareRecSentimentNeutral, AppTone.info),
    };
    final colors = context.palette.tone(tone);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Semantics(
        label: '$label: ${reason.text}',
        excludeSemantics: true,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: colors.onContainer),
            const SizedBox(width: AppSpacing.sm),
            Expanded(child: Text(reason.text, style: theme.textTheme.bodyMedium)),
          ],
        ),
      ),
    );
  }
}

class _ContributionRow extends StatelessWidget {
  const _ContributionRow({required this.contribution});

  final Contribution contribution;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final c = contribution;
    final value = c.unit != null && c.unit!.length == 3 && c.unit == c.unit!.toUpperCase()
        ? fmt.money(c.value?.toString(), c.unit)
        : CompareLabels.numberWithUnit(context, c.value, c.unit);
    final points = c.points == null ? l10n.commonNotAvailable : fmt.number(c.points, maxDecimals: 1)!;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: MergeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(c.label, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                ),
                Text(l10n.compareRecPoints(points), style: theme.textTheme.bodyMedium),
              ],
            ),
            Text(
              [
                value ?? l10n.commonNotAvailable,
                ?_basisLabel(context, c.basis),
                l10n.compareRecWeightShare(fmt.percent(c.weight * 100)!),
              ].join(' · '),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }

  /// Test cycle or "peak"; other codes (e.g. price types) are not shown raw.
  static String? _basisLabel(BuildContext context, String? basis) {
    if (basis == null) return null;
    if (basis == 'peak') return context.l10n.compareRecBasisPeak;
    final cycle = RangeCycle.fromApi(basis);
    return cycle?.label(context.l10n);
  }
}

class _NotRankedCard extends StatelessWidget {
  const _NotRankedCard({required this.item});

  final NotRankedCar item;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final reason = switch (item.reason) {
      'price_not_available' => l10n.compareRecNotRankedPrice,
      'seats_not_available' => l10n.compareRecNotRankedSeats,
      'not_comparable' => l10n.compareRecNotRankedComparable,
      _ => l10n.compareRecNotRankedMissing,
    };
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(item.car.title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: 4,
            children: [
              Pill(icon: Icons.help_outline, label: reason, tone: AppTone.warning, dense: true),
              if (item.car.isDemo) const DemoBadge(dense: true),
            ],
          ),
          if (item.explanation != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(item.explanation!, style: theme.textTheme.bodyMedium),
          ],
          if (item.missingData.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            for (final m in item.missingData)
              Text(
                '• ${m.label}: ${m.detail ?? (m.reason == 'cycle_mismatch' ? l10n.compareRecCycleMismatch : l10n.commonNotAvailable)}',
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
          ],
        ],
      ),
    );
  }
}

class _MissingFactors extends StatelessWidget {
  const _MissingFactors({required this.result, required this.input, required this.onIgnoreFactor});

  final RecommendationResult result;
  final RecommendationInput input;
  final ValueChanged<Map<RecFactor, double>> onIgnoreFactor;

  /// Current raw weights (the user's, or the ones the server derived).
  Map<RecFactor, double> _baseWeights() {
    if (input.weights != null) return Map.of(input.weights!);
    final weights = <RecFactor, double>{};
    for (final w in result.weights) {
      final f = RecFactor.fromApi(w.factor);
      if (f != null) weights[f] = w.raw ?? w.weight * 10;
    }
    return weights;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final items = result.factorAvailability.where((f) => f.suggestion != null).toList();
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.dataset_outlined, color: theme.colorScheme.primary),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    l10n.compareRecMissingTitle,
                    style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          for (final f in items) ...[
            Text(f.suggestion!, style: theme.textTheme.bodyMedium),
            if (f.factor != null)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  onPressed: () {
                    final weights = _baseWeights()..[f.factor!] = 0;
                    if (!weights.values.any((w) => w > 0)) {
                      showAppSnackBar(context, l10n.compareRecWeightsAllZero, tone: AppTone.warning);
                      return;
                    }
                    onIgnoreFactor(weights);
                  },
                  icon: const Icon(Icons.remove_circle_outline),
                  label: Text(l10n.compareRecIgnoreFactor(f.label)),
                ),
              ),
            const SizedBox(height: AppSpacing.xs),
          ],
        ],
      ),
    );
  }
}

class _ExcludedCard extends StatelessWidget {
  const _ExcludedCard({required this.excluded});

  final ExcludedCounts excluded;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    String n(int v) => fmt.number(v)!;
    return _Bullets(
      title: l10n.compareRecExcludedTitle(excluded.total!, n(excluded.total!)),
      icon: Icons.filter_alt_outlined,
      lines: [
        if ((excluded.overBudget ?? 0) > 0) l10n.compareRecExcludedBudget(n(excluded.overBudget!)),
        if ((excluded.seatsTooFew ?? 0) > 0) l10n.compareRecExcludedSeats(n(excluded.seatsTooFew!)),
        if ((excluded.bodyType ?? 0) > 0) l10n.compareRecExcludedBody(n(excluded.bodyType!)),
        if ((excluded.powertrain ?? 0) > 0) l10n.compareRecExcludedPowertrain(n(excluded.powertrain!)),
      ],
    );
  }
}

class _WeightsCard extends StatelessWidget {
  const _WeightsCard({required this.result});

  final RecommendationResult result;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.tune, color: theme.colorScheme.primary),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    l10n.compareRecWeightsTitle,
                    style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          for (final w in result.weights)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              child: MergeSemantics(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            w.label,
                            style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                          ),
                        ),
                        Text(
                          fmt.percent(w.weight * 100)!,
                          style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    LinearProgressIndicator(value: w.weight.clamp(0, 1), minHeight: 6, borderRadius: AppRadii.pill),
                    const SizedBox(height: 2),
                    Text(
                      [
                        switch (w.source) {
                          'user' => l10n.compareRecWeightUser,
                          'usage' => l10n.compareRecWeightUsage,
                          _ => l10n.compareRecWeightDefault,
                        },
                        ?w.description,
                      ].join(' · '),
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ),
          if (result.weightNotes.isNotEmpty) ...[
            const Divider(),
            for (final n in result.weightNotes)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xs),
                child: Text('• $n', style: theme.textTheme.bodySmall),
              ),
          ],
          if (result.rangeCycle != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              l10n.compareRecBasis(
                RangeCycle.fromApi(result.rangeCycle)?.label(l10n) ?? result.rangeCycle!,
                result.currencyCode ?? l10n.commonNotAvailable,
              ),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ],
      ),
    );
  }
}

class _Bullets extends StatelessWidget {
  const _Bullets({required this.title, required this.icon, required this.lines});

  final String title;
  final IconData icon;
  final List<String> lines;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(icon, color: theme.colorScheme.primary),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                ),
              ),
            ],
          ),
          for (final l in lines)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: Text('• $l', style: theme.textTheme.bodyMedium),
            ),
        ],
      ),
    );
  }
}

class _Disclosure extends StatelessWidget {
  const _Disclosure({required this.result});

  final RecommendationResult result;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          result.sponsored ? Icons.campaign_outlined : Icons.verified_outlined,
          size: 18,
          color: theme.colorScheme.onSurfaceVariant,
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            result.sponsored ? l10n.compareSponsoredWarning : (result.disclosure ?? l10n.compareDisclosureFallback),
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ),
      ],
    );
  }
}
