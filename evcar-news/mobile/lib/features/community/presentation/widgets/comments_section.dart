import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/app_config/app_config_controller.dart';
import '../../../../core/app_config/features.dart';
import '../../../../shared/widgets/kit.dart';
import '../../application/community_providers.dart';
import '../../domain/community_models.dart';
import 'community_actions.dart';
import 'community_composer.dart';
import 'community_ui.dart';

/// Comments of any target — **the reusable widget other features embed**.
///
/// ```dart
/// // Inside any scroll view (it is a non-scrolling Column):
/// CommentsSection(targetType: CommunityTargetTypes.article, targetId: article.id,
///     allowComments: article.allowComments)
///
/// // Short preview on a detail page + link to the full page:
/// CommentsSection(targetType: 'variant', targetId: variant.id, previewCount: 3,
///     onViewAll: () => context.push(AppRoutes.articleComments(slug)))
/// ```
///
/// `targetType` ∈ `article | review | model | variant` (server contract). It
/// renders nothing when the `community` feature flag is off. Reading is public;
/// posting, replying, voting, reporting and blocking ask guests to sign in and
/// explain e-mail verification / moderator blocks. The author's own held posts
/// appear with their moderation state; nobody else sees them.
class CommentsSection extends ConsumerStatefulWidget {
  const CommentsSection({
    super.key,
    required this.targetType,
    required this.targetId,
    this.allowComments = true,
    this.previewCount,
    this.onViewAll,
    this.showHeader = true,
    this.padding = const EdgeInsets.symmetric(horizontal: AppSpacing.gutter),
  });

  final String targetType;
  final String targetId;

  /// False when the target closed its comments (e.g. article `allowComments`).
  final bool allowComments;

  /// Show only the first N threads (no paging) + "View all comments".
  final int? previewCount;
  final VoidCallback? onViewAll;
  final bool showHeader;
  final EdgeInsetsGeometry padding;

  @override
  ConsumerState<CommentsSection> createState() => _CommentsSectionState();
}

class _CommentsSectionState extends ConsumerState<CommentsSection> {
  CommentSort _sort = CommentSort.newest;

  /// Thread whose inline reply box is open.
  Comment? _replyTo;

  /// Threads whose replies are being loaded.
  final _loadingReplies = <String>{};

  CommentThreadKey get _key => CommentThreadKey(CommentTarget(widget.targetType, widget.targetId), _sort);

  CommentsController get _ctrl => ref.read(commentsControllerProvider(_key).notifier);

  bool get _preview => widget.previewCount != null;

  Future<void> _post(String text, {Comment? parent}) async {
    final created = await _ctrl.post(text, parentId: parent?.id);
    if (!mounted) return;
    setState(() => _replyTo = null);
    final l10n = context.l10n;
    if (created.status == ModerationStatus.pending) {
      showAppSnackBar(context, l10n.communityPostedPending, icon: Icons.hourglass_top_rounded, tone: AppTone.warning);
    } else {
      showAppSnackBar(
        context,
        parent == null ? l10n.communityCommentPosted : l10n.communityReplyPosted,
        icon: Icons.check,
      );
    }
  }

  Future<void> _vote(Comment c, int value) => voteOn<Comment>(
    context,
    ref,
    post: c,
    value: value,
    withVotes: (p, v) => p.copyWith(votes: v),
    apply: (updated) => _ctrl.upsert(updated),
  );

  void _edit(Comment c) {
    final l10n = context.l10n;
    showEditTextSheet(
      context,
      title: l10n.communityEditComment,
      initial: c.body,
      minLength: 1,
      maxLength: 2000,
      save: (text) => _ctrl.edit(c, text),
    );
  }

  Future<void> _delete(Comment c) =>
      confirmAndDelete(context, title: context.l10n.communityDeleteCommentTitle, run: () => _ctrl.delete(c));

