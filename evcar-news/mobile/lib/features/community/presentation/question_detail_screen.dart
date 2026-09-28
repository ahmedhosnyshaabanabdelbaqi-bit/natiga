import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/kit.dart';
import '../application/community_providers.dart';
import '../data/community_repository.dart';
import '../domain/community_models.dart';
import 'widgets/community_actions.dart';
import 'widgets/community_composer.dart';
import 'widgets/community_ui.dart';

/// One question with its answers (`/questions/:id`).
///
/// The accepted answer (chosen by the asker) is pinned first with a label
/// (icon + text). A question that is not public — removed, or held for
/// review and not mine — is a calm "not available" state, never an error page.
class QuestionDetailScreen extends ConsumerWidget {
  const QuestionDetailScreen({super.key, required this.questionId});

  /// Question id.
  final String questionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final value = ref.watch(questionThreadProvider(questionId));
    final error = value.error;
    if (error is ApiException && error.kind == ApiErrorKind.notFound && !value.hasValue) {
      return AppScaffold(
        title: l10n.communityQuestionTitle,
        body: EmptyState(
          icon: Icons.help_outline,
          title: l10n.communityQuestionUnavailableTitle,
          message: l10n.communityQuestionUnavailableMessage,
        ),
      );
    }
    return AppScaffold.slivers(
      title: l10n.communityQuestionTitle,
      onRefresh: () async {
        ref.invalidate(questionThreadProvider(questionId));
        await ref.read(questionThreadProvider(questionId).future).then((_) {}, onError: (_) {});
      },
      slivers: [
        SliverResponsivePadding(
          maxWidth: kMaxReadableWidth,
          sliver: SliverAsyncStateView<QuestionThread>(
            value: value,
            onRetry: () => ref.invalidate(questionThreadProvider(questionId)),
            loading: const Skeleton(child: SkeletonList(item: ListTileSkeleton(), count: 4)),
            builder: (context, thread) => _ThreadBody(questionId: questionId, thread: thread),
          ),
        ),
      ],
    );
  }
}

class _ThreadBody extends ConsumerWidget {
  const _ThreadBody({required this.questionId, required this.thread});

  final String questionId;
  final QuestionThread thread;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final ctrl = ref.read(questionThreadProvider(questionId).notifier);
    final q = thread.question;
    final muted = ref.watch(locallyMutedUsersProvider);
    final answers = thread.answers.items.where((a) => !muted.contains(a.author.id)).toList()
      ..sort((a, b) => (b.isAccepted ? 1 : 0) - (a.isAccepted ? 1 : 0));
    final fmt = AppFormatters.of(context);

