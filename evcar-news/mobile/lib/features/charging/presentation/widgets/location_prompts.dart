import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../shared/widgets/kit.dart';
import '../../application/charging_providers.dart';
import '../../data/location_service.dart';

/// Explains a failed "use my location" and always offers the manual
/// alternative (choose a city or a point) — REQUIREMENTS §19.
Future<void> handleLocateOutcome(BuildContext context, WidgetRef ref, LocateOutcome outcome) async {
  final l10n = context.l10n;
  void choosePlace() => context.push(AppRoutes.chargingLocation);
  switch (outcome) {
    case LocateOutcome.located:
      return;
    case LocateOutcome.denied:
      showAppSnackBar(
        context,
        l10n.chargingLocationDenied,
        icon: Icons.location_off_outlined,
        actionLabel: l10n.chargingChoosePlace,
        onAction: choosePlace,
      );
    case LocateOutcome.unavailable:
      showAppSnackBar(
        context,
        l10n.chargingLocationUnavailable,
        icon: Icons.location_searching,
        actionLabel: l10n.chargingChoosePlace,
        onAction: choosePlace,
      );
    case LocateOutcome.deniedForever:
    case LocateOutcome.serviceDisabled:
      final service = ref.read(locationServiceProvider);
      final forever = outcome == LocateOutcome.deniedForever;
      await showAppBottomSheet<void>(
        context: context,
        title: l10n.commonPermissionLocationTitle,
        builder: (sheetContext) => Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.lg),
          child: PermissionDeniedState(
            permission: AppPermission.location,
            compact: true,
            message: forever ? l10n.chargingLocationDeniedForever : l10n.chargingLocationServiceOff,
            onOpenSettings: () {
              Navigator.of(sheetContext).pop();
              forever ? service.openAppSettings() : service.openLocationSettings();
            },
            alternatives: [
              StateAction(
                label: l10n.chargingChoosePlace,
                icon: Icons.location_city_outlined,
                primary: true,
                onPressed: () {
                  Navigator.of(sheetContext).pop();
                  choosePlace();
                },
              ),
            ],
          ),
        ),
      );
  }
}
