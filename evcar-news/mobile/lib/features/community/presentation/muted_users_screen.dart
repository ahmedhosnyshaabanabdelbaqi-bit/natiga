import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/kit.dart';
import '../../auth/presentation/auth_gate.dart';
import '../application/community_providers.dart';
import '../data/community_repository.dart';
import '../domain/community_models.dart';
import 'widgets/community_actions.dart';
import 'widgets/community_ui.dart';

/// "Blocked users" — people whose community content I hid (`GET /me/mutes`),
/// with unblock. Not routed yet: the account area can push it, e.g.
/// `Navigator.of(context).push(MaterialPageRoute(builder: (_) => const MutedUsersScreen()))`
/// or register a route for it (see docs/decisions/mobile-community.md).
class MutedUsersScreen extends StatelessWidget {
  const MutedUsersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.communityBlockedUsersTitle)),
      body: AuthGate(returnTo: currentLocation(context), builder: (context, _) => const MutedUsersView()),
    );
  }
}

/// Body of [MutedUsersScreen] (embeddable).
class MutedUsersView extends ConsumerWidget {
  const MutedUsersView({super.key});

  Future<void> _unmute(BuildContext context, WidgetRef ref, MutedUser u) async {
    final l10n = context.l10n;
    try {
      await ref.read(communityRepositoryProvider).unmute(u.userId);
      ref.read(locallyMutedUsersProvider.notifier).remove(u.userId);
      invalidateCommunityLists(ref);
      if (context.mounted) showAppSnackBar(context, l10n.communityUnblocked(u.displayName), icon: Icons.check);
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, communityErrorMessage(l10n, e), tone: AppTone.danger);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final value = ref.watch(mutedUsersProvider);
    return RefreshIndicator.adaptive(
      onRefresh: () async => ref.invalidate(mutedUsersProvider),
      child: AsyncStateView<List<MutedUser>>(
        value: value,
        onRetry: () => ref.invalidate(mutedUsersProvider),
        isEmpty: (l) => l.isEmpty,
        emptyIcon: Icons.person_off_outlined,
        emptyTitle: l10n.communityNoBlockedTitle,
        emptyMessage: l10n.communityNoBlockedMessage,
        loading: const Skeleton(child: SkeletonList(item: ListTileSkeleton())),
        builder: (context, users) => ListView(
          padding: const EdgeInsets.all(AppSpacing.gutter),
          children: [
            Text(l10n.communityBlockedUsersIntro, style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: AppSpacing.md),
            for (final u in users)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: AppCard(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
                  child: Row(
                    children: [
                      AuthorAvatar(
                        author: CommunityAuthor(id: u.userId, displayName: u.displayName),
                      ),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(child: Text(u.displayName, style: Theme.of(context).textTheme.titleSmall)),
                      SecondaryButton(label: l10n.communityUnblock, onPressed: () => _unmute(context, ref, u)),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
