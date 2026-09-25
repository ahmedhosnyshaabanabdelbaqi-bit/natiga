import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../core/app_config/features.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/async_state_view.dart';
import '../../../shared/widgets/section_header.dart';
import '../../auth/domain/app_user.dart';
import '../../auth/domain/auth_state.dart';
import '../../auth/presentation/auth_controller.dart';

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
    final myTools = [
      if (on(Features.garage))
        _NavTile(icon: Icons.garage_outlined, label: l10n.garageTitle, location: AppRoutes.garage),
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
        _NavTile(icon: Icons.notifications_outlined, label: l10n.notificationsTitle, location: AppRoutes.notifications),
    ];
    final explore = [
      if (on(Features.calculators))
        _NavTile(icon: Icons.calculate_outlined, label: l10n.calculatorsTitle, location: AppRoutes.calculators),
      if (on(tripPlannerFeatureFlag))
        _NavTile(icon: Icons.route_outlined, label: l10n.tripsTitle, location: AppRoutes.trips),
      if (on(Features.encyclopedia))
        _NavTile(icon: Icons.menu_book_outlined, label: l10n.encyclopediaTitle, location: AppRoutes.encyclopedia),
      if (on(Features.servicesDirectory))
        _NavTile(icon: Icons.handyman_outlined, label: l10n.servicesDirectoryTitle, location: AppRoutes.services),
    ];

    return Scaffold(
      appBar: AppBar(title: Text(l10n.accountTitle)),
      body: ListView(
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
          ...myTools,
          if (explore.isNotEmpty) ...[SectionHeader(title: l10n.accountExploreSection), ...explore],
          SectionHeader(title: l10n.accountSettingsSection),
          _NavTile(icon: Icons.settings_outlined, label: l10n.settingsTitle, location: AppRoutes.settings),
          if (signedIn) ...[
            _NavTile(icon: Icons.badge_outlined, label: l10n.accountProfile, location: AppRoutes.profile),
            _NavTile(icon: Icons.devices_outlined, label: l10n.accountSessions, location: AppRoutes.sessions),
            ListTile(
              leading: const Icon(Icons.logout),
              title: Text(l10n.accountLogout),
              onTap: () => _confirmLogout(context, ref),
            ),
            ListTile(
              leading: Icon(Icons.delete_forever_outlined, color: Theme.of(context).colorScheme.error),
              title: Text(l10n.accountDeleteAccount, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              onTap: () => context.push(AppRoutes.deleteAccount),
            ),
          ],
        ],
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
    await ref.read(authControllerProvider.notifier).logout();
    messenger.showSnackBar(SnackBar(content: Text(l10n.accountLoggedOut)));
  }
}

class _NavTile extends StatelessWidget {
  const _NavTile({required this.icon, required this.label, required this.location});

  final IconData icon;
  final String label;
  final String location;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon),
      title: Text(label),
      trailing: Icon(Directionality.of(context) == TextDirection.rtl ? Icons.chevron_left : Icons.chevron_right),
      onTap: () => context.push(location),
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
                Text(l10n.accountEmailVerified, style: theme.textTheme.labelMedium),
              ],
            )
          else
            Row(
              children: [
                Icon(Icons.mark_email_unread_outlined, size: 18, color: theme.colorScheme.error),
                const SizedBox(width: 4),
                Expanded(child: Text(l10n.accountEmailNotVerified, style: theme.textTheme.labelMedium)),
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
