import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../shared/widgets/kit.dart';
import '../../application/community_providers.dart';
import '../../data/community_repository.dart';
import '../../domain/community_models.dart';
import 'community_ui.dart';

// Actions shared by every community surface: vote, report, block (mute),
// edit/delete with confirmation, and the sign-in prompt for guests.

/// Current location, used as the return path after signing in.
String currentLocation(BuildContext context) {
  try {
    return GoRouterState.of(context).uri.toString();
  } on Object {
    return AppRoutes.home;
  }
}

/// Query parameter of the current route (null outside a router, e.g. tests).
String? routeQueryParam(BuildContext context, String key) {
  try {
    final v = GoRouterState.of(context).uri.queryParameters[key];
    return (v == null || v.isEmpty) ? null : v;
  } on Object {
    return null;
  }
}

/// Asks a guest to sign in (returns to the current page afterwards).
Future<void> promptSignIn(BuildContext context, {String? message}) async {
  final l10n = context.l10n;
  final go = await showConfirmSheet(
    context: context,
    title: l10n.commonSignInRequiredTitle,
    message: message ?? l10n.communitySignInToParticipate,
    confirmLabel: l10n.communitySignIn,
    icon: Icons.person_outline,
  );
  if (go && context.mounted) {
    await context.push(AppRoutes.login(from: currentLocation(context)));
  }
}

/// Votes on [post] with an optimistic update; rolls back and explains on failure.
///
/// [apply] replaces the post in whatever list/controller shows it.
Future<void> voteOn<T extends CommunityPost>(
  BuildContext context,
  WidgetRef ref, {
  required T post,
  required int value,
  required T Function(T post, Votes votes) withVotes,
  required void Function(T updated) apply,
}) async {
  if (ref.read(communityViewerIdProvider) == null) {
    await promptSignIn(context, message: context.l10n.communitySignInToVote);
    return;
  }
  final l10n = context.l10n;
  final before = post.votes;
  apply(withVotes(post, before.applying(value)));
  try {
    final server = await ref.read(communityRepositoryProvider).vote(post.voteType, post.id, value);
    apply(withVotes(post, server));
  } on Object catch (e) {
    apply(withVotes(post, before));
    if (context.mounted) showAppSnackBar(context, communityErrorMessage(l10n, e), tone: AppTone.danger);
  }
}

/// Report sheet: reasons from the server (localized), details when required.
Future<void> showReportSheet(
  BuildContext context,
  WidgetRef ref, {
  required String targetType,
  required String targetId,
}) async {
  if (ref.read(communityViewerIdProvider) == null) {
    await promptSignIn(context, message: context.l10n.communitySignInToReport);
    return;
  }
  final l10n = context.l10n;
  final sent = await showAppBottomSheet<bool>(
    context: context,
    title: targetType == CommunityTargetTypes.user ? l10n.communityReportUserTitle : l10n.communityReportTitle,
    builder: (_) => _ReportForm(targetType: targetType, targetId: targetId),
  );
  if (sent == true && context.mounted) {
    showAppSnackBar(context, l10n.communityReportSent, tone: AppTone.success, icon: Icons.check_circle_outline);
  }
}

class _ReportForm extends ConsumerStatefulWidget {
  const _ReportForm({required this.targetType, required this.targetId});

  final String targetType;
  final String targetId;

  @override
  ConsumerState<_ReportForm> createState() => _ReportFormState();
}

