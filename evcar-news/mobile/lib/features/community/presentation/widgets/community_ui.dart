import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/api/api_exception.dart';
import '../../../../core/errors/app_errors.dart';
import '../../../../shared/widgets/kit.dart';
import '../../domain/community_models.dart';

// Small building blocks shared by every community screen and by the embeddable
// `CommentsSection`.

/// User-facing message for a failed community request. Server messages are
/// already localized; a few codes get app wording with more guidance.
String communityErrorMessage(AppLocalizations l10n, Object error) {
  if (error is ApiException) {
    switch (error.code) {
      case 'EMAIL_NOT_VERIFIED':
        return l10n.communityErrEmailNotVerified;
      case 'COMMUNITY_RATE_LIMITED':
        final details = error.details;
        final seconds = details is Map ? details['retryAfterSeconds'] : null;
        if (seconds is num && seconds > 0) {
          return l10n.communityErrRateLimitedMinutes((seconds / 60).ceil());
        }
        return l10n.communityErrRateLimited;
      case 'COMMUNITY_REPORT_DUPLICATE':
        return l10n.communityErrReportDuplicate;
      case 'COMMUNITY_SELF_VOTE':
        return l10n.communityErrSelfVote;
      case 'COMMUNITY_SELF_REPORT':
        return l10n.communityErrSelfReport;
      case 'COMMUNITY_COMMENTS_CLOSED':
        return l10n.communityCommentsClosed;
    }
    if (error.kind == ApiErrorKind.unauthorized) return l10n.communityErrSignInAgain;
    if (error.kind == ApiErrorKind.validation && error.fieldErrors.isNotEmpty) {
      return [for (final f in error.fieldErrors) ...f.messages].join('\n');
    }
  }
  return errorMessage(l10n, error);
}

/// Round avatar with the author's initials (no photos: none are collected).
class AuthorAvatar extends StatelessWidget {
  const AuthorAvatar({super.key, required this.author, this.size = 40});

  final CommunityAuthor author;
  final double size;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colors = context.palette.tone(author.isDeleted ? AppTone.neutral : AppTone.brand);
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: colors.container,
          border: Border.all(color: colors.border),
        ),
        child: author.isDeleted
            ? Icon(Icons.person_off_outlined, size: size * 0.5, color: scheme.onSurfaceVariant)
            : Text(
                author.initials,
                textScaler: TextScaler.noScaling,
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: size * 0.38, color: colors.onContainer),
              ),
      ),
    );
  }
}

/// "مالك موثّق / Verified owner" — shown only when the API says so.
class VerifiedOwnerBadge extends StatelessWidget {
  const VerifiedOwnerBadge({super.key, this.label, this.dense = true});

  /// Server label (already localized); falls back to the app string.
  final String? label;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Pill(
      label: label ?? l10n.communityVerifiedOwner,
      icon: Icons.verified_outlined,
      tone: AppTone.success,
      dense: dense,
      tooltip: l10n.communityVerifiedOwnerHint,
    );
  }
}

/// Author line of a post: avatar, name, time (+ "edited"), badges, menu.
class PostHeader extends StatelessWidget {
  const PostHeader({
    super.key,
    required this.author,
    required this.createdAt,
    this.editedAt,
    this.isMine = false,
    this.badges = const [],
    this.trailing,
    this.avatarSize = 40,
  });

  final CommunityAuthor author;
  final DateTime? createdAt;
  final DateTime? editedAt;
  final bool isMine;
  final List<Widget> badges;
  final Widget? trailing;
  final double avatarSize;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final time = friendlyTime(context, createdAt);
    final name = author.isDeleted
        ? l10n.communityDeletedUser
        : (author.displayName.isEmpty ? l10n.communityAnonymous : author.displayName);
    final meta = [?time, if (editedAt != null) l10n.communityEdited].join(' · ');
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AuthorAvatar(author: author, size: avatarSize),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.xs,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    name,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      fontStyle: author.isDeleted ? FontStyle.italic : null,
                      color: author.isDeleted ? theme.colorScheme.onSurfaceVariant : null,
                    ),
                  ),
                  if (isMine) Pill(label: l10n.communityYou, dense: true, tone: AppTone.info),
                  ...badges,
                ],
              ),
              if (meta.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(meta, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
              ],
            ],
          ),
        ),
        ?trailing,
      ],
    );
  }
}

