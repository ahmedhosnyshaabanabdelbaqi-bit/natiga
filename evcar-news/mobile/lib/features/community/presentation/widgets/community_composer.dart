import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../shared/widgets/kit.dart';
import '../../../auth/domain/auth_state.dart';
import '../../../auth/presentation/auth_controller.dart';
import '../../application/community_providers.dart';
import '../../domain/community_models.dart';
import 'community_actions.dart';
import 'community_ui.dart';

/// Decides whether the current user may post, and explains why not:
/// guest → sign in; e-mail not verified → verify; blocked by a moderator →
/// reason and end date; otherwise [builder] (with a note for new accounts,
/// whose posts are reviewed first and may not contain links).
class CommunityPostingGate extends ConsumerWidget {
  const CommunityPostingGate({super.key, required this.builder, this.guestMessage, this.compact = true});

  final Widget Function(BuildContext context, CommunityStatus status) builder;
  final String? guestMessage;

  /// Inline card (comments/answers) vs. full-page state (write review / ask).
  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final auth = ref.watch(authControllerProvider);
    if (auth is AuthRestoring) {
      return const Padding(
        padding: EdgeInsets.all(AppSpacing.lg),
        child: Center(child: CircularProgressIndicator.adaptive()),
      );
    }
    final user = auth.user;
    if (user == null) {
      return _GateCard(
        compact: compact,
        icon: Icons.forum_outlined,
        tone: AppTone.brand,
        title: l10n.communityJoinTitle,
        message: guestMessage ?? l10n.communitySignInToParticipate,
        actions: [
          PrimaryButton(
            label: l10n.communitySignIn,
            icon: Icons.login,
            onPressed: () => context.push(AppRoutes.login(from: currentLocation(context))),
          ),
          SecondaryButton(
            label: l10n.communityCreateAccount,
            onPressed: () => context.push(AppRoutes.register(from: currentLocation(context))),
          ),
        ],
      );
    }
    final status = ref.watch(communityStatusProvider);
    return status.when(
      skipLoadingOnRefresh: true,
      loading: () => const Padding(
        padding: EdgeInsets.all(AppSpacing.lg),
        child: Skeleton(child: SkeletonBox(height: 72, radius: AppRadii.lg)),
      ),
      error: (e, _) => _GateCard(
        compact: compact,
        icon: Icons.cloud_off_outlined,
        tone: AppTone.neutral,
        title: l10n.communityStatusUnknownTitle,
        message: communityErrorMessage(l10n, e),
        actions: [
          SecondaryButton(
            label: l10n.commonRetry,
            icon: Icons.refresh,
            onPressed: () => ref.invalidate(communityStatusProvider),
          ),
        ],
      ),
      data: (s) {
        if (s == null) return const SizedBox.shrink();
        if (!s.emailVerified) {
          return _GateCard(
            compact: compact,
            icon: Icons.mark_email_unread_outlined,
            tone: AppTone.warning,
            title: l10n.communityVerifyEmailTitle,
            message: l10n.communityVerifyEmailMessage(user.email),
            actions: [
              PrimaryButton(
                label: l10n.communityVerifyEmailAction,
                icon: Icons.mark_email_read_outlined,
                onPressed: () => context.push(AppRoutes.verifyEmail(email: user.email)),
              ),
              SecondaryButton(
                label: l10n.communityVerifiedAlready,
                onPressed: () async {
                  await ref.read(authControllerProvider.notifier).refreshUser();
                  ref.invalidate(communityStatusProvider);
                },
              ),
            ],
          );
        }
        final block = s.block;
        if (block != null || !s.canPost) {
          final fmt = AppFormatters.of(context);
          final until = block?.expiresAt == null ? null : fmt.dateTime(block!.expiresAt!.toLocal());
          return _GateCard(
            compact: compact,
            icon: Icons.gpp_maybe_outlined,
            tone: AppTone.danger,
            title: l10n.communityBlockedTitle,
            message: [
              until == null ? l10n.communityBlockedIndefinite : l10n.communityBlockedUntil(until),
              if (block?.reason != null && block!.reason!.trim().isNotEmpty) l10n.communityBlockedReason(block.reason!),
            ].join('\n'),
          );
        }
        final child = builder(context, s);
        if (!s.isNewAccount) return child;
        final note = _NewAccountNote(until: s.newAccountUntil);
        if (!compact) {
          // Full-page forms (scrolling bodies) get the note above them.
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 0), child: note),
              Expanded(child: child),
            ],
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            note,
            const SizedBox(height: AppSpacing.sm),
            child,
          ],
        );
      },
    );
  }
}

