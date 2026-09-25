import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Compare tab root (`/compare`): 2–4 variants with mandatory year/trim/market, short and detailed views, differences only, save and share.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `compare` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class CompareScreen extends StatelessWidget {
  const CompareScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.compareTitle,
      requestedPath: AppRoutes.compare,
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