/// Explains why the author sees a post that others do not (moderation).
///
/// Never shown for approved posts. Icon + text, never colour alone.
class ModerationNotice extends StatelessWidget {
  const ModerationNotice({super.key, required this.status, this.isReview = false});

  final ModerationStatus status;

  /// Reviews are always pre-moderated (different wording).
  final bool isReview;

  @override
  Widget build(BuildContext context) {
    if (status == ModerationStatus.approved) return const SizedBox.shrink();
    final l10n = context.l10n;
    final (tone, icon, title, message) = switch (status) {
      ModerationStatus.pending => (
        AppTone.warning,
        Icons.hourglass_top_rounded,
        l10n.communityStatusPending,
        isReview ? l10n.communityStatusPendingReviewHint : l10n.communityStatusPendingHint,
      ),
      ModerationStatus.hidden => (
        AppTone.neutral,
        Icons.visibility_off_outlined,
        l10n.communityStatusHidden,
        l10n.communityStatusHiddenHint,
      ),
      ModerationStatus.rejected => (
        AppTone.danger,
        Icons.block_outlined,
        l10n.communityStatusRejected,
        l10n.communityStatusRejectedHint,
      ),
      ModerationStatus.approved => (AppTone.neutral, Icons.check, '', ''),
    };
    final colors = context.palette.tone(tone);
    final theme = Theme.of(context);
    return Semantics(
      container: true,
      label: '$title. $message',
      child: ExcludeSemantics(
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: colors.container,
            borderRadius: const BorderRadius.all(Radius.circular(AppRadii.md)),
            border: Border.all(color: colors.border),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 20, color: colors.onContainer),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: colors.onContainer,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(message, style: theme.textTheme.bodySmall?.copyWith(color: colors.onContainer)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// "Helpful" up/down votes with counts. Guests are asked to sign in; authors
/// cannot vote on their own posts (explained, not just disabled).
class HelpfulVoteBar extends StatelessWidget {
  const HelpfulVoteBar({
    super.key,
    required this.votes,
    required this.onVote,
    this.isMine = false,
    this.enabled = true,
    this.showDown = true,
  });

  final Votes votes;

  /// Called with 1, -1 or 0 (remove my vote).
  final ValueChanged<int> onVote;
  final bool isMine;

  /// False for non-public posts (votes are only accepted on visible content).
  final bool enabled;
  final bool showDown;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final canVote = enabled && !isMine;
    final up = votes.myVote == 1;
    final down = votes.myVote == -1;
    return Wrap(
      spacing: AppSpacing.xs,
      runSpacing: AppSpacing.xs,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        _VoteButton(
          icon: up ? Icons.thumb_up : Icons.thumb_up_outlined,
          label: votes.up == 0
              ? l10n.communityHelpful
              : l10n.communityHelpfulCount(fmt.number(votes.up) ?? '${votes.up}'),
          semantics: l10n.communityVoteUpSemantics(votes.up),
          selected: up,
          tooltip: isMine ? l10n.communityErrSelfVote : l10n.communityHelpful,
          onPressed: canVote
              ? () {
                  HapticFeedback.selectionClick();
                  onVote(up ? 0 : 1);
                }
              : null,
        ),
        if (showDown)
          _VoteButton(
            icon: down ? Icons.thumb_down : Icons.thumb_down_outlined,
            label: votes.down == 0 ? null : (fmt.number(votes.down) ?? '${votes.down}'),
            semantics: l10n.communityVoteDownSemantics(votes.down),
            selected: down,
            tooltip: isMine ? l10n.communityErrSelfVote : l10n.communityNotHelpful,
            onPressed: canVote
                ? () {
                    HapticFeedback.selectionClick();
                    onVote(down ? 0 : -1);
                  }
                : null,
          ),
      ],
    );
  }
}

class _VoteButton extends StatelessWidget {
  const _VoteButton({
    required this.icon,
    required this.label,
    required this.semantics,
    required this.selected,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;

  /// Null → icon only (e.g. no "not helpful" votes yet; the count is spoken).
  final String? label;
  final String semantics;
  final bool selected;
  final String tooltip;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final fg = selected ? scheme.primary : scheme.onSurfaceVariant;
    return Semantics(
      button: true,
      toggled: selected,
      enabled: onPressed != null,
      label: semantics,
      excludeSemantics: true,
      child: Tooltip(
        message: tooltip,
        child: label == null
            ? IconButton(
                onPressed: onPressed,
                color: fg,
                style: IconButton.styleFrom(
                  minimumSize: const Size(kMinTouchTarget, kMinTouchTarget),
                  backgroundColor: selected ? scheme.primaryContainer.withValues(alpha: 0.5) : null,
                ),
                icon: Icon(icon, size: 18),
              )
            : TextButton.icon(
                onPressed: onPressed,
                style: TextButton.styleFrom(
                  minimumSize: const Size(kMinTouchTarget, kMinTouchTarget),
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                  foregroundColor: fg,
                  backgroundColor: selected ? scheme.primaryContainer.withValues(alpha: 0.5) : null,
                  shape: const StadiumBorder(),
                ),
                icon: Icon(icon, size: 18),
                label: Text(label!),
              ),
      ),
    );
  }
}

/// Actions of one post (overflow menu): edit/delete for the author,
/// report/block for others. Always a 48 dp target with a tooltip.
class PostActionsMenu extends StatelessWidget {
  const PostActionsMenu({super.key, required this.isMine, this.onEdit, this.onDelete, this.onReport, this.onMute});

  final bool isMine;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;
  final VoidCallback? onReport;

  /// Hide this author's content from me ("block user").
  final VoidCallback? onMute;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final entries = <(String, IconData, VoidCallback, bool)>[
      if (isMine && onEdit != null) (l10n.communityEdit, Icons.edit_outlined, onEdit!, false),
      if (isMine && onDelete != null) (l10n.communityDelete, Icons.delete_outline, onDelete!, true),
      if (!isMine && onReport != null) (l10n.communityReport, Icons.flag_outlined, onReport!, false),
      if (!isMine && onMute != null) (l10n.communityBlockUser, Icons.person_off_outlined, onMute!, true),
    ];
    if (entries.isEmpty) return const SizedBox.shrink();
    return PopupMenuButton<int>(
      tooltip: l10n.communityMoreActions,
      icon: const Icon(Icons.more_vert),
      onSelected: (i) => entries[i].$3(),
      itemBuilder: (context) => [
        for (var i = 0; i < entries.length; i++)
          PopupMenuItem<int>(
            value: i,
            child: Row(
              children: [
                Icon(entries[i].$2, color: entries[i].$4 ? Theme.of(context).colorScheme.error : null),
                const SizedBox(width: AppSpacing.md),
                Flexible(child: Text(entries[i].$1)),
              ],
            ),
          ),
      ],
    );
  }
}

/// Read-only stars (fractional values rounded to halves) with a spoken label.
class StarRatingDisplay extends StatelessWidget {
  const StarRatingDisplay({super.key, required this.rating, this.size = 18, this.color});

  final double rating;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final c = color ?? context.palette.tone(AppTone.warning).onContainer;
    final halves = (rating * 2).round();
    return Semantics(
      label: l10n.communityStarsSemantics(fmt.number(rating, maxDecimals: 1) ?? '$rating'),
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 1; i <= 5; i++)
            Icon(
              halves >= i * 2
                  ? Icons.star_rounded
                  : (halves == i * 2 - 1 ? Icons.star_half_rounded : Icons.star_outline_rounded),
              size: size,
              color: c,
            ),
        ],
      ),
    );
  }
}

