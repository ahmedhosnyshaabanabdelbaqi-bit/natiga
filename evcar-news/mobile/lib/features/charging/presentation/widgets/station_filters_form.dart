import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/errors/app_errors.dart';
import '../../../../shared/widgets/kit.dart';
import '../../../auth/presentation/auth_controller.dart';
import '../../application/charging_providers.dart';
import '../../domain/station_models.dart';
import '../../domain/station_query.dart';

/// Editable station filters (used by the filters sheet and `/charging/filters`).
///
/// Chips come from `GET /stations/meta` (connector types with AC/DC support,
/// amenities) so labels follow the request language. "Compatible with my
/// car" uses a car of the signed-in user's garage; guests are offered sign-in.
class StationFiltersForm extends ConsumerWidget {
  const StationFiltersForm({super.key, required this.value, required this.onChanged, this.operatorNames = const []});

  final StationFilters value;
  final ValueChanged<StationFilters> onChanged;

  /// Operators present in the loaded results.
  final List<String> operatorNames;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final meta = ref.watch(stationMetaProvider).value?.data;
    final f = value;

    final connectorTypes = (meta?.connectorTypes ?? const <ConnectorTypeRef>[])
        .where((c) => switch (f.current) {
          CurrentType.ac => c.supportsAc,
          CurrentType.dc => c.supportsDc,
          null => true,
        })
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Section(
          title: l10n.chargingFilterVehicle,
          icon: Icons.directions_car_outlined,
          child: _VehicleChooser(value: f, onChanged: onChanged),
        ),
        _Section(
          title: l10n.chargingFilterCurrent,
          icon: Icons.electrical_services_outlined,
          child: ChoicePills<CurrentType?>(
            options: {null: l10n.chargingFilterAny, CurrentType.ac: l10n.chargingCurrentAc, CurrentType.dc: l10n.chargingCurrentDc},
            selected: f.current,
            onSelected: (c) => onChanged(f.copyWith(current: () => c)),
          ),
        ),
        _Section(
          title: l10n.chargingFilterMinPower,
          icon: Icons.speed_outlined,
          subtitle: l10n.chargingFilterMinPowerHelp,
          child: ChoicePills<double?>(
            options: {
              null: l10n.chargingFilterAny,
              for (final p in StationFilters.powerPresets) p: l10n.chargingFilterPowerAtLeast(fmt.powerKw(p)!),
            },
            selected: f.minPowerKw,
            onSelected: (p) => onChanged(f.copyWith(minPowerKw: () => p)),
          ),
        ),
        _Section(
          title: l10n.chargingFilterConnectors,
          icon: Icons.power_outlined,
          subtitle: l10n.chargingFilterConnectorsHelp,
          child: meta == null
              ? Text(l10n.chargingFilterMetaUnavailable)
              : Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    for (final c in connectorTypes)
                      AppFilterChip(
                        label: c.name,
                        selected: f.connectorTypes.contains(c.code),
                        onSelected: (on) => onChanged(
                          f.copyWith(
                            connectorTypes: on ? {...f.connectorTypes, c.code} : ({...f.connectorTypes}..remove(c.code)),
                          ),
                        ),
                      ),
                  ],
                ),
        ),
        _Section(
          title: l10n.chargingFilterAvailability,
          icon: Icons.schedule_outlined,
          child: Column(
            children: [
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(l10n.chargingFilterOpenNow),
                subtitle: Text(l10n.chargingFilterOpenNowHelp),
                value: f.openNow,
                onChanged: (v) => onChanged(f.copyWith(openNow: v)),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(l10n.chargingFilterPublicOnly),
                value: f.publicOnly,
                onChanged: (v) => onChanged(f.copyWith(publicOnly: v)),
              ),
            ],
          ),
        ),
        if (operatorNames.isNotEmpty || f.operatorNames.isNotEmpty)
          _Section(
            title: l10n.chargingFilterOperator,
            icon: Icons.business_outlined,
            subtitle: l10n.chargingFilterOperatorHelp,
            child: Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final name in {...operatorNames, ...f.operatorNames})
                  AppFilterChip(
                    label: name,
                    selected: f.operatorNames.contains(name),
                    onSelected: (on) => onChanged(
                      f.copyWith(operatorNames: on ? {...f.operatorNames, name} : ({...f.operatorNames}..remove(name))),
                    ),
                  ),
              ],
            ),
          ),
        if (meta != null && meta.amenities.isNotEmpty)
          _Section(
            title: l10n.chargingFilterAmenities,
            icon: Icons.local_cafe_outlined,
            subtitle: l10n.chargingFilterAmenitiesHelp,
            child: Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final a in meta.amenities)
                  AppFilterChip(
                    label: a.label,
                    selected: f.amenities.contains(a.code),
                    onSelected: (on) =>
                        onChanged(f.copyWith(amenities: on ? {...f.amenities, a.code} : ({...f.amenities}..remove(a.code)))),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child, this.icon, this.subtitle});

  final String title;
  final String? subtitle;
  final IconData? icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Row(
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 20, color: theme.colorScheme.primary),
                  const SizedBox(width: AppSpacing.sm),
                ],
                Expanded(child: Text(title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700))),
              ],
            ),
          ),
          if (subtitle != null)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xxs),
              child: Text(
                subtitle!,
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            ),
          const SizedBox(height: AppSpacing.sm),
          child,
        ],
      ),
    );
  }
}

