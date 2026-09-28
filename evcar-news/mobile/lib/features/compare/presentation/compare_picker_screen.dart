import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/di/providers.dart';
import '../../../app/router/app_routes.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../shared/widgets/kit.dart';
import '../application/compare_providers.dart';
import '../domain/picker_models.dart';
import 'widgets/compare_labels.dart';

/// Pick a car for comparison (`/compare/pick[?replace=<variantId@MARKET>]`):
/// brand → model → model year → trim → market, every level chosen
/// explicitly (REQUIREMENTS §7), then the car is added to the compare tray
/// (or replaces the slot named by `replace`).
class ComparePickerScreen extends ConsumerStatefulWidget {
  const ComparePickerScreen({super.key});

  @override
  ConsumerState<ComparePickerScreen> createState() => _ComparePickerScreenState();
}

class _ComparePickerScreenState extends ConsumerState<ComparePickerScreen> {
  String? _market;
  bool _allMarkets = false;
  PickerItem? _brand;
  PickerItem? _model;
  PickerItem? _year;
  PickerItem? _variant;
  String _filter = '';
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  String get _browseMarket => _market ?? ref.read(effectiveMarketProvider).code;

  PickerQuery get _query => PickerQuery(
    brand: _brand?.id,
    model: _model?.id,
    year: _model != null ? _year?.year : null,
    variant: _variant?.id,
    market: _browseMarket,
    allMarkets: _allMarkets,
  );

  int get _step => switch (_query.level) {
    PickerLevel.brand => 0,
    PickerLevel.model => 1,
    PickerLevel.year => 2,
    PickerLevel.variant => 3,
    PickerLevel.market => 4,
  };

  void _setStep(VoidCallback change) => setState(() {
    change();
    _filter = '';
    _search.clear();
  });

  /// Goes back one level (system back and the step chips).
  void _back() => _setStep(() {
    if (_variant != null) {
      _variant = null;
    } else if (_year != null) {
      _year = null;
    } else if (_model != null) {
      _model = null;
    } else {
      _brand = null;
    }
  });

  void _goTo(int step) => _setStep(() {
    if (step <= 3) _variant = null;
    if (step <= 2) _year = null;
    if (step <= 1) _model = null;
    if (step <= 0) _brand = null;
  });

  void _select(PickerItem item) {
    switch (_query.level) {
      case PickerLevel.brand:
        _setStep(() => _brand = item);
      case PickerLevel.model:
        _setStep(() => _model = item);
      case PickerLevel.year:
        _setStep(() => _year = item);
      case PickerLevel.variant:
        _setStep(() => _variant = item);
      case PickerLevel.market:
        _finish(item);
    }
  }

