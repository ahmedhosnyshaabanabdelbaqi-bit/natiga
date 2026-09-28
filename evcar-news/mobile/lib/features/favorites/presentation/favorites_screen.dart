import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/errors/app_errors.dart';
import '../../../shared/favorites/favorites_repository.dart';
import '../../../shared/widgets/kit.dart';
import '../../auth/presentation/auth_controller.dart';

/// Tabs of the favorites screen and the favorite types each one holds.
enum FavoritesTab {
  articles({FavoriteType.article}),
  cars({FavoriteType.model, FavoriteType.variant, FavoriteType.tour}),
  comparisons({FavoriteType.comparison}),
  stations({FavoriteType.station});

  const FavoritesTab(this.types);

  final Set<FavoriteType> types;
}

/// Favorites (`/favorites`): articles, cars (models, trims, tours),
/// comparisons and stations. Guests keep favorites on this device; after
/// sign-in they are merged into the account and synced.
class FavoritesScreen extends ConsumerWidget {
  const FavoritesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final state = ref.watch(favoritesProvider);
    String tabLabel(FavoritesTab t) {
      final n = state.items.values.where((i) => t.types.contains(i.key.type)).length;
      final label = switch (t) {
        FavoritesTab.articles => l10n.favoritesTabArticles,
        FavoritesTab.cars => l10n.favoritesTabCars,
        FavoritesTab.comparisons => l10n.favoritesTabComparisons,
        FavoritesTab.stations => l10n.favoritesTabStations,
      };
      return n == 0 ? label : '$label (${AppFormatters.of(context).number(n)})';
    }

    return DefaultTabController(
      length: FavoritesTab.values.length,
      child: AppScaffold(
        title: l10n.favoritesTitle,
        actions: [
          IconButton(
            tooltip: l10n.favoritesSavedOfflineTitle,
            icon: const Icon(Icons.download_for_offline_outlined),
            onPressed: () => context.push(AppRoutes.savedOffline),
          ),
        ],
        bottom: TabBar(
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: [for (final t in FavoritesTab.values) Tab(text: tabLabel(t))],
        ),
        body: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _SyncBanner(),
            Expanded(
              child: TabBarView(children: [for (final t in FavoritesTab.values) _FavoritesList(tab: t)]),
            ),
          ],
        ),
      ),
    );
  }
}

/// Guest: "kept on this device, sign in to sync"; signed in: syncing /
/// failed (with retry). Nothing when everything is in sync.
class _SyncBanner extends ConsumerWidget {
  const _SyncBanner();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final signedIn = ref.watch(authControllerProvider.select((s) => s.isSignedIn));
    final remote = ref.watch(favoritesRemoteProvider);
    final state = ref.watch(favoritesProvider);

    Widget banner({required IconData icon, required AppTone tone, required String text, Widget? action}) {
      final c = context.palette.tone(tone);
      return Container(
        margin: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.md, context.pageGutter, 0),
        padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.md, AppSpacing.sm, AppSpacing.xs, AppSpacing.sm),
        decoration: BoxDecoration(color: c.container, borderRadius: AppRadii.control),
        child: Row(
          children: [
            Icon(icon, color: c.onContainer, size: 20),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(text, style: theme.textTheme.bodySmall?.copyWith(color: c.onContainer)),
            ),
            ?action,
          ],
        ),
      );
    }

    if (!signedIn) {
      return banner(
        icon: Icons.phone_android,
        tone: AppTone.info,
        text: remote == null ? l10n.favoritesDeviceOnly : l10n.favoritesGuestHint,
        action: remote == null
            ? null
            : TextButton(
                onPressed: () => context.push(AppRoutes.login(from: AppRoutes.favorites)),
                child: Text(l10n.commonSignIn),
              ),
      );
    }
    if (remote == null) {
      return banner(icon: Icons.phone_android, tone: AppTone.info, text: l10n.favoritesDeviceOnly);
    }
    if (state.syncing) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          banner(icon: Icons.sync, tone: AppTone.info, text: l10n.favoritesSyncing),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
            child: const LinearProgressIndicator(minHeight: 2),
          ),
        ],
      );
    }
    if (state.syncError != null) {
      return banner(
        icon: Icons.sync_problem,
        tone: AppTone.warning,
        text: '${l10n.favoritesSyncFailed} ${errorMessage(l10n, state.syncError!)}',
        action: TextButton(onPressed: () => ref.read(favoritesProvider.notifier).sync(), child: Text(l10n.commonRetry)),
      );
    }
    return const SizedBox.shrink();
  }
}

class _FavoritesList extends ConsumerWidget {
  const _FavoritesList({required this.tab});

  final FavoritesTab tab;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final state = ref.watch(favoritesProvider);
    final items = state.list().where((i) => tab.types.contains(i.key.type)).toList();
    final signedIn = ref.watch(authControllerProvider.select((s) => s.isSignedIn));
    final canSync = signedIn && ref.watch(favoritesRemoteProvider) != null;

    Future<void> refresh() async {
      if (canSync) await ref.read(favoritesProvider.notifier).sync();
    }

