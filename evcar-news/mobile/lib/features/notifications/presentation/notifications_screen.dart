import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/errors/app_errors.dart';
import '../../../core/links/external_links.dart';
import '../../../shared/widgets/kit.dart';
import '../../garage/common/personal_widgets.dart';
import '../application/notifications_providers.dart';
import '../domain/notification_models.dart';

/// Notification centre (`/notifications`): what the server recorded for the
/// user; tapping opens the linked content (validated in-app path or https).
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  bool _unreadOnly = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return PersonalPage(
      title: l10n.notificationsTitle,
      returnTo: AppRoutes.notifications,
      guestMessage: l10n.notificationsGuestMessage,
      builder: (context, user) {
        final provider = notificationsProvider(_unreadOnly);
        final value = ref.watch(provider);
        final hasUnread = value.value?.items.any((n) => !n.isRead) ?? false;
        return AppScaffold.slivers(
          title: l10n.notificationsTitle,
          largeTitle: true,
          onRefresh: () async {
            ref.invalidate(unreadNotificationsCountProvider);
            await ref.refresh(provider.future).then((_) {}, onError: (_) {});
          },
          actions: [
            if (hasUnread)
              IconButton(
                tooltip: l10n.notificationsMarkAllRead,
                icon: const Icon(Icons.done_all),
                onPressed: () async {
                  try {
                    await ref.read(provider.notifier).markAllRead();
                  } on Object catch (e) {
                    if (context.mounted) showAppSnackBar(context, errorMessage(l10n, e), tone: AppTone.danger);
                  }
                },
              ),
            IconButton(
              tooltip: l10n.notificationsPreferencesTitle,
              icon: const Icon(Icons.tune),
              onPressed: () => context.push(AppRoutes.notificationPreferences),
            ),
          ],
          slivers: [
            SliverToBoxAdapter(
              child: FilterBar(
                chips: [
                  AppFilterChip(
                    label: l10n.notificationsFilterAll,
                    selected: !_unreadOnly,
                    onSelected: (_) => setState(() => _unreadOnly = false),
                  ),
                  AppFilterChip(
                    label: l10n.notificationsFilterUnread,
                    selected: _unreadOnly,
                    onSelected: (_) => setState(() => _unreadOnly = true),
                  ),
                ],
              ),
            ),
            SliverAsyncStateView<NotificationsState>(
              value: value,
              onRetry: () => ref.invalidate(provider),
              isEmpty: (s) => s.items.isEmpty,
              emptyIcon: Icons.notifications_none,
              emptyTitle: _unreadOnly ? l10n.notificationsEmptyUnreadTitle : l10n.notificationsEmptyTitle,
              emptyMessage: _unreadOnly ? null : l10n.notificationsEmptyMessage,
              emptyActions: [
                if (!_unreadOnly)
                  StateAction(
                    label: l10n.notificationsChooseTopics,
                    icon: Icons.tune,
                    primary: true,
                    onPressed: () => context.push(AppRoutes.notificationPreferences),
                  ),
              ],
              loading: Padding(
                padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
                child: const Skeleton(child: SkeletonList(item: ListTileSkeleton(), count: 6)),
              ),
              builder: (context, s) => SliverResponsivePadding(
                maxWidth: kMaxReadableWidth,
                sliver: SliverPadding(
                  padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.sm, context.pageGutter, AppSpacing.xxl),
                  sliver: SliverList.builder(
                    itemCount: s.items.length + 1,
                    itemBuilder: (context, i) {
                      if (i == s.items.length) {
                        if (s.loadMoreError != null) {
                          return ErrorState(
                            error: s.loadMoreError!,
                            compact: true,
                            onRetry: () => ref.read(provider.notifier).loadMore(),
                          );
                        }
                        if (!s.hasMore) return const SizedBox.shrink();
                        return Padding(
                          padding: const EdgeInsets.all(AppSpacing.lg),
                          child: Center(
                            child: s.loadingMore
                                ? const CircularProgressIndicator()
                                : SecondaryButton(
                                    label: l10n.notificationsLoadMore,
                                    onPressed: () => ref.read(provider.notifier).loadMore(),
                                  ),
                          ),
                        );
                      }
                      final n = s.items[i];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                        child: NotificationTile(
                          notification: n,
                          onOpen: () => _open(n),
                          onToggleRead: () => _setRead(n, !n.isRead),
                          onDelete: () => _delete(n),
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  NotificationsController get _controller => ref.read(notificationsProvider(_unreadOnly).notifier);

  Future<void> _setRead(AppNotification n, bool read) async {
    try {
      await _controller.setRead(n, read);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorMessage(context.l10n, e), tone: AppTone.danger);
    }
  }

  Future<void> _delete(AppNotification n) async {
    final l10n = context.l10n;
    try {
      await _controller.remove(n);
      if (mounted) showAppSnackBar(context, l10n.notificationsDeleted);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorMessage(l10n, e), tone: AppTone.danger);
    }
  }

  Future<void> _open(AppNotification n) async {
    if (!n.isRead) unawaited(_setRead(n, true));
    final target = resolveNotificationLink(n.deepLink);
    if (!mounted) return;
    switch (target) {
      case InAppTarget(:final location):
        unawaited(context.push(location));
      case ExternalTarget(:final url):
        await openExternalUrl(context, url);
      case null:
        await showAppBottomSheet<void>(
          context: context,
          title: n.title,
          builder: (context) => Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.xl, 0, AppSpacing.xl, AppSpacing.xl),
            child: Text(n.body ?? ''),
          ),
        );
    }
  }
}

/// One notification (unread = bold + "New" label + dot, never colour alone).
class NotificationTile extends StatelessWidget {
  const NotificationTile({
    super.key,
    required this.notification,
    required this.onOpen,
    required this.onToggleRead,
    required this.onDelete,
  });

  final AppNotification notification;
  final VoidCallback onOpen;
  final VoidCallback onToggleRead;
  final VoidCallback onDelete;

  static IconData iconFor(String type) => switch (type) {
    'news' || 'article' => Icons.article_outlined,
    'price_alert' || 'priceAlerts' => Icons.sell_outlined,
    'reminder' || 'reminders' => Icons.alarm,
    'community' => Icons.forum_outlined,
    'station' || 'stationAlerts' => Icons.ev_station_outlined,
    'campaign' || 'campaigns' => Icons.campaign_outlined,
    _ => Icons.notifications_none,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final n = notification;
    final unread = !n.isRead;
    return Dismissible(
      key: ValueKey('notification-${n.id}'),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: AlignmentDirectional.centerEnd,
        padding: const EdgeInsetsDirectional.only(end: AppSpacing.xl),
        decoration: BoxDecoration(color: theme.colorScheme.errorContainer, borderRadius: AppRadii.card),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.delete_outline, color: theme.colorScheme.onErrorContainer),
            const SizedBox(width: AppSpacing.xs),
            Text(l10n.notificationsDelete, style: TextStyle(color: theme.colorScheme.onErrorContainer)),
          ],
        ),
      ),
      onDismissed: (_) => onDelete(),
      child: AppCard(
        onTap: onOpen,
        selected: unread,
        semanticLabel: [
          if (unread) l10n.notificationsNew,
          n.title,
          ?n.body,
          friendlyTime(context, n.createdAt) ?? '',
        ].join(', '),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                CircleAvatar(
                  radius: 22,
                  backgroundColor: theme.colorScheme.primaryContainer,
                  child: Icon(iconFor(n.type), color: theme.colorScheme.onPrimaryContainer),
                ),
                if (unread)
                  PositionedDirectional(
                    top: -2,
                    end: -2,
                    child: Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary,
                        shape: BoxShape.circle,
                        border: Border.all(color: theme.colorScheme.surface, width: 2),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: AppSpacing.sm,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      if (unread) Pill(label: l10n.notificationsNew, tone: AppTone.brand, dense: true),
                      Text(
                        friendlyTime(context, n.createdAt) ?? '',
                        style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.xxs),
                  Text(
                    n.title,
                    style: theme.textTheme.titleSmall?.copyWith(fontWeight: unread ? FontWeight.w800 : FontWeight.w500),
                  ),
                  if (n.body != null && n.body!.isNotEmpty)
                    Text(
                      n.body!,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                ],
              ),
            ),
            PopupMenuButton<String>(
              tooltip: l10n.notificationsActions,
              onSelected: (v) => v == 'read' ? onToggleRead() : onDelete(),
              itemBuilder: (context) => [
                PopupMenuItem(
                  value: 'read',
                  child: Text(unread ? l10n.notificationsMarkRead : l10n.notificationsMarkUnread),
                ),
                PopupMenuItem(value: 'delete', child: Text(l10n.notificationsDelete)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