/// Tappable 1..5 stars (each star is a 48 dp button with its own label).
class StarRatingInput extends StatelessWidget {
  const StarRatingInput({super.key, required this.value, required this.onChanged, this.label, this.size = 36});

  /// 0 = not rated yet.
  final int value;
  final ValueChanged<int> onChanged;

  /// What is being rated (announced with each star).
  final String? label;
  final double size;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = context.palette.tone(AppTone.warning).onContainer;
    return Wrap(
      children: [
        for (var i = 1; i <= 5; i++)
          Semantics(
            button: true,
            selected: value == i,
            label: [?label, l10n.communityStarOption(i)].join(', '),
            excludeSemantics: true,
            child: IconButton(
              constraints: const BoxConstraints(minWidth: kMinTouchTarget, minHeight: kMinTouchTarget),
              tooltip: l10n.communityStarOption(i),
              onPressed: () {
                HapticFeedback.selectionClick();
                onChanged(i);
              },
              icon: Icon(i <= value ? Icons.star_rounded : Icons.star_outline_rounded, size: size, color: c),
            ),
          ),
      ],
    );
  }
}

/// Body text of a post with "Show more" for long texts.
class ExpandableBody extends StatefulWidget {
  const ExpandableBody({super.key, required this.text, this.trimLines = 6, this.style});