  Future<void> _loadReplies(Comment root) async {
    setState(() => _loadingReplies.add(root.id));
    try {
      await _ctrl.loadAllReplies(root.id);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, communityErrorMessage(context.l10n, e), tone: AppTone.danger);
    } finally {
      if (mounted) setState(() => _loadingReplies.remove(root.id));
    }
  }

  void _startReply(Comment root) {
    if (ref.read(communityViewerIdProvider) == null) {
      promptSignIn(context, message: context.l10n.communitySignInToComment);
      return;
    }
    setState(() => _replyTo = root);
  }

  @override
  Widget build(BuildContext context) {
    if (!ref.watch(featureFlagProvider(Features.community))) return const SizedBox.shrink();
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final value = ref.watch(commentsControllerProvider(_key));
    final muted = ref.watch(locallyMutedUsersProvider);
    final total = value.value?.total;
    final fmt = AppFormatters.of(context);

    final header = widget.showHeader
        ? Padding(
            padding: const EdgeInsets.only(top: AppSpacing.lg, bottom: AppSpacing.sm),
            child: Row(
              children: [
                Icon(Icons.forum_outlined, color: theme.colorScheme.primary),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Text(
                      total == null
                          ? l10n.communityCommentsTitle
                          : l10n.communityCommentsWithCount(fmt.number(total) ?? '$total'),
                      style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ],
            ),
          )
        : const SizedBox.shrink();

    final composer = widget.allowComments
        ? CommunityPostingGate(
            guestMessage: l10n.communitySignInToComment,
            builder: (context, _) => CommunityComposer(
              key: ValueKey('composer-${widget.targetId}'),
              hint: l10n.communityCommentHint,
              maxLength: 2000,
              onSubmit: (text) => _post(text),
            ),
          )
        : _ClosedNotice(message: l10n.communityCommentsClosed);

    final sortBar = (value.value?.items.length ?? 0) > 1 && !_preview
        ? Padding(
            padding: const EdgeInsets.only(top: AppSpacing.md),
            child: ChoicePills<CommentSort>(
              options: {
                CommentSort.newest: l10n.communitySortNewest,
                CommentSort.top: l10n.communitySortTop,
                CommentSort.oldest: l10n.communitySortOldest,
              },
              selected: _sort,
              onSelected: (s) => setState(() {
                _sort = s;
                _replyTo = null;
              }),
            ),
          )
        : const SizedBox.shrink();

    final body = AsyncStateView<PagedList<Comment>>(
      value: value,
      compact: true,
      onRetry: () => ref.invalidate(commentsControllerProvider(_key)),
      isEmpty: (list) => list.items.where((c) => !muted.contains(c.author.id)).isEmpty,
      emptyIcon: Icons.chat_bubble_outline,
      emptyTitle: l10n.communityNoCommentsTitle,
      emptyMessage: widget.allowComments ? l10n.communityNoCommentsMessage : l10n.communityCommentsClosed,
      loading: const Skeleton(
        child: SkeletonList(
          item: ListTileSkeleton(),
          count: 3,
          padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
        ),
      ),
      builder: (context, list) {
        final visible = list.items.where((c) => !muted.contains(c.author.id)).toList();
        final shown = _preview ? visible.take(widget.previewCount!).toList() : visible;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final c in shown) ...[
              const SizedBox(height: AppSpacing.md),
              _CommentThread(
                comment: c,
                muted: muted,
                loadingReplies: _loadingReplies.contains(c.id),
                replyOpen: _replyTo?.id == c.id,
                canReply: widget.allowComments,
                onReply: () => _startReply(c),
                onCancelReply: () => setState(() => _replyTo = null),
                onSubmitReply: (text) => _post(text, parent: c),
                onLoadReplies: () => _loadReplies(c),
                onVote: _vote,
                onEdit: _edit,
                onDelete: _delete,
                onReport: (x) =>
                    showReportSheet(context, ref, targetType: CommunityTargetTypes.comment, targetId: x.id),
                onMute: (x) => confirmAndMute(context, ref, x.author),
              ),
            ],
            if (_preview && (visible.length > shown.length || list.hasMore) && widget.onViewAll != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.md),
                child: SecondaryButton(
                  label: l10n.communityViewAllComments,
                  icon: Icons.forum_outlined,
                  onPressed: widget.onViewAll,
                ),
              ),
            if (!_preview)
              LoadMoreFooter(
                hasMore: list.hasMore,
                loading: list.loadingMore,
                error: list.loadMoreError,
                onLoadMore: () => _ctrl.loadMore(),
                label: l10n.communityLoadMoreComments,
              ),
          ],
        );
      },
    );

    return Padding(
      padding: widget.padding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [header, composer, sortBar, body],
      ),
    );
  }
}

class _ClosedNotice extends StatelessWidget {
  const _ClosedNotice({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(Icons.lock_outline, size: 18, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(message, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        ),
      ],
    );
  }
}

class _CommentThread extends StatelessWidget {
  const _CommentThread({
    required this.comment,
    required this.muted,
    required this.loadingReplies,
    required this.replyOpen,
    required this.canReply,
    required this.onReply,
    required this.onCancelReply,
    required this.onSubmitReply,
    required this.onLoadReplies,
    required this.onVote,
    required this.onEdit,
    required this.onDelete,
    required this.onReport,
    required this.onMute,
  });

