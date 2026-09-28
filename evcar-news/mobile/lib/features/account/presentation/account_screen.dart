import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../core/app_config/features.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/async_state_view.dart';
import '../../../shared/widgets/bottom_sheets.dart';
import '../../../shared/widgets/section_header.dart';
import '../../auth/domain/app_user.dart';
import '../../auth/domain/auth_state.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../garage/application/garage_providers.dart';
import '../../notifications/application/notifications_providers.dart';
import '../../reminders/application/reminder_notifications.dart';

/// Feature flag (from `/app-config` → `features`) that shows the trip
/// planner entry. It stays hidden until the server enables it (routing
/// provider configured — REQUIREMENTS §12).
const tripPlannerFeatureFlag = Features.tripPlanner;

/// Account tab root (`/account`). Works for guests (browsing, settings,
/// offline items) and signed-in users (profile, sessions, sign out, delete).
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final auth = ref.watch(authControllerProvider);
    final config = ref.watch(appConfigProvider);
    // Tiles of features the server does not announce are hidden (REQUIREMENTS §21).
    bool on(String flag) => config.isFeatureEnabled(flag);
    final signedIn = auth is AuthSignedIn;
    final unread = signedIn && on(Features.notifications) ? ref.watch(unreadNotificationsCountProvider).value : null;
    final cars = signedIn && on(Features.garage) ? ref.watch(garageVehiclesProvider).value : null;
    final myTools = [
      if (on(Features.garage))
        _NavTile(
          icon: Icons.garage_outlined,
          label: l10n.garageTitle,
          subtitle: cars == null || cars.isEmpty ? null : l10n.accountCarsCount(cars.length),
          location: AppRoutes.garage,
        ),
      if (on(Features.favorites))
        _NavTile(icon: Icons.favorite_outline, label: l10n.favoritesTitle, location: AppRoutes.favorites),
      // Offline reading of saved items is local to the device (always available).
      _NavTile(
        icon: Icons.download_for_offline_outlined,
        label: l10n.favoritesSavedOfflineTitle,
        location: AppRoutes.savedOffline,
      ),
      if (on(Features.chargingLogs))
        _NavTile(icon: Icons.receipt_long_outlined, label: l10n.chargingLogsTitle, location: AppRoutes.chargingLogs),
      if (on(Features.reminders))
        _NavTile(icon: Icons.alarm_outlined, label: l10n.remindersTitle, location: AppRoutes.reminders),
      if (on(Features.notifications))
        _NavTile(
          icon: Icons.notifications_outlined,
          label: l10n.notificationsTitle,
          location: AppRoutes.notifications,
          badge: unread != null && unread > 0 ? unread : null,
        ),
    ];
    final explore = [
      if (on(Features.calculators))
        _NavTile(icon: Icons.calculate_outlined, label: l10n.calculatorsTitle, location: AppRoutes.calculators),
      if (on(tripPlannerFeatureFlag))
        _NavTile(icon: Icons.route_outlined, label: l10n.tripsTitle, location: AppRoutes.trips)
      else
        ListTile(
          leading: const Icon(Icons.route_outlined),
          title: Text(l10n.tripsTitle),
          subtitle: Text(l10n.accountTripPlannerUnavailable),
          trailing: const Icon(Icons.info_outline),
          onTap: () => showAppBottomSheet<void>(
            context: context,
            title: l10n.tripsTitle,
            builder: (context) =>
                Padding(padding: const EdgeInsets.fromLTRB(24, 0, 24, 24), child: Text(l10n.accountTripPlannerExplain)),
          ),
        ),
      if (on(Features.community))
        _NavTile(icon: Icons.forum_outlined, label: l10n.communityQuestionsTitle, location: AppRoutes.questions()),
      if (on(Features.encyclopedia))
        _NavTile(icon: Icons.menu_book_outlined, label: l10n.encyclopediaTitle, location: AppRoutes.encyclopedia),
      if (on(Features.servicesDirectory))
        _NavTile(icon: Icons.handyman_outlined, label: l10n.servicesDirectoryTitle, location: AppRoutes.services),
    ];

    return Scaffold(
      appBar: AppBar(title: Text(l10n.accountTitle)),
      body: RefreshIndicator.adaptive(
        onRefresh: () async {
          ref.invalidate(unreadNotificationsCountProvider);
          ref.invalidate(garageVehiclesProvider);
        },
        child: ListView(
          key: const PageStorageKey('account-list'),
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: switch (auth) {
                AuthSignedIn(:final user, :final offline) => _UserCard(user: user, offline: offline),
                AuthGuest() => const _GuestCard(),
                AuthRestoring(:final error) => AppCard(
                  child: error == null
                      ? StateMessageView(kind: StateKind.loading, title: l10n.accountRestoring, compact: true)
                      : StateMessageView(
                          kind: AsyncStateView.kindForError(error),
                          compact: true,
                          onRetry: () => ref.read(authControllerProvider.notifier).restore(),
                        ),
                ),
              },
            ),
            SectionHeader(title: l10n.accountMyToolsSection),
            _Group(children: myTools),
            if (explore.isNotEmpty) ...[SectionHeader(title: l10n.accountExploreSection), _Group(children: explore)],
            SectionHeader(title: l10n.accountSettingsSection),
            _Group(
              children: [
                _NavTile(icon: Icons.settings_outlined, label: l10n.settingsTitle, location: AppRoutes.settings),
                if (on(Features.notifications) && signedIn)
                  _NavTile(
                    icon: Icons.tune,
                    label: l10n.notificationsPreferencesTitle,
                    location: AppRoutes.notificationPreferences,
                  ),
                if (signedIn) ...[
                  _NavTile(icon: Icons.badge_outlined, label: l10n.accountProfile, location: AppRoutes.profile),
                  _NavTile(icon: Icons.devices_outlined, label: l10n.accountSessions, location: AppRoutes.sessions),
                  if (on(Features.community))
                    _NavTile(
                      icon: Icons.person_off_outlined,
                      label: l10n.communityBlockedUsersTitle,
                      location: AppRoutes.blockedUsers,
                    ),
                  ListTile(
                    leading: const Icon(Icons.logout),
                    title: Text(l10n.accountLogout),
                    onTap: () => _confirmLogout(context, ref),
                  ),
                  ListTile(
                    leading: Icon(Icons.delete_forever_outlined, color: Theme.of(context).colorScheme.error),
                    title: Text(
                      l10n.accountDeleteAccount,
                      style: TextStyle(color: Theme.of(context).colorScheme.error),
                    ),
                    onTap: () => context.push(AppRoutes.deleteAccount),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final l10n = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: Text(l10n.accountLogoutConfirm),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(l10n.commonCancel)),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: Text(l10n.accountLogout)),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    // Reminder alerts on this phone belong to the account being signed out.
    await ref.read(reminderNotificationsProvider.notifier).cancelAll();
    await ref.read(authControllerProvider.notifier).logout();
    messenger.showSnackBar(SnackBar(content: Text(l10n.accountLoggedOut)));
  }
}

class _NavTile extends StatelessWidget {
  const _NavTile({required this.icon, required this.label, required this.location, this.subtitle, this.badge});

  final IconData icon;
  final String label;
  final String location;
  final String? subtitle;

  /// Unread count shown as a badge (also announced).
  final int? badge;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return ListTile(
      leading: badge == null ? Icon(icon) : Badge.count(count: badge!, child: Icon(icon)),
      title: Text(label),
      subtitle: switch ((subtitle, badge)) {
        (null, null) => null,
        (final s, final b) => Text([?s, if (b != null) l10n.accountUnreadCount(b)].join(' · ')),
      },
      trailing: const Icon(Icons.chevron_right),
      onTap: () => context.push(location),
    );
  }
}

/// Rounded group of tiles (settings-style).
class _Group extends StatelessWidget {
  const _Group({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    if (children.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: AppCard(
        padding: EdgeInsets.zero,
        clip: true,
        child: Column(
          children: [
            for (var i = 0; i < children.length; i++) ...[if (i > 0) const Divider(height: 1, indent: 56), children[i]],
          ],
        ),
      ),
    );
  }
}

class _GuestCard extends StatelessWidget {
  const _GuestCard();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.person_outline, color: theme.colorScheme.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Semantics(header: true, child: Text(l10n.accountGuestTitle, style: theme.textTheme.titleMedium)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(l10n.accountGuestMessage, style: theme.textTheme.bodyMedium),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton(
                onPressed: () => context.push(AppRoutes.login(from: AppRoutes.account)),
                child: Text(l10n.commonSignIn),
              ),
              OutlinedButton(
                onPressed: () => context.push(AppRoutes.register(from: AppRoutes.account)),
                child: Text(l10n.commonCreateAccount),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _UserCard extends StatelessWidget {
  const _UserCard({required this.user, required this.offline});

  final AppUser user;
  final bool offline;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final initial = user.displayName.trim().isEmpty ? '?' : user.displayName.trim().characters.first.toUpperCase();
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ExcludeSemantics(child: CircleAvatar(radius: 24, child: Text(initial))),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user.displayName, style: theme.textTheme.titleMedium),
                    Text(
                      user.email,
                      textDirection: TextDirection.ltr,
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (user.emailVerified)
            Row(
              children: [
                Icon(Icons.verified_outlined, size: 18, color: theme.colorScheme.primary),
                const SizedBox(width: 4),
                Expanded(child: Text(l10n.accountEmailVerified, style: theme.textTheme.labelMedium)),
              ],
            )
          else
            Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 4,
              children: [
                Icon(Icons.mark_email_unread_outlined, size: 18, color: theme.colorScheme.error),
                Text(l10n.accountEmailNotVerified, style: theme.textTheme.labelMedium),
                TextButton(
                  onPressed: () => context.push(AppRoutes.verifyEmail(email: user.email)),
                  child: Text(l10n.accountVerifyNow),
                ),
              ],
            ),
          if (offline) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(Icons.cloud_off_outlined, size: 18, color: theme.colorScheme.onSurfaceVariant),
                const SizedBox(width: 4),
                Expanded(child: Text(l10n.accountOfflineUser, style: theme.textTheme.bodySmall)),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
