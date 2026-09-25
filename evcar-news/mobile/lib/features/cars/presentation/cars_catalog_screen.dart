import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Cars tab root (`/cars`): brand → model → generation → model year → variant catalog, with 360° tours surfaced prominently.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `cars` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class CarsCatalogScreen extends StatelessWidget {
  const CarsCatalogScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.carsCatalogTitle,
      requestedPath: AppRoutes.cars,
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