  final Comment comment;
  final Set<String> muted;
  final bool loadingReplies;
  final bool replyOpen;
  final bool canReply;
  final VoidCallback onReply;
  final VoidCallback onCancelReply;
  final Future<void> Function(String text) onSubmitReply;
  final VoidCallback onLoadReplies;
  final Future<void> Function(Comment c, int value) onVote;
  final void Function(Comment c) onEdit;
  final Future<void> Function(Comment c) onDelete;
  final void Function(Comment c) onReport;
  final void Function(Comment c) onMute;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final replies = comment.replies.where((r) => !muted.contains(r.author.id)).toList();
    final more = comment.replyCount - comment.replies.length;
    return AppCard(
      padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.lg, AppSpacing.md, AppSpacing.xs, AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          CommentTile(
            comment: comment,
            onVote: (v) => onVote(comment, v),
            onReply: canReply ? onReply : null,
            onEdit: () => onEdit(comment),
            onDelete: () => onDelete(comment),
            onReport: () => onReport(comment),
            onMute: () => onMute(comment),
          ),
          if (replies.isNotEmpty || more > 0)
            Container(
              margin: const EdgeInsetsDirectional.only(start: AppSpacing.lg, top: AppSpacing.xs),
              padding: const EdgeInsetsDirectional.only(start: AppSpacing.md),
              decoration: BoxDecoration(
                border: BorderDirectional(start: BorderSide(color: theme.colorScheme.outlineVariant, width: 2)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final r in replies) ...[
                    const SizedBox(height: AppSpacing.sm),
                    CommentTile(
                      comment: r,
                      compact: true,
                      onVote: (v) => onVote(r, v),
                      onEdit: () => onEdit(r),
                      onDelete: () => onDelete(r),
                      onReport: () => onReport(r),
                      onMute: () => onMute(r),
                    ),
                  ],
                  if (more > 0)
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: loadingReplies
                          ? const Padding(
                              padding: EdgeInsets.all(AppSpacing.md),
                              child: SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)),
                            )
                          : TextButton.icon(
                              style: TextButton.styleFrom(minimumSize: const Size(kMinTouchTarget, kMinTouchTarget)),
                              onPressed: onLoadReplies,
                              icon: const Icon(Icons.subdirectory_arrow_right),
                              label: Text(l10n.communityViewMoreReplies(more)),
                            ),
                    ),
                ],
              ),
            ),
          if (replyOpen)
            Padding(
              padding: const EdgeInsetsDirectional.only(start: AppSpacing.lg, end: AppSpacing.md, top: AppSpacing.sm),
              child: CommunityPostingGate(
                builder: (context, _) => CommunityComposer(
                  hint: l10n.communityReplyHint,
                  autofocus: true,
                  replyingTo: comment.author.isDeleted ? l10n.communityDeletedUser : comment.author.displayName,
                  onCancelReply: onCancelReply,
                  onSubmit: onSubmitReply,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// One comment (or reply): header, moderation state, body, votes, reply.
class CommentTile extends StatelessWidget {
  const CommentTile({
    super.key,
    required this.comment,
    required this.onVote,
    this.onReply,
    this.onEdit,
    this.onDelete,
    this.onReport,
    this.onMute,
    this.compact = false,
  });

  final Comment comment;
  final ValueChanged<int> onVote;
  final VoidCallback? onReply;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;
  final VoidCallback? onReport;
  final VoidCallback? onMute;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = comment;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PostHeader(
          author: c.author,
          createdAt: c.createdAt,
          editedAt: c.editedAt,
          isMine: c.isMine,
          avatarSize: compact ? 32 : 40,
          trailing: PostActionsMenu(
            isMine: c.isMine,
            onEdit: c.status == ModerationStatus.hidden ? null : onEdit,
            onDelete: onDelete,
            onReport: c.status.isPublic ? onReport : null,
            onMute: c.author.id == null ? null : onMute,
          ),
        ),
        if (!c.status.isPublic) ...[const SizedBox(height: AppSpacing.sm), ModerationNotice(status: c.status)],
        Padding(
          padding: EdgeInsetsDirectional.only(
            start: (compact ? 32 : 40) + AppSpacing.md,
            top: AppSpacing.xs,
            end: AppSpacing.md,
          ),
          child: ExpandableBody(text: c.body),
        ),
        Padding(
          padding: EdgeInsetsDirectional.only(start: (compact ? 32 : 40) + AppSpacing.xs),
          child: Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              HelpfulVoteBar(votes: c.votes, isMine: c.isMine, enabled: c.status.isPublic, onVote: onVote),
              if (onReply != null && c.status.isPublic)
                TextButton.icon(
                  style: TextButton.styleFrom(minimumSize: const Size(kMinTouchTarget, kMinTouchTarget)),
                  onPressed: onReply,
                  icon: const Icon(Icons.reply, size: 18),
                  label: Text(l10n.communityReply),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