  final String text;
  final int trimLines;
  final TextStyle? style;

  @override
  State<ExpandableBody> createState() => _ExpandableBodyState();
}

class _ExpandableBodyState extends State<ExpandableBody> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final style = widget.style ?? Theme.of(context).textTheme.bodyMedium;
    return LayoutBuilder(
      builder: (context, constraints) {
        final painter = TextPainter(
          text: TextSpan(text: widget.text, style: style),
          maxLines: widget.trimLines,
          textDirection: Directionality.of(context),
          textScaler: MediaQuery.textScalerOf(context),
        )..layout(maxWidth: constraints.maxWidth);
        final overflows = painter.didExceedMaxLines;
        painter.dispose();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AnimatedSize(
              duration: AppMotion.of(context, AppMotion.fast),
              alignment: AlignmentDirectional.topStart,
              child: Text(
                widget.text,
                style: style,
                maxLines: _expanded ? null : widget.trimLines,
                overflow: _expanded ? null : TextOverflow.fade,
              ),
            ),
            if (overflows || _expanded)
              TextButton(
                style: TextButton.styleFrom(
                  minimumSize: const Size(kMinTouchTarget, kMinTouchTarget),
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
                ),
                onPressed: () => setState(() => _expanded = !_expanded),
                child: Text(_expanded ? context.l10n.communityShowLess : context.l10n.communityShowMore),
              ),
          ],
        );
      },
    );
  }
}

/// "Load more" footer of a paged list (spinner / retry / nothing).
class LoadMoreFooter extends StatelessWidget {
  const LoadMoreFooter({
    super.key,
    required this.hasMore,
    required this.loading,
    required this.error,
    required this.onLoadMore,
    this.label,
  });

  final bool hasMore;
  final bool loading;
  final Object? error;
  final VoidCallback onLoadMore;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (loading) {
      return Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Center(
          child: Semantics(label: l10n.commonLoading, child: const CircularProgressIndicator.adaptive()),
        ),
      );
    }
    if (error != null) {
      return Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          children: [
            Text(communityErrorMessage(l10n, error!), textAlign: TextAlign.center),
            const SizedBox(height: AppSpacing.sm),
            SecondaryButton(label: l10n.commonRetry, icon: Icons.refresh, onPressed: onLoadMore),
          ],
        ),
      );
    }
    if (!hasMore) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Center(
        child: SecondaryButton(label: label ?? l10n.communityLoadMore, icon: Icons.expand_more, onPressed: onLoadMore),
      ),
    );
  }
}

/// Demo target notice: the car / article itself is demo data.
class DemoTargetNotice extends StatelessWidget {
  const DemoTargetNotice({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.xs,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        const DemoBadge(dense: true),
        Text(
          context.l10n.communityDemoTargetNotice,
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }
}
