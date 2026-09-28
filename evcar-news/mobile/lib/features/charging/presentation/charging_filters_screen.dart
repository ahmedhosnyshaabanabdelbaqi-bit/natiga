import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../shared/widgets/kit.dart';
import '../application/charging_providers.dart';
import '../domain/station_query.dart';
import 'widgets/station_filters_form.dart';

/// Opens the filters as a bottom sheet over the charging tab; applying
/// updates the shared filters (map and list refresh together).
Future<void> showStationFiltersSheet(BuildContext context, WidgetRef ref) async {
  final l10n = context.l10n;
  final operators = operatorNamesOf(ref.read(stationSearchProvider).value);
  var draft = ref.read(chargingFiltersProvider);
  final applied = await showAppBottomSheet<StationFilters>(
    context: context,
    title: l10n.chargingFiltersTitle,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => SingleChildScrollView(
        padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.xl, AppSpacing.sm, AppSpacing.xl, AppSpacing.lg),
        child: StationFiltersForm(
          value: draft,
          operatorNames: operators,
          onChanged: (f) => setState(() => draft = f),
        ),
      ),
    ),
    footer: (context) => _FiltersFooter(
      onReset: () => Navigator.of(context).pop(draft.cleared()),
      onApply: () => Navigator.of(context).pop(draft),
    ),
  );
  if (applied != null) ref.read(chargingFiltersProvider.notifier).set(applied);
}

class _FiltersFooter extends StatelessWidget {
  const _FiltersFooter({required this.onReset, required this.onApply});

  final VoidCallback onReset;
  final VoidCallback onApply;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Row(
      children: [
        Expanded(child: SecondaryButton(label: l10n.commonReset, onPressed: onReset, expand: true)),
        const SizedBox(width: AppSpacing.md),
        Expanded(child: PrimaryButton(label: l10n.commonApply, onPressed: onApply, expand: true)),
      ],
    );
  }
}

/// Station filters as a full page (`/charging/filters`, deep-linkable):
/// connector types, AC/DC, minimum power, open now, public only, operator,
/// amenities and "compatible with my car".
class ChargingFiltersScreen extends ConsumerStatefulWidget {
  const ChargingFiltersScreen({super.key});

  @override
  ConsumerState<ChargingFiltersScreen> createState() => _ChargingFiltersScreenState();
}

class _ChargingFiltersScreenState extends ConsumerState<ChargingFiltersScreen> {
  late StationFilters _draft = ref.read(chargingFiltersProvider);

  void _apply(StationFilters f) {
    ref.read(chargingFiltersProvider.notifier).set(f);
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.charging);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final operators = operatorNamesOf(ref.watch(stationSearchProvider).value);
    return AppScaffold(
      title: l10n.chargingFiltersTitle,
      actions: [
        if (_draft.activeCount > 0)
          TextButton(onPressed: () => setState(() => _draft = _draft.cleared()), child: Text(l10n.commonReset)),
      ],
      body: ListView(
        padding: EdgeInsetsDirectional.fromSTEB(context.pageGutter, AppSpacing.lg, context.pageGutter, AppSpacing.xl),
        children: [
          ResponsiveCenter(
            child: StationFiltersForm(
              value: _draft,
              operatorNames: operators,
              onChanged: (f) => setState(() => _draft = f),
            ),
          ),
        ],
      ),
      bottomBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: PrimaryButton(label: l10n.commonApply, expand: true, onPressed: () => _apply(_draft)),
        ),
      ),
    );
  }
}
