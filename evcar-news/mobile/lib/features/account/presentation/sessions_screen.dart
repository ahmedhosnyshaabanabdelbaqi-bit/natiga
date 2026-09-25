import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/errors/app_errors.dart';
import '../../../core/formatting/formatters.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/app_card.dart';
import '../../../shared/widgets/async_state_view.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../auth/presentation/auth_gate.dart';
import '../data/account_repository.dart';
import '../domain/user_session.dart';

final userSessionsProvider = FutureProvider.autoDispose<List<UserSession>>(
  (ref) => ref.watch(accountRepositoryProvider).sessions(),
);

/// `/account/sessions` — signed-in devices with "end session".
class SessionsScreen extends StatelessWidget {
  const SessionsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.accountSessionsTitle)),
      body: AuthGate(returnTo: AppRoutes.sessions, builder: (context, user) => const _SessionsList()),
    );
  }
}

class _SessionsList extends ConsumerWidget {
  const _SessionsList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final sessions = ref.watch(userSessionsProvider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(userSessionsProvider.future),
      child: AsyncStateView<List<UserSession>>(
        value: sessions,
        isEmpty: (s) => s.isEmpty,
        emptyTitle: l10n.accountSessionsEmpty,
        onRetry: () => ref.invalidate(userSessionsProvider),
        builder: (context, items) => ListView.separated(
          key: const PageStorageKey('sessions-list'),
          padding: const EdgeInsets.all(16),
          itemCount: items.length,
          separatorBuilder: (_, _) => const SizedBox(height: 12),
          itemBuilder: (context, i) => _SessionCard(session: items[i]),
        ),
      ),
    );
  }
}

class _SessionCard extends ConsumerStatefulWidget {
  const _SessionCard({required this.session});

  final UserSession session;

  @override
  ConsumerState<_SessionCard> createState() => _SessionCardState();
}

class _SessionCardState extends ConsumerState<_SessionCard> {
  bool _busy = false;

  Future<void> _revoke() async {
    final l10n = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: Text(l10n.accountSessionRevokeConfirm),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(l10n.commonCancel)),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: Text(l10n.accountSessionRevoke)),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(accountRepositoryProvider).revokeSession(widget.session.id);
      messenger.showSnackBar(SnackBar(content: Text(l10n.accountSessionRevoked)));
      if (widget.session.current) {
        // This device's session is gone: finish signing out locally.
        await ref.read(authControllerProvider.notifier).logout();
      } else {
        ref.invalidate(userSessionsProvider);
      }
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(errorMessage(l10n, e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final s = widget.session;
    final name = (s.deviceName?.trim().isNotEmpty ?? false)
        ? s.deviceName!
        : (s.userAgent?.trim().isNotEmpty ?? false)
        ? s.userAgent!
        : l10n.accountSessionUnknownDevice;
    final lastUsed = fmt.dateTime(s.lastUsedAt);
    final created = fmt.dateTime(s.createdAt);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(s.clientType == 'web' ? Icons.laptop_outlined : Icons.phone_iphone_outlined),
              const SizedBox(width: 8),
              Expanded(child: Text(name, style: theme.textTheme.titleSmall)),
              if (s.current)
                Chip(
                  avatar: const Icon(Icons.check_circle_outline, size: 18),
                  label: Text(l10n.accountSessionThisDevice),
                ),
            ],
          ),
          const SizedBox(height: 8),
          if (lastUsed != null) Text(l10n.accountSessionLastUsed(lastUsed), style: muted),
          if (created != null) Text(l10n.accountSessionCreated(created), style: muted),
          if (s.ip != null) Text(l10n.accountSessionIp(s.ip!), style: muted, textDirection: TextDirection.ltr),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: TextButton.icon(
              onPressed: _busy ? null : _revoke,
              icon: const Icon(Icons.logout),
              label: Text(l10n.accountSessionRevoke),
            ),
          ),
        ],
      ),
    );
  }
}
