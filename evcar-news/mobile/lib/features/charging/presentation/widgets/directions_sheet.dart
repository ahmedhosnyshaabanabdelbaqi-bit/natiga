import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/platform/platform_capabilities.dart';
import '../../../../shared/widgets/kit.dart';
import '../../data/directions.dart';

String _appLabel(AppLocalizations l10n, NavigationApp app) => switch (app) {
  NavigationApp.systemChooser => l10n.chargingNavSystem,
  NavigationApp.googleMaps => l10n.chargingNavGoogle,
  NavigationApp.appleMaps => l10n.chargingNavApple,
  NavigationApp.waze => l10n.chargingNavWaze,
  NavigationApp.webMap => l10n.chargingNavWeb,
};

IconData _appIcon(NavigationApp app) => switch (app) {
  NavigationApp.systemChooser => Icons.apps,
  NavigationApp.googleMaps => Icons.map_outlined,
  NavigationApp.appleMaps => Icons.map,
  NavigationApp.waze => Icons.navigation_outlined,
  NavigationApp.webMap => Icons.public,
};

/// "Directions" chooser: hands the station coordinates to an external
/// navigation app (the app never draws its own route).
Future<void> showDirectionsSheet(
  BuildContext context,
  WidgetRef ref, {
  required double lat,
  required double lng,
  required String label,
  bool isDemo = false,
}) async {
  final l10n = context.l10n;
  final options = directionsOptions(
    lat: lat,
    lng: lng,
    label: label,
    platform: defaultTargetPlatform,
    webPreview: !ref.read(platformCapabilitiesProvider).externalNavigationApps,
  );
  final launch = ref.read(externalUriLauncherProvider);
  await showAppBottomSheet<void>(
    context: context,
    title: l10n.chargingDirections,
    builder: (sheetContext) => Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (isDemo)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl, vertical: AppSpacing.sm),
            child: Row(
              children: [
                const DemoBadge(),
                const SizedBox(width: AppSpacing.sm),
                Expanded(child: Text(l10n.chargingDemoNoDirections)),
              ],
            ),
          ),
        for (final o in options)
          ListTile(
            leading: Icon(_appIcon(o.app)),
            title: Text(_appLabel(l10n, o.app)),
            trailing: const Icon(Icons.open_in_new),
            onTap: () async {
              Navigator.of(sheetContext).pop();
              final ok = await openDirections(launch, o);
              if (!ok && context.mounted) {
                showAppSnackBar(context, l10n.chargingNavFailed, tone: AppTone.danger);
              }
            },
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.xl, AppSpacing.sm, AppSpacing.xl, AppSpacing.lg),
          child: Text(
            l10n.chargingDirectionsNote,
            style: Theme.of(sheetContext).textTheme.bodySmall,
          ),
        ),
      ],
    ),
  );
}
