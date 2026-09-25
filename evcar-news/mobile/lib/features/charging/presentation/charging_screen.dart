import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Charging tab root (`/charging`): synchronized map + list with clustering, filters and distance; location permission asked only when needed.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `charging` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class ChargingScreen extends StatelessWidget {
  const ChargingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.chargingTitle,
      requestedPath: AppRoutes.charging,
      actions: [
        IconButton(
          tooltip: context.l10n.shellSearchTooltip,
          icon: const Icon(Icons.search),
          onPressed: () => context.push(AppRoutes.search()),
        ),
      ],
    );
  }
}