class _NewAccountNote extends StatelessWidget {
  const _NewAccountNote({this.until});

  final DateTime? until;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.palette.tone(AppTone.info);
    return Semantics(
      container: true,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: colors.container,
          borderRadius: const BorderRadius.all(Radius.circular(AppRadii.md)),
          border: Border.all(color: colors.border),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.info_outline, size: 20, color: colors.onContainer),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                context.l10n.communityNewAccountNote,
                style: theme.textTheme.bodySmall?.copyWith(color: colors.onContainer),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GateCard extends StatelessWidget {
  const _GateCard({
    required this.icon,
    required this.tone,
    required this.title,
    required this.message,
    this.actions = const [],
    this.compact = true,
  });

  final IconData icon;
  final AppTone tone;
  final String title;
  final String message;
  final List<Widget> actions;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.palette.tone(tone);
    final content = Column(
      crossAxisAlignment: compact ? CrossAxisAlignment.start : CrossAxisAlignment.center,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisSize: compact ? MainAxisSize.max : MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(shape: BoxShape.circle, color: colors.container),
              child: Icon(icon, color: colors.onContainer, size: 22),
            ),
            const SizedBox(width: AppSpacing.md),
            Flexible(
              child: Semantics(
                header: true,
                child: Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          message,
          textAlign: compact ? TextAlign.start : TextAlign.center,
          style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        if (actions.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.sm, children: actions),
        ],
      ],
    );
    final card = AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Semantics(liveRegion: true, container: true, child: content),
    );
    if (compact) return card;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 480), child: card),
      ),
    );
  }
}

/// Multi-line text box with a send button (comments, replies, answers).
///
/// Validates length locally, then calls [onSubmit]; on failure the server's
/// message stays under the field and the text is kept.
class CommunityComposer extends StatefulWidget {
  const CommunityComposer({
    super.key,
    required this.hint,
    required this.onSubmit,
    this.minLength = 1,
    this.maxLength = 2000,
    this.replyingTo,
    this.onCancelReply,
    this.autofocus = false,
    this.submitLabel,
  });

  final String hint;

  /// Posts the text; throw to keep it and show the error.
  final Future<void> Function(String text) onSubmit;
  final int minLength;
  final int maxLength;

  /// Name shown in "Replying to …" with a cancel button.
  final String? replyingTo;
  final VoidCallback? onCancelReply;
  final bool autofocus;
  final String? submitLabel;

  @override
  State<CommunityComposer> createState() => CommunityComposerState();
}

class CommunityComposerState extends State<CommunityComposer> {
  final _text = TextEditingController();
  final _focus = FocusNode();
  bool _sending = false;
  String? _error;

  /// Focuses the field (e.g. after tapping "Reply").
  void focus() => _focus.requestFocus();

  @override
  void dispose() {
    _text.dispose();
    _focus.dispose();
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
      _sending = true;
      _error = null;
    });
    try {
      await widget.onSubmit(value);
      if (!mounted) return;
      _text.clear();
      _focus.unfocus();
      setState(() => _sending = false);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = communityErrorMessage(l10n, e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.replyingTo != null)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.xs),
            child: Row(
              children: [
                Icon(Icons.reply, size: 18, color: theme.colorScheme.primary),
                const SizedBox(width: AppSpacing.xs),
                Expanded(
                  child: Text(
                    l10n.communityReplyingTo(widget.replyingTo!),
                    style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary),
                  ),
                ),
                IconButton(
                  tooltip: l10n.communityCancelReply,
                  onPressed: widget.onCancelReply,
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
        TextField(
          controller: _text,
          focusNode: _focus,
          autofocus: widget.autofocus,
          minLines: 1,
          maxLines: 6,
          maxLength: widget.maxLength,
          textInputAction: TextInputAction.newline,
          keyboardType: TextInputType.multiline,
          enabled: !_sending,
          decoration: InputDecoration(
            hintText: widget.hint,
            labelText: widget.hint,
            floatingLabelBehavior: FloatingLabelBehavior.never,
            errorText: _error,
            errorMaxLines: 4,
            border: const OutlineInputBorder(borderRadius: AppRadii.control),
          ),
        ),
        Align(
          alignment: AlignmentDirectional.centerEnd,
          child: PrimaryButton(
            label: widget.submitLabel ?? l10n.communitySend,
            icon: Icons.send_rounded,
            loading: _sending,
            onPressed: _sending ? null : _submit,
          ),
        ),
      ],
    );
  }
}
