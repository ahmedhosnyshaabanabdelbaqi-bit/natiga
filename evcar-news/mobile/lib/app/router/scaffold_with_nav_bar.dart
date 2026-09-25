import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/app_config/app_config_controller.dart';
import '../../core/app_config/features.dart';
import '../../core/connectivity/connectivity_service.dart';
import '../../core/l10n/l10n.dart';
import '../../shared/widgets/cached_data_notice.dart';

/// Bottom navigation shell: Home, Cars, Compare, Charging, Account (tabs of
/// features the server does not announce are hidden, see [Features]).
///
/// Uses [StatefulNavigationShell] (IndexedStack), so every tab keeps its own
/// navigation stack, widget state and scroll position when switching tabs.
/// Re-selecting the current tab pops it back to its root.
class ScaffoldWithNavBar extends ConsumerWidget {
  const ScaffoldWithNavBar({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  /// Feature of each shell branch (index = branch); null = always shown.
  static const branchFeatures = <String?>[null, Features.cars, Features.comparisons, Features.stations, null];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final online = ref.watch(isOnlineProvider).value ?? true;
    final config = ref.watch(appConfigProvider);
    // Tabs of features the server does not announce are hidden (Home and
    // Account always stay, so the bar never has fewer than two items).
    final visible = [
      for (var i = 0; i < branchFeatures.length; i++)
        if (branchFeatures[i] == null || config.isFeatureEnabled(branchFeatures[i]!)) i,
    ];
    final selected = visible.indexOf(navigationShell.currentIndex);
    final destinations = [
      NavigationDestination(
        icon: const Icon(Icons.home_outlined),
        selectedIcon: const Icon(Icons.home),
        label: l10n.shellNavHome,
      ),
      NavigationDestination(
        icon: const Icon(Icons.directions_car_outlined),
        selectedIcon: const Icon(Icons.directions_car),
        label: l10n.shellNavCars,
      ),
      NavigationDestination(
        icon: const Icon(Icons.compare_arrows_outlined),
        selectedIcon: const Icon(Icons.compare_arrows),
        label: l10n.shellNavCompare,
      ),
      NavigationDestination(
        icon: const Icon(Icons.ev_station_outlined),
        selectedIcon: const Icon(Icons.ev_station),
        label: l10n.shellNavCharging,
      ),
      NavigationDestination(
        icon: const Icon(Icons.person_outline),
        selectedIcon: const Icon(Icons.person),
        label: l10n.shellNavAccount,
      ),
    ];
    return Scaffold(
      body: Column(
        children: [
          if (!online) SafeArea(bottom: false, child: const OfflineBanner()),
          Expanded(
            child: MediaQuery.removePadding(context: context, removeTop: !online, child: navigationShell),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: selected < 0 ? 0 : selected,
        onDestinationSelected: (index) {
          final branch = visible[index];
          navigationShell.goBranch(branch, initialLocation: branch == navigationShell.currentIndex);
        },
        destinations: [for (final i in visible) destinations[i]],
      ),
    );
  }
}