class _ReportFormState extends ConsumerState<_ReportForm> {
  String? _reason;
  final _details = TextEditingController();
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  Future<void> _submit(ReportReason reason) async {
    final l10n = context.l10n;
    final details = _details.text.trim();
    if (reason.requiresDetails && details.length < 3) {
      setState(() => _error = l10n.communityReportDetailsRequired);
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref
          .read(communityRepositoryProvider)
          .report(targetType: widget.targetType, targetId: widget.targetId, reason: reason.code, details: details);
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) {
        setState(() {
          _sending = false;
          _error = communityErrorMessage(l10n, e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final reasons = ref.watch(reportReasonsProvider);
    return AsyncStateView<List<ReportReason>>(
      value: reasons,
      compact: true,
      isEmpty: (r) => r.isEmpty,
      onRetry: () => ref.invalidate(reportReasonsProvider),
      loading: const Skeleton(child: SkeletonList(item: ListTileSkeleton(leadingSize: 24), count: 5)),
      builder: (context, list) {
        final selected = list.where((r) => r.code == _reason).firstOrNull;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l10n.communityReportIntro,
              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: AppSpacing.sm),
            RadioGroup<String>(
              groupValue: _reason,
              onChanged: (v) => setState(() {
                _reason = v;
                _error = null;
              }),
              child: Column(
                children: [
                  for (final r in list)
                    RadioListTile<String>(
                      value: r.code,
                      contentPadding: EdgeInsets.zero,
                      title: Text(r.label),
                      subtitle: r.description == null ? null : Text(r.description!),
                    ),
                ],
              ),
            ),
            if (selected != null) ...[
              const SizedBox(height: AppSpacing.sm),
              TextField(
                controller: _details,
                minLines: 2,
                maxLines: 5,
                maxLength: 1000,
                decoration: InputDecoration(
                  labelText: selected.requiresDetails
                      ? l10n.communityReportDetails
                      : l10n.communityReportDetailsOptional,
                  border: const OutlineInputBorder(),
                ),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Semantics(
                liveRegion: true,
                child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
              ),
            ],
            const SizedBox(height: AppSpacing.md),
            PrimaryButton(
              label: l10n.communityReportSend,
              icon: Icons.flag_outlined,
              expand: true,
              loading: _sending,
              onPressed: selected == null || _sending ? null : () => _submit(selected),
            ),
          ],
        );
      },
    );
  }
}

/// "Block this user": confirm, mute on the server, hide their content at once
/// (the lists are reloaded; the server excludes muted authors), undo in the snackbar.
Future<void> confirmAndMute(BuildContext context, WidgetRef ref, CommunityAuthor author) async {
  final userId = author.id;
  if (userId == null) return;
  if (ref.read(communityViewerIdProvider) == null) {
    await promptSignIn(context);
    return;
  }
  final l10n = context.l10n;
  final ok = await showConfirmSheet(
    context: context,
    title: l10n.communityBlockTitle(author.displayName),
    message: l10n.communityBlockMessage,
    confirmLabel: l10n.communityBlockConfirm,
    destructive: true,
    icon: Icons.person_off_outlined,
  );
  if (!ok || !context.mounted) return;
  final repo = ref.read(communityRepositoryProvider);
  try {
    await repo.mute(userId);
    ref.read(locallyMutedUsersProvider.notifier).add(userId);
    invalidateCommunityLists(ref);
    if (!context.mounted) return;
    showAppSnackBar(
      context,
      l10n.communityBlocked(author.displayName),
      icon: Icons.person_off_outlined,
      actionLabel: l10n.communityUndo,
      onAction: () async {
        try {
          await repo.unmute(userId);
          ref.read(locallyMutedUsersProvider.notifier).remove(userId);
          invalidateCommunityLists(ref);
        } on Object {
          // The user can unblock later from the blocked-users list.
        }
      },
    );
  } on Object catch (e) {
    if (context.mounted) showAppSnackBar(context, communityErrorMessage(l10n, e), tone: AppTone.danger);
  }
}

/// Confirms and runs a delete; shows the outcome.
Future<bool> confirmAndDelete(
  BuildContext context, {
  required String title,
  required Future<void> Function() run,
}) async {
  final l10n = context.l10n;
  final ok = await showConfirmSheet(
    context: context,
    title: title,
    message: l10n.communityDeleteMessage,
    confirmLabel: l10n.communityDelete,
    destructive: true,
    icon: Icons.delete_outline,
  );
  if (!ok || !context.mounted) return false;
  try {
    await run();
    if (context.mounted) showAppSnackBar(context, l10n.communityDeleted, icon: Icons.check);
    return true;
  } on Object catch (e) {
    if (context.mounted) showAppSnackBar(context, communityErrorMessage(l10n, e), tone: AppTone.danger);
    return false;
  }
}

/// Bottom sheet with one text field to edit a comment / answer.
Future<String?> showEditTextSheet(
  BuildContext context, {
  required String title,
  required String initial,
  required int minLength,
  required int maxLength,
  required Future<void> Function(String text) save,
}) {
  return showAppBottomSheet<String>(
    context: context,
    title: title,
    builder: (_) => _EditTextForm(initial: initial, minLength: minLength, maxLength: maxLength, save: save),
  );
}

class _EditTextForm extends StatefulWidget {
  const _EditTextForm({required this.initial, required this.minLength, required this.maxLength, required this.save});

  final String initial;
  final int minLength;
  final int maxLength;
  final Future<void> Function(String text) save;

  @override
  State<_EditTextForm> createState() => _EditTextFormState();
}

class _EditTextFormState extends State<_EditTextForm> {
  late final _text = TextEditingController(text: widget.initial);
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l10n = context.l10n;
    final value = _text.text.trim();
    if (value.length < widget.minLength) {
      setState(() => _error = l10n.communityTooShort(widget.minLength));
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.save(value);
      if (mounted) Navigator.of(context).pop(value);
    } on Object catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = communityErrorMessage(l10n, e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _text,
          autofocus: true,
          minLines: 3,
          maxLines: 10,
          maxLength: widget.maxLength,
          decoration: InputDecoration(border: const OutlineInputBorder(), errorText: _error),
        ),
        const SizedBox(height: AppSpacing.md),
        PrimaryButton(
          label: l10n.communitySave,
          icon: Icons.check,
          expand: true,
          loading: _saving,
          onPressed: _saving ? null : _submit,
        ),
      ],
    );
  }
}
