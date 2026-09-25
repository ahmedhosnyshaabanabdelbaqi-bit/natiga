import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../core/app_config/features.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/brand_title.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Home tab root (`/`): featured story, latest news, reviews, new cars,
/// curated comparisons, 360° tours, nearby stations (after permission) and
/// guides, ordered/hidden per `/app-config` → `homeSections`.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `home` feature.
/// Keep the class name (used by lib/app/router/app_router.dart).
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final config = ref.watch(appConfigProvider);
    // Entry points of features the server does not announce stay hidden.
    final showSearch = Features.searchable.any(config.isFeatureEnabled);
    final showNotifications = config.isFeatureEnabled(Features.notifications);
    return Scaffold(
      appBar: AppBar(
        title: const BrandTitle(),
        actions: [
          if (showSearch)
            IconButton(
              tooltip: l10n.shellSearchTooltip,
              icon: const Icon(Icons.search),
              onPressed: () => context.push(AppRoutes.search()),
            ),
          if (showNotifications)
            IconButton(
              tooltip: l10n.shellNotificationsTooltip,
              icon: const Icon(Icons.notifications_outlined),
              onPressed: () => context.push(AppRoutes.notifications),
            ),
        ],
      ),
      body: const UnderConstructionView(requestedPath: AppRoutes.home),
    );
  }
}
