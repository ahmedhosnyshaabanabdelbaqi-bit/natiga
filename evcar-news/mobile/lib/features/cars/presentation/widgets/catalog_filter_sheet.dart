import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../shared/widgets/kit.dart';
import '../../domain/cars_query.dart';
import 'car_labels.dart';

/// Opens the catalog filters; returns the new query or null when dismissed.
Future<CarsQuery?> showCatalogFilterSheet(
  BuildContext context, {
  required CarsQuery initial,
  required String? currencyCode,
  required String marketName,
}) {
  final key = GlobalKey<_CatalogFilterFormState>();
  final l10n = context.l10n;
  return showAppBottomSheet<CarsQuery>(
    context: context,
    title: l10n.commonFilters,
    builder: (context) =>
        _CatalogFilterForm(key: key, initial: initial, currencyCode: currencyCode, marketName: marketName),
    footer: (context) => Row(
      children: [
        Expanded(
          child: SecondaryButton(label: l10n.commonReset, expand: true, onPressed: () => key.currentState?.reset()),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: PrimaryButton(
            label: l10n.commonApply,
            expand: true,
            onPressed: () {
              final q = key.currentState?.result();
              if (q != null) Navigator.of(context).pop(q);
            },
          ),
        ),
      ],
    ),
  );
}

class _CatalogFilterForm extends StatefulWidget {
  const _CatalogFilterForm({super.key, required this.initial, required this.currencyCode, required this.marketName});

  final CarsQuery initial;
  final String? currencyCode;
  final String marketName;

  @override
  State<_CatalogFilterForm> createState() => _CatalogFilterFormState();
}

class _CatalogFilterFormState extends State<_CatalogFilterForm> {
  late Set<String> _powertrains = {...widget.initial.powertrains};
  late Set<String> _bodies = {...widget.initial.bodies};
  late final _minPrice = TextEditingController(text: widget.initial.minPrice?.toString() ?? '');
  late final _maxPrice = TextEditingController(text: widget.initial.maxPrice?.toString() ?? '');
  late int? _minRange = widget.initial.minRangeKm;
  late String _cycle = widget.initial.rangeCycle;
  late int? _minSeats = widget.initial.minSeats;
  late CarSort _sort = widget.initial.sort;
  String? _priceError;

  static const rangeSteps = [200, 300, 400, 500, 600];
  static const seatSteps = [2, 4, 5, 7];

  @override
  void dispose() {
    _minPrice.dispose();
    _maxPrice.dispose();
    super.dispose();
  }

  void reset() => setState(() {
    _powertrains = {};
    _bodies = {};
    _minPrice.clear();
    _maxPrice.clear();
    _minRange = null;
    _cycle = 'WLTP';
    _minSeats = null;
    _sort = CarSort.newest;
    _priceError = null;
  });

  /// Validates and returns the query (null when invalid).
  CarsQuery? result() {
    final min = int.tryParse(_minPrice.text.trim());
    final max = int.tryParse(_maxPrice.text.trim());
    if (min != null && max != null && min > max) {
      setState(() => _priceError = context.l10n.carsFilterPriceInvalid);
      return null;
    }
    return widget.initial.copyWith(
      powertrains: _powertrains,
      bodies: _bodies,
      minPrice: () => min,
      maxPrice: () => max,
      minRangeKm: () => _minRange,
      rangeCycle: _cycle,
      minSeats: () => _minSeats,
      sort: _sort,
    );
  }

  Widget _title(String text, {String? hint}) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.lg, bottom: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text(text, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          ),
          if (hint != null)
            Text(hint, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final currency = widget.currencyCode;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _title(l10n.commonSortBy),
        ChoicePills<CarSort>(
          options: {
            CarSort.newest: l10n.carsSortNewest,
            CarSort.priceAsc: l10n.carsSortPriceAsc,
            CarSort.priceDesc: l10n.carsSortPriceDesc,
            CarSort.rangeDesc: l10n.carsSortRange,
            CarSort.name: l10n.carsSortName,
          },
          selected: _sort,
          onSelected: (s) => setState(() => _sort = s),
        ),
        _title(l10n.carsFilterPowertrain),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          children: [
            for (final p in powertrainCodes)
              AppFilterChip(
                label: '${CarLabels.powertrainShort(l10n, p)} · $p',
                selected: _powertrains.contains(p),
                onSelected: (on) => setState(() => on ? _powertrains.add(p) : _powertrains.remove(p)),
              ),
          ],
        ),
        _title(l10n.carsFilterBody),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          children: [
            for (final b in bodyTypeCodes)
              AppFilterChip(
                label: CarLabels.bodyType(l10n, b),
                selected: _bodies.contains(b),
                onSelected: (on) => setState(() => on ? _bodies.add(b) : _bodies.remove(b)),
              ),
          ],
        ),
        _title(
          l10n.carsFilterPrice,
          hint: currency == null
              ? l10n.carsFilterPriceHintNoCurrency(widget.marketName)
              : l10n.carsFilterPriceHint(fmt.currencySymbol(currency), widget.marketName),
        ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: _priceField(_minPrice, l10n.carsFilterPriceMin)),
            const SizedBox(width: AppSpacing.md),
            Expanded(child: _priceField(_maxPrice, l10n.carsFilterPriceMax)),
          ],
        ),
        if (_priceError != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xs),
            child: Semantics(
              liveRegion: true,
              child: Text(
                _priceError!,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.error),
              ),
            ),
          ),
        _title(l10n.carsFilterMinRange, hint: l10n.carsFilterMinRangeHint),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          children: [
            ChoiceChip(
              label: Text(l10n.carsFilterAny),
              selected: _minRange == null,
              showCheckmark: true,
              onSelected: (_) => setState(() => _minRange = null),
              materialTapTargetSize: MaterialTapTargetSize.padded,
            ),
            for (final r in rangeSteps)
              ChoiceChip(
                label: Text(l10n.carsFilterAtLeast(fmt.distanceKm(r)!)),
                selected: _minRange == r,
                showCheckmark: true,
                onSelected: (_) => setState(() => _minRange = r),
                materialTapTargetSize: MaterialTapTargetSize.padded,
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(l10n.carsFilterCycle, style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: AppSpacing.xs),
        ChoicePills<String>(
          options: {for (final c in rangeCycles) c: c},
          selected: _cycle,
          onSelected: (c) => setState(() => _cycle = c),
        ),
        _title(l10n.carsFilterSeats),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          children: [
            ChoiceChip(
              label: Text(l10n.carsFilterAny),
              selected: _minSeats == null,
              showCheckmark: true,
              onSelected: (_) => setState(() => _minSeats = null),
              materialTapTargetSize: MaterialTapTargetSize.padded,
            ),
            for (final s in seatSteps)
              ChoiceChip(
                label: Text(l10n.carsFilterSeatsAtLeast(s)),
                selected: _minSeats == s,
                showCheckmark: true,
                onSelected: (_) => setState(() => _minSeats = s),
                materialTapTargetSize: MaterialTapTargetSize.padded,
              ),
          ],
        ),
      ],
    );
  }

  Widget _priceField(TextEditingController c, String label) => TextField(
    controller: c,
    keyboardType: TextInputType.number,
    inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(12)],
    decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
    onChanged: (_) {
      if (_priceError != null) setState(() => _priceError = null);
    },
  );
}
