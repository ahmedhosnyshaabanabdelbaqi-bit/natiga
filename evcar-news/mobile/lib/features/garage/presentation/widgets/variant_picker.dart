import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/cache/cached_fetch.dart';
import '../../../../shared/widgets/kit.dart';
import '../../../compare/application/compare_providers.dart';
import '../../../compare/domain/picker_models.dart';

/// A trim picked in the cascade (brand → model → model year → trim).
@immutable
class PickedVariant {
  const PickedVariant({
    required this.variantId,
    required this.brandName,
    required this.modelName,
    required this.trimName,
    this.modelYear,
    this.powertrainType,
  });

  final String variantId;
  final String brandName;
  final String modelName;
  final String trimName;
  final int? modelYear;
  final String? powertrainType;

  String get title => [brandName, modelName, ?modelYear?.toString()].join(' ');
}

/// Opens the full-screen trim picker; [market] is the catalog browsed first
/// (the user can widen it to every market, e.g. for an imported car).
Future<PickedVariant?> pickVariant(BuildContext context, {required String market, String? title}) {
  return Navigator.of(context, rootNavigator: true).push<PickedVariant>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => VariantPickerPage(market: market, title: title),
    ),
  );
}

/// Cascade over `GET /cars/pickers` (shared with the compare picker's data
/// layer). Only published trims are listed; nothing is typed free-hand, so a
/// garage car is always a real catalog trim.
class VariantPickerPage extends ConsumerStatefulWidget {
  const VariantPickerPage({super.key, required this.market, this.title});

  final String market;
  final String? title;

  @override
  ConsumerState<VariantPickerPage> createState() => _VariantPickerPageState();
}

class _VariantPickerPageState extends ConsumerState<VariantPickerPage> {
  bool _allMarkets = false;
  PickerItem? _brand;
  PickerItem? _model;
  PickerItem? _year;
  String _filter = '';
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  PickerQuery get _query => PickerQuery(
    brand: _brand?.id,
    model: _model?.id,
    year: _model != null ? _year?.year : null,
    market: widget.market,
    allMarkets: _allMarkets,
  );

  int get _step => _year != null ? 3 : (_model != null ? 2 : (_brand != null ? 1 : 0));

  void _set(VoidCallback f) => setState(() {
    f();
    _filter = '';
    _search.clear();
  });

  void _back() => _set(() {
    if (_year != null) {
      _year = null;
    } else if (_model != null) {
      _model = null;
    } else {
      _brand = null;
    }
  });

  void _select(PickerItem item) {
    switch (_step) {
      case 0:
        _set(() => _brand = item);
      case 1:
        _set(() => _model = item);
      case 2:
        _set(() => _year = item);
      default:
        Navigator.of(context).pop(
          PickedVariant(
            variantId: item.id,
            brandName: _brand?.label ?? '',
            modelName: _model?.label ?? '',
            trimName: item.label,
            modelYear: item.modelYear ?? _year?.year,
            powertrainType: item.powertrainType,
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final query = _query;
    final value = ref.watch(pickerProvider(query));
    final steps = [l10n.garagePickerStepBrand, l10n.garagePickerStepModel, l10n.garagePickerStepYear, l10n.garagePickerStepTrim];
    final chosen = [_brand?.label, _model?.label, _year?.label, null];
    final searchable = _step <= 1;

    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        appBar: AppBar(title: Text(widget.title ?? l10n.garagePickerTitle)),
        body: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: ResponsiveCenter(
                padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.sm, context.pageGutter, AppSpacing.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Semantics(
                      label: l10n.garagePickerProgress(_step + 1, steps.length),
                      child: LinearProgressIndicator(value: (_step + 1) / steps.length, borderRadius: AppRadii.pill),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Wrap(
                      spacing: AppSpacing.sm,
                      runSpacing: AppSpacing.sm,
                      children: [
                        for (var i = 0; i < steps.length; i++)
                          InputChip(
                            avatar: Icon(i < _step ? Icons.check_circle : Icons.radio_button_unchecked, size: 18),
                            label: Text(chosen[i] == null ? steps[i] : '${steps[i]}: ${chosen[i]}'),
                            selected: i == _step,
                            onPressed: i < _step
                                ? () => _set(() {
                                    if (i <= 2) _year = null;
                                    if (i <= 1) _model = null;
                                    if (i <= 0) _brand = null;
                                  })
                                : null,
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      value: _allMarkets,
                      title: Text(l10n.garagePickerAllMarkets),
                      subtitle: Text(l10n.garagePickerAllMarketsHint),
                      onChanged: (v) => _set(() {
                        _allMarkets = v;
                        _brand = _model = _year = null;
                      }),
                    ),
                    if (searchable) ...[
                      const SizedBox(height: AppSpacing.sm),
                      AppSearchField(
                        controller: _search,
                        hintText: _step == 0 ? l10n.garagePickerSearchBrand : l10n.garagePickerSearchModel,
                        onChanged: (v) => setState(() => _filter = v.trim().toLowerCase()),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            SliverAsyncStateView<CachedResult<PickerPage>>(
              value: value,
              onRetry: () => ref.invalidate(pickerProvider(query)),
              loading: Padding(
                padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
                child: const Skeleton(child: SkeletonList(item: ListTileSkeleton(), count: 6)),
              ),
              isEmpty: (r) => r.data.items.isEmpty,
              emptyIcon: Icons.directions_car_outlined,
              emptyTitle: l10n.garagePickerEmpty,
              emptyActions: [
                if (_step > 0) StateAction(label: l10n.garageBack, icon: Icons.arrow_back, onPressed: _back),
                if (!_allMarkets)
                  StateAction(
                    label: l10n.garagePickerAllMarkets,
                    icon: Icons.public,
                    onPressed: () => _set(() {
                      _allMarkets = true;
                      _brand = _model = _year = null;
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
                return SliverPadding(
                  padding: EdgeInsets.fromLTRB(context.pageGutter, 0, context.pageGutter, AppSpacing.xxl),
                  sliver: SliverList.separated(
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.sm),
                    itemBuilder: (context, i) {
                      final item = items[i];
                      return ResponsiveCenter(
                        padding: EdgeInsets.zero,
                        child: AppCard(
                          onTap: () => _select(item),
                          semanticLabel: item.label,
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(item.label, style: theme.textTheme.titleMedium),
                                    if (item.sublabel != null && item.sublabel!.isNotEmpty)
                                      Text(
                                        item.sublabel!,
                                        style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                                      ),
                                  ],
                                ),
                              ),
                              if (item.powertrainType != null)
                                Padding(
                                  padding: const EdgeInsetsDirectional.only(start: AppSpacing.sm),
                                  child: Pill(label: item.powertrainType!, dense: true),
                                ),
                              const Icon(Icons.chevron_right),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