  void _finish(PickerItem market) {
    final l10n = context.l10n;
    final variant = _variant!;
    final year = variant.modelYear ?? _year?.year;
    if (year == null) return;
    final selection = CompareSelection(
      variantId: variant.id,
      modelYear: year,
      marketCode: market.id.toUpperCase(),
      title: [?_brand?.label, ?_model?.label].join(' '),
      subtitle: [
        variant.label,
        if (variant.powertrainType != null) CompareLabels.powertrain(l10n, variant.powertrainType!),
      ].join(' · '),
      variantSlug: variant.slug,
      modelSlug: variant.modelSlug ?? _model?.slug,
      imageUrl: variant.imageUrl ?? _model?.imageUrl,
    );
    final tray = ref.read(compareTrayProvider.notifier);
    final replaceKey = GoRouterState.of(context).uri.queryParameters['replace'];
    String message;
    var tone = AppTone.success;
    if (replaceKey != null && ref.read(compareTrayProvider).any((s) => s.key == replaceKey)) {
      if (tray.replace(replaceKey, selection)) {
        message = l10n.comparePickerReplaced(selection.title);
      } else {
        message = l10n.comparePickerAlreadyIn;
        tone = AppTone.warning;
      }
    } else {
      switch (tray.add(selection)) {
        case CompareAddResult.added:
          message = l10n.comparePickerAdded(selection.title);
        case CompareAddResult.alreadyInTray:
          message = l10n.comparePickerAlreadyIn;
          tone = AppTone.warning;
        case CompareAddResult.full:
          message = l10n.commonCompareFull(CompareTrayController.maxItems);
          tone = AppTone.warning;
      }
    }
    showAppSnackBar(context, message, tone: tone);
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.compare);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final query = _query;
    final value = ref.watch(pickerProvider(query));
    final gutter = context.pageGutter;
    final isReplace = GoRouterState.of(context).uri.queryParameters['replace'] != null;
    final stepTitles = [
      l10n.comparePickerStepBrand,
      l10n.comparePickerStepModel,
      l10n.comparePickerStepYear,
      l10n.comparePickerStepTrim,
      l10n.comparePickerStepMarket,
    ];
    final chosen = [_brand?.label, _model?.label, _year?.label, _variant?.label, null];
    final searchable = query.level == PickerLevel.brand || query.level == PickerLevel.model;

    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: AppScaffold.slivers(
        title: isReplace ? l10n.comparePickerReplaceTitle : l10n.comparePickerTitle,
        onRefresh: () async {
          ref.invalidate(pickerProvider(query));
          await ref.read(pickerProvider(query).future).then((_) {}, onError: (_) {});
        },
        slivers: [
          SliverPadding(
            padding: EdgeInsets.fromLTRB(gutter, AppSpacing.sm, gutter, 0),
            sliver: SliverToBoxAdapter(
              child: ResponsiveCenter(
                padding: EdgeInsets.zero,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _MarketScope(
                      market: _browseMarket,
                      allMarkets: _allMarkets,
                      enabled: _step < 4,
                      onMarket: (m) => _setStep(() {
                        _market = m;
                        _brand = _model = _year = _variant = null;
                      }),
                      onAllMarkets: (v) => _setStep(() {
                        _allMarkets = v;
                        _brand = _model = _year = _variant = null;
                      }),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Semantics(
                      label: l10n.comparePickerProgress(_step + 1, stepTitles.length),
                      child: LinearProgressIndicator(
                        value: (_step + 1) / stepTitles.length,
                        borderRadius: AppRadii.pill,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Wrap(
                      spacing: AppSpacing.sm,
                      runSpacing: AppSpacing.sm,
                      children: [
                        for (var i = 0; i < stepTitles.length; i++)
                          _StepChip(
                            index: i,
                            title: stepTitles[i],
                            value: chosen[i],
                            state: i < _step
                                ? _StepState.done
                                : i == _step
                                ? _StepState.current
                                : _StepState.todo,
                            onTap: i < _step ? () => _goTo(i) : null,
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Semantics(
                      header: true,
                      child: Text(switch (query.level) {
                        PickerLevel.brand => l10n.comparePickerChooseBrand,
                        PickerLevel.model => l10n.comparePickerChooseModel,
                        PickerLevel.year => l10n.comparePickerChooseYear,
                        PickerLevel.variant => l10n.comparePickerChooseTrim,
                        PickerLevel.market => l10n.comparePickerChooseMarket,
                      }, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                    ),
                    if (query.level == PickerLevel.market) ...[
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        l10n.comparePickerMarketHint,
                        style: Theme.of(context).textTheme.bodySmall
                            ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
                      ),
                    ],
                    if (searchable) ...[
                      const SizedBox(height: AppSpacing.md),
                      AppSearchField(
                        controller: _search,
                        hintText: query.level == PickerLevel.brand
                            ? l10n.comparePickerSearchBrand
                            : l10n.comparePickerSearchModel,
                        onChanged: (v) => setState(() => _filter = v.trim().toLowerCase()),
                      ),
                    ],
                    const SizedBox(height: AppSpacing.md),
                  ],
                ),
              ),
            ),
          ),
          SliverAsyncStateView<CachedResult<PickerPage>>(
            value: value,
            onRetry: () => ref.invalidate(pickerProvider(query)),
            loading: Padding(
              padding: EdgeInsets.symmetric(horizontal: gutter),
              child: const Skeleton(child: SkeletonList(item: ListTileSkeleton(), count: 5)),
            ),
            isEmpty: (res) => res.data.items.isEmpty,
            emptyIcon: Icons.search_off,
            emptyTitle: l10n.comparePickerEmptyTitle,
            emptyMessage: _allMarkets ? l10n.comparePickerEmptyMessageAll : l10n.comparePickerEmptyMessage,
            emptyActions: [
              if (_step > 0) StateAction(label: l10n.comparePickerBack, icon: Icons.arrow_back, onPressed: _back),
              if (!_allMarkets)
                StateAction(
                  label: l10n.comparePickerShowAllMarkets,
                  icon: Icons.public,
                  onPressed: () => _setStep(() {
                    _allMarkets = true;
                    _brand = _model = _year = _variant = null;
                  }),
                ),
            ],
            builder: (context, res) {
              final items = [
                for (final i in res.data.items)
                  if (_filter.isEmpty ||
                      i.label.toLowerCase().contains(_filter) ||
                      (i.sublabel?.toLowerCase().contains(_filter) ?? false))
                    i,
              ];
              return SliverMainAxisGroup(
                slivers: [
                  if (res.fromCache)
                    SliverPadding(
                      padding: EdgeInsets.fromLTRB(gutter, 0, gutter, AppSpacing.sm),
                      sliver: SliverToBoxAdapter(child: CachedDataNotice(savedAt: res.savedAt)),
                    ),
                  if (items.isEmpty)
                    SliverToBoxAdapter(
                      child: EmptyState(icon: Icons.search_off, title: l10n.comparePickerNoMatch, compact: true),
                    ),
                  SliverPadding(
                    padding: EdgeInsets.fromLTRB(gutter, 0, gutter, AppSpacing.xxl),
                    sliver: SliverList.separated(
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.sm),
                      itemBuilder: (context, i) => ResponsiveCenter(
                        padding: EdgeInsets.zero,
                        child: _PickerTile(item: items[i], level: res.data.level, onTap: () => _select(items[i])),
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _MarketScope extends ConsumerWidget {
  const _MarketScope({
    required this.market,
    required this.allMarkets,
    required this.enabled,
    required this.onMarket,
    required this.onAllMarkets,
  });

  final String market;
  final bool allMarkets;
  final bool enabled;
  final ValueChanged<String> onMarket;
  final ValueChanged<bool> onAllMarkets;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final lang = ref.watch(effectiveLanguageProvider);
    final markets = ref.watch(appConfigProvider).enabledMarkets;
    final theme = Theme.of(context);
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.comparePickerBrowseMarket,
            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppSpacing.sm),
          if (markets.length > 1)
            IgnorePointer(
              ignoring: !enabled,
              child: ChoicePills<String>(
                options: {for (final m in markets) m.code: m.nameFor(lang)},
                selected: market,
                onSelected: onMarket,
              ),
            )
          else
            Text(markets.isEmpty ? market : markets.first.nameFor(lang)),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            value: allMarkets,
            onChanged: enabled ? onAllMarkets : null,
            title: Text(l10n.comparePickerAllMarkets),
            subtitle: Text(l10n.comparePickerAllMarketsHint),
          ),
        ],
      ),
    );
  }
}

enum _StepState { done, current, todo }

class _StepChip extends StatelessWidget {
  const _StepChip({required this.index, required this.title, this.value, required this.state, this.onTap});

  final int index;
  final String title;
  final String? value;
  final _StepState state;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final label = value == null ? title : '$title: $value';
    final icon = switch (state) {
      _StepState.done => Icons.check_circle,
      _StepState.current => Icons.radio_button_checked,
      _StepState.todo => Icons.radio_button_unchecked,
    };
    final stateText = switch (state) {
      _StepState.done => l10n.comparePickerStepDone,
      _StepState.current => l10n.comparePickerStepCurrent,
      _StepState.todo => l10n.comparePickerStepTodo,
    };
    return Semantics(
      button: onTap != null,
      label: '$label, $stateText',
      hint: onTap != null ? l10n.comparePickerStepEditHint : null,
      excludeSemantics: true,
      child: ActionChip(
        avatar: Icon(
          icon,
          size: 18,
          color: state == _StepState.todo ? theme.colorScheme.onSurfaceVariant : theme.colorScheme.primary,
        ),
        label: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 220),
          child: Text(label, overflow: TextOverflow.ellipsis),
        ),
        onPressed: onTap ?? () {},
      ),
    );
  }
}

class _PickerTile extends StatelessWidget {
  const _PickerTile({required this.item, required this.level, required this.onTap});

  final PickerItem item;
  final PickerLevel level;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final title = level == PickerLevel.year && item.year != null ? CompareLabels.year(fmt, item.year!) : item.label;
    final sub = <String>[
      if (item.sublabel != null) item.sublabel!,
      if (level == PickerLevel.market && item.currencyCode != null) l10n.comparePickerCurrency(item.currencyCode!),
      if (level == PickerLevel.variant && item.markets.isNotEmpty)
        l10n.comparePickerSoldIn(item.markets.map((m) => m.code).join(', ')),
      if ((level == PickerLevel.brand || level == PickerLevel.model || level == PickerLevel.year) && item.count != null)
        l10n.comparePickerTrimCount(item.count!, fmt.number(item.count!)!),
    ];
    final availability = level == PickerLevel.market ? item.availability : null;
    final leading = switch (level) {
      PickerLevel.brand => Icons.factory_outlined,
      PickerLevel.model => Icons.directions_car_outlined,
      PickerLevel.year => Icons.calendar_today_outlined,
      PickerLevel.variant => Icons.tune,
      PickerLevel.market => Icons.public,
    };
    return AppCard(
      onTap: onTap,
      semanticLabel: [title, ...sub, if (availability != null) _availabilityLabel(l10n, availability)].join(', '),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.md),
      child: Row(
        children: [
          if (item.imageUrl != null && level != PickerLevel.market)
            ImageWithFallback(
              url: item.imageUrl,
              width: 56,
              height: 42,
              borderRadius: BorderRadius.circular(AppRadii.xs),
              fallbackIcon: leading,
              showFallbackText: false,
            )
          else
            Icon(leading, color: theme.colorScheme.primary),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                for (final s in sub)
                  Text(s, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                if (level == PickerLevel.variant && item.powertrainType != null || availability != null) ...[
                  const SizedBox(height: AppSpacing.xs),
                  Wrap(
                    spacing: AppSpacing.xs,
                    runSpacing: 4,
                    children: [
                      if (level == PickerLevel.variant && Powertrain.fromApi(item.powertrainType) != null)
                        PowertrainPill(powertrain: Powertrain.fromApi(item.powertrainType)!, dense: true),
                      if (availability != null)
                        Pill(
                          icon: availability == 'available' ? Icons.check_circle_outline : Icons.schedule,
                          label: _availabilityLabel(l10n, availability),
                          tone: availability == 'available' ? AppTone.success : AppTone.info,
                          dense: true,
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const Icon(Icons.chevron_right),
        ],
      ),
    );
  }

  static String _availabilityLabel(AppLocalizations l10n, String code) => switch (code) {
    'available' => l10n.compareAvailabilityAvailable,
    'coming_soon' => l10n.compareAvailabilityComingSoon,
    'discontinued' => l10n.compareAvailabilityDiscontinued,
    _ => l10n.compareAvailabilityUnknown,
  };
}
