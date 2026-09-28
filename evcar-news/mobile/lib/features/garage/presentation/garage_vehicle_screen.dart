import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../core/app_config/features.dart';
import '../../../core/errors/app_errors.dart';
import '../../../shared/widgets/kit.dart';
import '../application/garage_providers.dart';
import '../common/personal_forms.dart';
import '../common/personal_widgets.dart';
import '../data/garage_repository.dart';
import '../domain/user_vehicle.dart';
import 'garage_screen.dart';

/// One garage car (`/garage/:id`): details, odometer, shortcuts to its
/// charging log, reminders, spec sheet and calculators.
class GarageVehicleScreen extends ConsumerWidget {
  const GarageVehicleScreen({super.key, required this.vehicleId});

  final String vehicleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return PersonalPage(
      title: l10n.garageVehicleTitle,
      returnTo: AppRoutes.garageVehicle(vehicleId),
      builder: (context, user) {
        final value = ref.watch(garageVehicleProvider(vehicleId));
        final vehicle = value.value;
        return AppScaffold.slivers(
          title: vehicle?.displayName ?? l10n.garageVehicleTitle,
          onRefresh: () => ref.refresh(garageVehicleProvider(vehicleId).future),
          actions: [
            if (vehicle != null)
              IconButton(
                tooltip: l10n.garageEditTitle,
                icon: const Icon(Icons.edit_outlined),
                onPressed: () => context.push(AppRoutes.garageVehicleEdit(vehicleId)),
              ),
          ],
          slivers: [
            SliverAsyncStateView<UserVehicle>(
              value: value,
              onRetry: () => ref.invalidate(garageVehicleProvider(vehicleId)),
              loading: Padding(
                padding: EdgeInsets.all(context.pageGutter),
                child: const Skeleton(child: SkeletonList(item: ListTileSkeleton(leadingSize: 56), count: 4)),
              ),
              builder: (context, v) => SliverResponsivePadding(
                maxWidth: kMaxReadableWidth,
                sliver: SliverPadding(
                  padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.sm, context.pageGutter, AppSpacing.xxl),
                  sliver: SliverList.list(children: _content(context, ref, v)),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  List<Widget> _content(BuildContext context, WidgetRef ref, UserVehicle v) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final config = ref.watch(appConfigProvider);
    final market = config.marketByCode(v.marketCode);
    bool on(String flag) => config.isFeatureEnabled(flag);
    return [
      GarageVehicleCard(vehicle: v, onTap: () {}),
      if (!v.listedInMarket) ...[
        const SizedBox(height: AppSpacing.md),
        InlineNotice(message: l10n.garageNotListedExplain(market?.nameFor(context.languageCode) ?? v.marketCode), tone: AppTone.warning),
      ],
      const SizedBox(height: AppSpacing.lg),
      SectionCard(
        title: l10n.garageDetailsSection,
        icon: Icons.info_outline,
        child: Column(
          children: [
            InfoRow(label: l10n.garageTrim, value: v.variant.trimName ?? v.variant.name),
            InfoRow(label: l10n.garageModelYear, value: v.variant.modelYear?.toString()),
            InfoRow(label: l10n.garageMarket, value: market?.nameFor(context.languageCode) ?? v.marketCode),
            InfoRow(label: l10n.garagePurchaseDate, value: fmt.date(parseIsoDate(v.purchaseDate))),
            InfoRow(label: l10n.garageInitialOdometer, value: fmt.distanceKm(v.initialOdometerKm)),
            InfoRow(label: l10n.garageCurrentOdometer, value: fmt.distanceKm(v.currentOdometerKm)),
            if (v.odometerUpdatedAt != null)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: LastUpdatedText(time: v.odometerUpdatedAt),
              ),
            if (v.notes != null && v.notes!.trim().isNotEmpty) ...[
              const Divider(height: AppSpacing.xl),
              Align(alignment: AlignmentDirectional.centerStart, child: Text(v.notes!)),
            ],
          ],
        ),
      ),
      const SizedBox(height: AppSpacing.lg),
      SectionCard(
        title: l10n.garageShortcutsSection,
        icon: Icons.bolt_outlined,
        child: Column(
          children: [
            if (on(Features.chargingLogs))
              _Shortcut(
                icon: Icons.receipt_long_outlined,
                label: l10n.garageOpenLogs,
                onTap: () => context.push(Uri(path: AppRoutes.chargingLogs, queryParameters: {'vehicle': v.id}).toString()),
              ),
            if (on(Features.chargingLogs))
              _Shortcut(
                icon: Icons.add_circle_outline,
                label: l10n.garageAddLog,
                onTap: () => context.push(Uri(path: AppRoutes.chargingLogNew, queryParameters: {'vehicle': v.id}).toString()),
              ),
            if (on(Features.reminders))
              _Shortcut(
                icon: Icons.alarm_add_outlined,
                label: l10n.garageAddReminder,
                onTap: () => context.push(Uri(path: AppRoutes.reminderNew, queryParameters: {'vehicle': v.id}).toString()),
              ),
            if (on(Features.calculators))
              _Shortcut(
                icon: Icons.calculate_outlined,
                label: l10n.garageOpenCalculators,
                onTap: () => context.push(AppRoutes.calculators),
              ),
            if (on(Features.cars) && v.variant.slug != null && v.variant.isPublished)
              _Shortcut(
                icon: Icons.list_alt_outlined,
                label: l10n.garageOpenSpecs,
                onTap: () => context.push(AppRoutes.variant(v.variant.slug!)),
              ),
          ],
        ),
      ),
      const SizedBox(height: AppSpacing.lg),
      if (!v.isPrimary)
        SecondaryButton(
          label: l10n.garageMakePrimary,
          icon: Icons.star_outline_rounded,
          expand: true,
          onPressed: () => _makePrimary(context, ref, v),
        ),
      const SizedBox(height: AppSpacing.sm),
      PrimaryButton(
        label: l10n.garageDelete,
        icon: Icons.delete_outline,
        destructive: true,
        expand: true,
        onPressed: () => _delete(context, ref, v),
      ),
    ];
  }

  Future<void> _makePrimary(BuildContext context, WidgetRef ref, UserVehicle v) async {
    final l10n = context.l10n;
    try {
      await ref.read(garageRepositoryProvider).update(v.id, {'isPrimary': true});
      ref.invalidate(garageVehicleProvider(v.id));
      ref.invalidate(garageVehiclesProvider);
      if (context.mounted) showAppSnackBar(context, l10n.garagePrimarySet, tone: AppTone.success);
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, errorMessage(l10n, e), tone: AppTone.danger);
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, UserVehicle v) async {
    final l10n = context.l10n;
    final ok = await showConfirmSheet(
      context: context,
      title: l10n.garageDeleteConfirmTitle(v.displayName),
      message: l10n.garageDeleteConfirmMessage,
      confirmLabel: l10n.garageDelete,
      destructive: true,
      icon: Icons.delete_outline,
    );
    if (!ok || !context.mounted) return;
    try {
      await ref.read(garageRepositoryProvider).delete(v.id);
      ref.invalidate(garageVehiclesProvider);
      if (!context.mounted) return;
      showAppSnackBar(context, l10n.garageDeleted, tone: AppTone.success);
      if (context.canPop()) {
        context.pop();
      } else {
        context.go(AppRoutes.garage);
      }
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, errorMessage(l10n, e), tone: AppTone.danger);
    }
  }
}

class _Shortcut extends StatelessWidget {
  const _Shortcut({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.zero,
    leading: Icon(icon, color: Theme.of(context).colorScheme.primary),
    title: Text(label),
    trailing: const ForwardChevron(),
    onTap: onTap,
  );
}