    return SliverList.list(
      children: [
        const SizedBox(height: AppSpacing.md),
        _QuestionCard(
          question: q,
          onVote: (v) => voteOn<Question>(
            context,
            ref,
            post: q,
            value: v,
            withVotes: (p, votes) => p.copyWith(votes: votes),
            apply: ctrl.replaceQuestion,
          ),
          onEdit: () => _editQuestion(context, ctrl, q),
          onDelete: () async {
            final ok = await confirmAndDelete(
              context,
              title: l10n.communityDeleteQuestionTitle,
              run: () => ref.read(communityRepositoryProvider).deleteQuestion(q.id),
            );
            if (ok && context.mounted) {
              ref.invalidate(questionsControllerProvider);
              context.canPop() ? context.pop() : context.go(AppRoutes.questions());
            }
          },
          onReport: () => showReportSheet(context, ref, targetType: CommunityTargetTypes.question, targetId: q.id),
          onMute: () => confirmAndMute(context, ref, q.author),
        ),
        const SizedBox(height: AppSpacing.xl),
        Semantics(
          header: true,
          child: Text(
            thread.answers.total == null
                ? l10n.communityAnswersTitle
                : l10n.communityAnswersWithCount(fmt.number(thread.answers.total) ?? '${thread.answers.total}'),
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
        if (answers.isEmpty)
          EmptyState(
            compact: true,
            icon: Icons.question_answer_outlined,
            title: l10n.communityNoAnswersTitle,
            message: q.isMine ? l10n.communityNoAnswersMineMessage : l10n.communityNoAnswersMessage,
          ),
        for (final a in answers)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.md),
            child: _AnswerCard(
              answer: a,
              canAccept: q.isMine && q.status.isPublic && a.status.isPublic,
              onAccept: () => _accept(context, ctrl, a.isAccepted ? null : a.id),
              onVote: (v) => voteOn<Answer>(
                context,
                ref,
                post: a,
                value: v,
                withVotes: (p, votes) => p.copyWith(votes: votes),
                apply: ctrl.replaceAnswer,
              ),
              onEdit: () => showEditTextSheet(
                context,
                title: l10n.communityEditAnswer,
                initial: a.body,
                minLength: 2,
                maxLength: 5000,
                save: (text) => ctrl.editAnswer(a, text),
              ),
              onDelete: () =>
                  confirmAndDelete(context, title: l10n.communityDeleteAnswerTitle, run: () => ctrl.deleteAnswer(a)),
              onReport: () => showReportSheet(context, ref, targetType: CommunityTargetTypes.answer, targetId: a.id),
              onMute: () => confirmAndMute(context, ref, a.author),
            ),
          ),
        LoadMoreFooter(
          hasMore: thread.answers.hasMore,
          loading: thread.answers.loadingMore,
          error: thread.answers.loadMoreError,
          onLoadMore: ctrl.loadMoreAnswers,
          label: l10n.communityLoadMoreAnswers,
        ),
        const SizedBox(height: AppSpacing.xl),
        if (q.status.isPublic)
          Semantics(
            header: true,
            child: Text(
              l10n.communityYourAnswer,
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
        const SizedBox(height: AppSpacing.sm),
        if (q.status.isPublic)
          CommunityPostingGate(
            guestMessage: l10n.communitySignInToAnswer,
            builder: (context, _) => CommunityComposer(
              hint: l10n.communityAnswerHint,
              minLength: 2,
              maxLength: 5000,
              submitLabel: l10n.communityPostAnswer,
              onSubmit: (text) async {
                final created = await ctrl.postAnswer(text);
                if (!context.mounted) return;
                showAppSnackBar(
                  context,
                  created.status == ModerationStatus.pending ? l10n.communityPostedPending : l10n.communityAnswerPosted,
                  icon: created.status == ModerationStatus.pending ? Icons.hourglass_top_rounded : Icons.check,
                );
              },
            ),
          ),
        const SizedBox(height: AppSpacing.xxxl),
      ],
    );
  }

  Future<void> _accept(BuildContext context, QuestionThreadController ctrl, String? answerId) async {
    final l10n = context.l10n;
    try {
      await ctrl.accept(answerId);
      if (context.mounted) {
        showAppSnackBar(
          context,
          answerId == null ? l10n.communityAcceptCleared : l10n.communityAccepted,
          icon: Icons.check_circle_outline,
        );
      }
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, communityErrorMessage(l10n, e), tone: AppTone.danger);
    }
  }

  Future<void> _editQuestion(BuildContext context, QuestionThreadController ctrl, Question q) async {
    final l10n = context.l10n;
    await showAppBottomSheet<void>(
      context: context,
      title: l10n.communityEditQuestion,
      builder: (_) => _EditQuestionForm(
        question: q,
        save: (title, body) => ctrl.editQuestion(title: title, body: body),
      ),
    );
  }
}

class _QuestionCard extends StatelessWidget {
  const _QuestionCard({
    required this.question,
    required this.onVote,
    required this.onEdit,
    required this.onDelete,
    required this.onReport,
    required this.onMute,
  });

  final Question question;
  final ValueChanged<int> onVote;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback onReport;
  final VoidCallback onMute;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final q = question;
    return AppCard(
      padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.lg, AppSpacing.lg, AppSpacing.xs, AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.only(end: AppSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Semantics(
                  header: true,
                  child: Text(q.title, style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                ),
                const SizedBox(height: AppSpacing.sm),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.xs,
                  children: [
                    if (q.isAnswered)
                      Pill(
                        label: l10n.communityAnswered,
                        icon: Icons.check_circle_outline,
                        tone: AppTone.success,
                        dense: true,
                      )
                    else
                      Pill(
                        label: l10n.communityNotAnsweredYet,
                        icon: Icons.help_outline,
                        tone: AppTone.warning,
                        dense: true,
                      ),
                    if (q.target == null) Pill(label: l10n.communityGeneralQuestion, icon: Icons.public, dense: true),
                  ],
                ),
                if (!q.status.isPublic) ...[const SizedBox(height: AppSpacing.md), ModerationNotice(status: q.status)],
                if (q.body != null && q.body!.trim().isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.md),
                  ExpandableBody(text: q.body!, trimLines: 12, style: theme.textTheme.bodyLarge),
                ],
                const SizedBox(height: AppSpacing.md),
              ],
            ),
          ),
          PostHeader(
            author: q.author,
            createdAt: q.createdAt,
            editedAt: q.editedAt,
            isMine: q.isMine,
            avatarSize: 32,
            trailing: PostActionsMenu(
              isMine: q.isMine,
              onEdit: q.status == ModerationStatus.hidden ? null : onEdit,
              onDelete: onDelete,
              onReport: q.status.isPublic ? onReport : null,
              onMute: q.author.id == null ? null : onMute,
            ),
          ),
          HelpfulVoteBar(votes: q.votes, isMine: q.isMine, enabled: q.status.isPublic, onVote: onVote),
        ],
      ),
    );
  }
}

