import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/di/providers.dart';
import '../../../app/router/app_routes.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../shared/widgets/kit.dart';
import '../application/charging_providers.dart';
import '../data/location_service.dart';
import '../domain/city_presets.dart';
import '../domain/station_query.dart';
import 'widgets/location_prompts.dart';
import 'widgets/map_point_picker.dart';

/// Choose where to search (`/charging/location`): the device location (asked
/// only here, on tap), a point on the map, or a city — the alternative when
/// location permission is denied (REQUIREMENTS §19).
class ChargingLocationScreen extends ConsumerStatefulWidget {
  const ChargingLocationScreen({super.key});

  @override
  ConsumerState<ChargingLocationScreen> createState() => _ChargingLocationScreenState();
}

class _ChargingLocationScreenState extends ConsumerState<ChargingLocationScreen> {
  String _filter = '';
  bool _locating = false;

  @override
  void initState() {
    super.initState();
    // Silent status check (no prompt) to explain a permanent denial upfront.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.read(locationStatusProvider.notifier).refresh();
    });
  }

  void _done() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.charging);
    }
  }

  Future<void> _locate() async {
    setState(() => _locating = true);
    final outcome = await ref.read(locationStatusProvider.notifier).locate();
    if (!mounted) return;
    setState(() => _locating = false);
    if (outcome == LocateOutcome.located) {
      _done();
    } else {
      await handleLocateOutcome(context, ref, outcome);
    }
  }

  Future<void> _pickOnMap() async {
    final l10n = context.l10n;
    final p = await pickPointOnMap(
      context,
      initial: ref.read(chargingPlaceProvider).point,
      title: l10n.chargingPickPointTitle,
      confirmLabel: l10n.chargingSearchHereAction,
    );
    if (p == null || !mounted) return;
    ref.read(chargingPlaceProvider.notifier).setMapPoint(p);
    ref.read(chargingAreaProvider.notifier).aroundPlace();
    _done();
  }

  void _pickCity(CityPreset c) {
    ref.read(chargingPlaceProvider.notifier).setCity(c);
    ref.read(chargingAreaProvider.notifier).aroundPlace();
    _done();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final lang = context.languageCode;
    final config = ref.watch(appConfigProvider);
    final market = ref.watch(effectiveMarketProvider);
    final place = ref.watch(chargingPlaceProvider);
    final access = ref.watch(locationStatusProvider);
    final q = _filter.trim().toLowerCase();
    final cities = citiesFor(market.code)
        .where((c) => q.isEmpty || c.nameAr.contains(q) || c.nameEn.toLowerCase().contains(q))
        .toList();
    final markets = <String>{for (final c in cities) c.marketCode}.toList();

    return AppScaffold(
      title: l10n.chargingLocationTitle,
      body: ListView(
        padding: EdgeInsetsDirectional.fromSTEB(context.pageGutter, AppSpacing.lg, context.pageGutter, AppSpacing.xxl),
        children: [
          AppCard(
            onTap: _locating ? null : _locate,
            semanticLabel: l10n.chargingUseMyLocation,
            child: Row(
              children: [
                CircleAvatar(
                  backgroundColor: theme.colorScheme.primaryContainer,
                  child: _locating
                      ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : Icon(Icons.my_location, color: theme.colorScheme.onPrimaryContainer),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: ExcludeSemantics(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(l10n.chargingUseMyLocation, style: theme.textTheme.titleSmall),
                        const SizedBox(height: AppSpacing.xxs),
                        Text(
                          access == LocationAccess.deniedForever
                              ? l10n.chargingLocationDeniedForever
                              : l10n.chargingLocationPrivacy,
                          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (access == LocationAccess.deniedForever)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: () => ref.read(locationServiceProvider).openAppSettings(),
                icon: const Icon(Icons.settings_outlined),
                label: Text(l10n.commonOpenSettings),
              ),
            ),
          if (config.map.isUsable) ...[
            const SizedBox(height: AppSpacing.cardGap),
            AppCard(
              onTap: _pickOnMap,
              semanticLabel: l10n.chargingPickPointTitle,
              child: Row(
                children: [
                  CircleAvatar(
                    backgroundColor: theme.colorScheme.tertiaryContainer,
                    child: Icon(Icons.push_pin_outlined, color: theme.colorScheme.onTertiaryContainer),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: ExcludeSemantics(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(l10n.chargingPickPointTitle, style: theme.textTheme.titleSmall),
                          const SizedBox(height: AppSpacing.xxs),
                          Text(
                            l10n.chargingPickPointSubtitle,
                            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.xl),
          AppSearchField(hintText: l10n.chargingCitySearchHint, onChanged: (v) => setState(() => _filter = v)),
          if (cities.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xl),
              child: EmptyState(icon: Icons.location_city_outlined, title: l10n.chargingNoCityMatch, compact: true),
            ),
          for (final m in markets) ...[
            SectionHeader(
              title: config.marketByCode(m)?.nameFor(lang) ?? m,
              icon: Icons.flag_outlined,
              padding: const EdgeInsetsDirectional.fromSTEB(0, AppSpacing.xl, 0, AppSpacing.xs),
            ),
            for (final c in cities.where((c) => c.marketCode == m))
              ListTile(
                contentPadding: const EdgeInsetsDirectional.only(start: AppSpacing.xs, end: AppSpacing.xs),
                leading: const Icon(Icons.location_city_outlined),
                title: Text(c.name(lang)),
                selected: place.cityId == c.id && place.kind != PlaceKind.marketDefault,
                trailing: place.cityId == c.id && place.kind != PlaceKind.marketDefault
                    ? Icon(Icons.check, semanticLabel: l10n.commonSelected)
                    : null,
                onTap: () => _pickCity(c),
              ),
          ],
          const SizedBox(height: AppSpacing.lg),
          Text(
            l10n.chargingCityListNote,
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
