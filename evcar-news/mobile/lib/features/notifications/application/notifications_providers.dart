import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../garage/application/garage_providers.dart';
import '../data/notifications_repository.dart';
import '../domain/notification_models.dart';

@immutable
class NotificationsState {
  const NotificationsState({
    required this.items,
    required this.page,
    required this.hasMore,
    this.loadingMore = false,
    this.loadMoreError,
  });

  final List<AppNotification> items;
  final int page;
  final bool hasMore;
  final bool loadingMore;
  final Object? loadMoreError;

  NotificationsState copyWith({
    List<AppNotification>? items,
    int? page,
    bool? hasMore,
    bool? loadingMore,
    Object? Function()? loadMoreError,
  }) => NotificationsState(
    items: items ?? this.items,
    page: page ?? this.page,
    hasMore: hasMore ?? this.hasMore,
    loadingMore: loadingMore ?? this.loadingMore,
    loadMoreError: loadMoreError != null ? loadMoreError() : this.loadMoreError,
  );
}

/// The notification centre (family arg: unread only). Read/unread/delete
/// are applied optimistically and rolled back when the server refuses.
class NotificationsController extends AsyncNotifier<NotificationsState> {
  NotificationsController(this.unreadOnly);

  final bool unreadOnly;
  NotificationsRepository get _repo => ref.read(notificationsRepositoryProvider);

  @override
  Future<NotificationsState> build() async {
    final userId = ref.watch(personalUserIdProvider);
    if (userId == null) return const NotificationsState(items: [], page: 1, hasMore: false);
    final res = await ref.watch(notificationsRepositoryProvider).list(unreadOnly: unreadOnly);
    return NotificationsState(items: res.items, page: 1, hasMore: res.meta.hasMore);
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || current.loadingMore || !current.hasMore || state.isLoading) return;
    state = AsyncData(current.copyWith(loadingMore: true, loadMoreError: () => null));
    try {
      final res = await _repo.list(unreadOnly: unreadOnly, page: current.page + 1);
      if (!ref.mounted) return;
      final seen = {for (final n in current.items) n.id};
      state = AsyncData(
        current.copyWith(
          items: [...current.items, ...res.items.where((n) => seen.add(n.id))],
          page: current.page + 1,
          hasMore: res.meta.hasMore && res.items.isNotEmpty,
          loadingMore: false,
        ),
      );
    } on Object catch (e) {
      if (!ref.mounted) return;
      state = AsyncData(current.copyWith(loadingMore: false, loadMoreError: () => e));
    }
  }

  void _replace(String id, AppNotification? Function(AppNotification n) f) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      current.copyWith(
        items: [
          for (final n in current.items)
            if (n.id != id) n else ?f(n),
        ],
      ),
    );
  }

  /// Marks one notification read/unread. Throws when the server refuses
  /// (after restoring the previous state).
  Future<void> setRead(AppNotification n, bool read) async {
    if (n.isRead == read) return;
    _replace(n.id, (x) => x.copyWith(isRead: read));
    try {
      await _repo.markRead(n.id, read: read);
      ref.invalidate(unreadNotificationsCountProvider);
    } on Object {
      if (ref.mounted) _replace(n.id, (x) => x.copyWith(isRead: n.isRead));
      rethrow;
    }
  }

  Future<void> markAllRead() async {
    final before = state.value;
    if (before == null) return;
    state = AsyncData(before.copyWith(items: [for (final n in before.items) n.copyWith(isRead: true)]));
    try {
      await _repo.markAllRead();
      ref.invalidate(unreadNotificationsCountProvider);
    } on Object {
      if (ref.mounted) state = AsyncData(before);
      rethrow;
    }
  }

  Future<void> remove(AppNotification n) async {
    final before = state.value;
    _replace(n.id, (_) => null);
    try {
      await _repo.delete(n.id);
      ref.invalidate(unreadNotificationsCountProvider);
    } on Object {
      if (ref.mounted && before != null) state = AsyncData(before);
      rethrow;
    }
  }
}

final notificationsProvider = AsyncNotifierProvider.autoDispose.family<NotificationsController, NotificationsState, bool>(
  NotificationsController.new,
);

/// Unread badge count (0 for guests; errors → null = "unknown", no badge).
final unreadNotificationsCountProvider = FutureProvider.autoDispose<int?>((ref) async {
  final userId = ref.watch(personalUserIdProvider);
  if (userId == null) return 0;
  try {
    return await ref.watch(notificationsRepositoryProvider).unreadCount();
  } on Object {
    return null;
  }
});

final notificationPreferencesProvider = FutureProvider.autoDispose<NotificationPreferences>((ref) {
  ref.watch(personalUserIdProvider);
  return ref.watch(notificationsRepositoryProvider).preferences();
});

final notificationSubscriptionsProvider = FutureProvider.autoDispose<List<NotificationSubscription>>((ref) {
  ref.watch(personalUserIdProvider);
  return ref.watch(notificationsRepositoryProvider).subscriptions();
});