class _AnswerCard extends StatelessWidget {
  const _AnswerCard({
    required this.answer,
    required this.canAccept,
    required this.onAccept,
    required this.onVote,
    required this.onEdit,
    required this.onDelete,
    required this.onReport,
    required this.onMute,
  });

  final Answer answer;
  final bool canAccept;
  final VoidCallback onAccept;
  final ValueChanged<int> onVote;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback onReport;
  final VoidCallback onMute;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final a = answer;
    final scheme = Theme.of(context).colorScheme;
    return AppCard(
      selected: a.isAccepted,
      padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.lg, AppSpacing.md, AppSpacing.xs, AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (a.isAccepted)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: Align(
                alignment: AlignmentDirectional.centerStart,
                child: Pill(label: l10n.communityAcceptedAnswer, icon: Icons.check_circle, tone: AppTone.success),
              ),
            ),
          PostHeader(
            author: a.author,
            createdAt: a.createdAt,
            editedAt: a.editedAt,
            isMine: a.isMine,
            trailing: PostActionsMenu(
              isMine: a.isMine,
              onEdit: a.status == ModerationStatus.hidden ? null : onEdit,
              onDelete: onDelete,
              onReport: a.status.isPublic ? onReport : null,
              onMute: a.author.id == null ? null : onMute,
            ),
          ),
          if (!a.status.isPublic)
            Padding(
              padding: const EdgeInsetsDirectional.only(top: AppSpacing.sm, end: AppSpacing.md),
              child: ModerationNotice(status: a.status),
            ),
          Padding(
            padding: const EdgeInsetsDirectional.only(top: AppSpacing.sm, end: AppSpacing.md),
            child: ExpandableBody(text: a.body),
          ),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              HelpfulVoteBar(votes: a.votes, isMine: a.isMine, enabled: a.status.isPublic, onVote: onVote),
              if (canAccept)
                TextButton.icon(
                  style: TextButton.styleFrom(
                    minimumSize: const Size(kMinTouchTarget, kMinTouchTarget),
                    foregroundColor: a.isAccepted ? scheme.onSurfaceVariant : scheme.primary,
                  ),
                  onPressed: onAccept,
                  icon: Icon(a.isAccepted ? Icons.undo : Icons.check_circle_outline, size: 18),
                  label: Text(a.isAccepted ? l10n.communityUnaccept : l10n.communityAccept),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _EditQuestionForm extends StatefulWidget {
  const _EditQuestionForm({required this.question, required this.save});

  final Question question;
  final Future<Question> Function(String title, String? body) save;

  @override
  State<_EditQuestionForm> createState() => _EditQuestionFormState();
}

class _EditQuestionFormState extends State<_EditQuestionForm> {
  late final _title = TextEditingController(text: widget.question.title);
  late final _body = TextEditingController(text: widget.question.body);
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l10n = context.l10n;
    if (_title.text.trim().length < 10) {
      setState(() => _error = l10n.communityTooShort(10));
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.save(_title.text, _body.text);
      if (mounted) Navigator.of(context).pop();
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
          controller: _title,
          maxLength: 300,
          maxLines: 3,
          minLines: 1,
          decoration: InputDecoration(labelText: l10n.communityQuestionTitleLabel, border: const OutlineInputBorder()),
        ),
        const SizedBox(height: AppSpacing.sm),
        TextField(
          controller: _body,
          maxLength: 5000,
          minLines: 3,
          maxLines: 8,
          decoration: InputDecoration(
            labelText: '${l10n.communityQuestionBodyLabel} · ${l10n.communityOptional}',
            border: const OutlineInputBorder(),
            errorText: _error,
            errorMaxLines: 4,
          ),
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