    if (items.isEmpty) {
      final (icon, title, message, action, route) = switch (tab) {
        FavoritesTab.articles => (
          Icons.newspaper_outlined,
          l10n.favoritesEmptyArticlesTitle,
          l10n.favoritesEmptyArticlesMessage,
          l10n.favoritesBrowseNews,
          AppRoutes.news,
        ),
        FavoritesTab.cars => (
          Icons.directions_car_outlined,
          l10n.favoritesEmptyCarsTitle,
          l10n.favoritesEmptyCarsMessage,
          l10n.favoritesBrowseCars,
          AppRoutes.cars,
        ),
        FavoritesTab.comparisons => (
          Icons.compare_arrows,
          l10n.favoritesEmptyComparisonsTitle,
          l10n.favoritesEmptyComparisonsMessage,
          l10n.favoritesBrowseComparisons,
          AppRoutes.compare,
        ),
        FavoritesTab.stations => (
          Icons.ev_station_outlined,
          l10n.favoritesEmptyStationsTitle,
          l10n.favoritesEmptyStationsMessage,
          l10n.favoritesBrowseStations,
          AppRoutes.charging,
        ),
      };
      return RefreshIndicator.adaptive(
        onRefresh: refresh,
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: Center(
                child: EmptyState(
                  icon: icon,
                  title: title,
                  message: message,
                  actions: [
                    StateAction(
                      label: action,
                      icon: Icons.arrow_forward,
                      primary: true,
                      onPressed: () => context.go(route),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    return RefreshIndicator.adaptive(
      onRefresh: refresh,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.md, context.pageGutter, AppSpacing.xl),
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.sm),
        itemBuilder: (context, i) => FavoriteTile(item: items[i], showLocalOnly: canSync),
      ),
    );
  }
}

IconData favoriteTypeIcon(FavoriteType t) => switch (t) {
  FavoriteType.article => Icons.newspaper_outlined,
  FavoriteType.model => Icons.directions_car_outlined,
  FavoriteType.variant => Icons.tune,
  FavoriteType.station => Icons.ev_station_outlined,
  FavoriteType.comparison => Icons.compare_arrows,
  FavoriteType.tour => Icons.threesixty,
};

/// One favorite: snapshot (works offline), saved date, availability note,
/// "on this device only" label, remove with undo.
class FavoriteTile extends ConsumerWidget {
  const FavoriteTile({super.key, required this.item, this.showLocalOnly = false});

  final FavoriteItem item;
  final bool showLocalOnly;

  Future<void> _remove(BuildContext context, WidgetRef ref) async {
    final l10n = context.l10n;
    final notifier = ref.read(favoritesProvider.notifier);
    try {
      await notifier.toggle(item);
      if (!context.mounted) return;
      showAppSnackBar(
        context,
        l10n.favoritesRemoved(item.title),
        icon: Icons.favorite_border,
        actionLabel: l10n.favoritesUndo,
        onAction: () => notifier.toggle(item).then((_) {}, onError: (Object _) {}),
      );
    } on Object catch (e) {
      if (context.mounted) {
        showAppSnackBar(context, '${l10n.commonFavoriteFailed} ${errorMessage(l10n, e)}', tone: AppTone.danger);
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final route = item.route ?? (item.key.type == FavoriteType.tour ? AppRoutes.tours : null);
    final saved = friendlyTime(context, item.savedAt);
    final tone = context.palette.tone(AppTone.brand);
    final canOpen = item.available && route != null;
    return AppCard(
      semanticLabel: [
        item.title,
        ?item.subtitle,
        if (!item.available) l10n.favoritesUnavailable,
        if (item.isDemo) l10n.commonDemoLabel,
      ].join('. '),
      onTap: canOpen ? () => context.push(route) : null,
      padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.md, AppSpacing.md, AppSpacing.xs, AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (item.imageUrl != null && item.available)
            SizedBox(
              width: 64,
              child: ImageWithFallback(
                url: item.imageUrl,
                aspectRatio: 1,
                width: 64,
                borderRadius: AppRadii.control,
                fallbackIcon: favoriteTypeIcon(item.key.type),
                showFallbackText: false,
              ),
            )
          else
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(color: tone.container, borderRadius: AppRadii.control),
              child: Icon(favoriteTypeIcon(item.key.type), color: tone.onContainer),
            ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
                if (item.subtitle != null && item.subtitle!.trim().isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    item.subtitle!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                ],
                if (saved != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    l10n.favoritesSavedAt(saved),
                    style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                ],
                if (!item.available || item.isDemo || (showLocalOnly && item.localOnly)) ...[
                  const SizedBox(height: AppSpacing.xs),
                  Wrap(
                    spacing: AppSpacing.xs,
                    runSpacing: AppSpacing.xs,
                    children: [
                      if (!item.available)
                        Pill(icon: Icons.block, tone: AppTone.warning, dense: true, label: l10n.favoritesUnavailable),
                      if (item.isDemo) const DemoBadge(dense: true),
                      if (showLocalOnly && item.localOnly)
                        Pill(icon: Icons.phone_android, dense: true, label: l10n.favoritesLocalOnly),
                    ],
                  ),
                ],
              ],
            ),
          ),
          IconButton(
            tooltip: l10n.commonFavoriteRemove,
            icon: Icon(Icons.favorite, color: theme.colorScheme.error),
            onPressed: () => _remove(context, ref),
          ),
        ],
      ),
    );
  }
}
