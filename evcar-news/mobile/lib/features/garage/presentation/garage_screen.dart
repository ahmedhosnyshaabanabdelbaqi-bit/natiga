import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../shared/widgets/kit.dart';
import '../application/garage_providers.dart';
import '../common/personal_widgets.dart';
import '../domain/user_vehicle.dart';

/// My garage (`/garage`): the user's cars, each a real catalog trim + market.
/// Guests see why an account is needed.
class GarageScreen extends ConsumerWidget {
  const GarageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return PersonalPage(
      title: l10n.garageTitle,
      returnTo: AppRoutes.garage,
      guestMessage: l10n.garageGuestMessage,
      builder: (context, user) {
        final value = ref.watch(garageVehiclesProvider);
        final count = value.value?.length ?? 0;
        final canAdd = value.hasValue && count < garageMaxVehicles;
        return AppScaffold.slivers(
          title: l10n.garageTitle,
          largeTitle: true,
          onRefresh: () => ref.refresh(garageVehiclesProvider.future),
          floatingActionButton: value.hasValue && count > 0
              ? AddFab(
                  label: l10n.garageAddTitle,
                  onPressed: canAdd
                      ? () => context.push(AppRoutes.garageAdd)
                      : () => showAppSnackBar(context, l10n.garageLimitReached(garageMaxVehicles), tone: AppTone.warning),
                )
              : null,
          slivers: [
            SliverAsyncStateView<List<UserVehicle>>(
              value: value,
              onRetry: () => ref.invalidate(garageVehiclesProvider),
              isEmpty: (items) => items.isEmpty,
              emptyIcon: Icons.garage_outlined,
              emptyTitle: l10n.garageEmptyTitle,
              emptyMessage: l10n.garageEmptyMessage,
              emptyActions: [
                StateAction(
                  label: l10n.garageAddFirst,
                  icon: Icons.add,
                  primary: true,
                  onPressed: () => context.push(AppRoutes.garageAdd),
                ),
              ],
              loading: Padding(
                padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
                child: const Skeleton(child: SkeletonList(item: ListTileSkeleton(leadingSize: 56), count: 3)),
              ),
              builder: (context, items) => SliverResponsivePadding(
                maxWidth: kMaxReadableWidth,
                sliver: SliverPadding(
                  padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.sm, context.pageGutter, 96),
                  sliver: SliverList.separated(
                    itemCount: items.length + 1,
                    separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
                    itemBuilder: (context, i) => i == items.length
                        ? Text(
                            l10n.garageCount(items.length, garageMaxVehicles),
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodySmall,
                          )
                        : GarageVehicleCard(vehicle: items[i]),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

/// One garage car as a card (list and pickers).
class GarageVehicleCard extends ConsumerWidget {
  const GarageVehicleCard({super.key, required this.vehicle, this.onTap});

  final UserVehicle vehicle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final market = ref.watch(appConfigProvider).marketByCode(vehicle.marketCode);
    final lang = context.languageCode;
    final powertrain = Powertrain.fromApi(vehicle.variant.powertrainType);
    final subtitle = <String>{
      vehicle.variant.name,
      if (vehicle.nickname != null && vehicle.variant.trimName != null) vehicle.variant.trimName!,
    }.where((s) => s.isNotEmpty && s != vehicle.displayName).join(' · ');
    return AppCard(
      padding: EdgeInsets.zero,
      clip: true,
      onTap: onTap ?? () => context.push(AppRoutes.garageVehicle(vehicle.id)),
      semanticLabel: [
        vehicle.displayName,
        if (vehicle.isPrimary) l10n.garagePrimary,
        market?.nameFor(lang) ?? vehicle.marketCode,
      ].join(', '),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            decoration: BoxDecoration(gradient: context.palette.brandGradient),
            padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, AppSpacing.md),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const ExcludeSemantics(child: Icon(Icons.directions_car_filled_rounded, color: Colors.white, size: 36)),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        vehicle.displayName,
                        style: theme.textTheme.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
                      ),
                      if (subtitle.isNotEmpty)
                        Text(subtitle, style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white.withValues(alpha: 0.9))),
                    ],
                  ),
                ),
                if (vehicle.isPrimary)
                  Pill(label: l10n.garagePrimary, icon: Icons.star_rounded, tone: AppTone.brand, dense: true),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    if (powertrain != null) PowertrainPill(powertrain: powertrain, dense: true),
                    Pill(icon: Icons.public, label: market?.nameFor(lang) ?? vehicle.marketCode, dense: true),
                    if (!vehicle.listedInMarket)
                      Pill(icon: Icons.info_outline, label: l10n.garageNotListedShort, tone: AppTone.warning, dense: true),
                  ],
                ),
                const SizedBox(height: AppSpacing.md),
                StatTileRow(
                  tiles: [
                    StatTile(
                      dense: true,
                      icon: Icons.speed,
                      label: l10n.garageOdometer,
                      value: fmt.distanceKm(vehicle.currentOdometerKm),
                    ),
                    StatTile(
                      dense: true,
                      icon: Icons.receipt_long_outlined,
                      label: l10n.garageLogsCount,
                      value: fmt.number(vehicle.chargingLogCount),
                    ),
                    StatTile(
                      dense: true,
                      icon: Icons.alarm,
                      label: l10n.garageRemindersCount,
                      value: fmt.number(vehicle.openReminderCount),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