class _VehicleChooser extends ConsumerWidget {
  const _VehicleChooser({required this.value, required this.onChanged});

  final StationFilters value;
  final ValueChanged<StationFilters> onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final signedIn = ref.watch(authControllerProvider.select((s) => s.isSignedIn));
    final help = Text(
      l10n.chargingFilterVehicleHelp,
      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
    );
    if (!signedIn) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          help,
          const SizedBox(height: AppSpacing.sm),
          SecondaryButton(
            label: l10n.chargingFilterVehicleSignIn,
            icon: Icons.login,
            onPressed: () => context.push(AppRoutes.login(from: AppRoutes.charging)),
          ),
        ],
      );
    }
    final cars = ref.watch(myChargingCarsProvider);
    return cars.when(
      skipLoadingOnRefresh: true,
      loading: () => const Skeleton(child: SkeletonLine(widthFactor: 0.6)),
      error: (e, _) => Row(
        children: [
          Expanded(child: Text(errorMessage(l10n, e))),
          TextButton(onPressed: () => ref.invalidate(myChargingCarsProvider), child: Text(l10n.commonRetry)),
        ],
      ),
      data: (list) {
        if (list.isEmpty) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              help,
              const SizedBox(height: AppSpacing.sm),
              SecondaryButton(
                label: l10n.chargingFilterVehicleAddCar,
                icon: Icons.add,
                onPressed: () => context.push(AppRoutes.garageAdd),
              ),
            ],
          );
        }
        final selectedId = value.vehicle?.userVehicleId;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            help,
            const SizedBox(height: AppSpacing.xs),
            RadioGroup<String?>(
              groupValue: selectedId,
              onChanged: (id) {
                final car = list.where((c) => c.id == id).firstOrNull;
                onChanged(
                  value.copyWith(
                    vehicle: () => car == null ? null : CompatVehicle.garage(userVehicleId: car.id, name: car.displayName),
                  ),
                );
              },
              child: Column(
                children: [
                  RadioListTile<String?>(
                    contentPadding: EdgeInsets.zero,
                    value: null,
                    title: Text(l10n.chargingFilterVehicleNone),
                  ),
                  for (final car in list)
                    RadioListTile<String?>(
                      contentPadding: EdgeInsets.zero,
                      value: car.id,
                      title: Text(car.displayName),
                      subtitle: car.listedInMarket ? null : Text(l10n.chargingFilterVehicleNotInMarket),
                    ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}
