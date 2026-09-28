import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../shared/widgets/kit.dart';
import '../application/community_providers.dart';
import '../domain/community_models.dart';
import 'community_routes.dart';
import 'widgets/community_ui.dart';

/// Questions & answers (`/questions`, optional `?model=<car slug>` filter).
///
/// Search, answered/unanswered filter and sort are server-side. Held and
/// hidden questions are never listed; the asker sees their own on the detail page.
class QuestionsScreen extends ConsumerStatefulWidget {
  const QuestionsScreen({super.key, this.modelSlug});

  /// Optional model filter.
  final String? modelSlug;

  @override
  ConsumerState<QuestionsScreen> createState() => _QuestionsScreenState();
}

class _QuestionsScreenState extends ConsumerState<QuestionsScreen> {
  final _search = TextEditingController();
  Timer? _debounce;
  String? _q;
  AnsweredFilter _answered = AnsweredFilter.all;
  QuestionSort _sort = QuestionSort.recent;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onSearch(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (mounted) setState(() => _q = value.trim().isEmpty ? null : value.trim());
    });
  }

  QuestionQuery _query(CommunityCar? car) => QuestionQuery(
    targetType: car == null ? null : CommunityTargetTypes.model,
    targetId: car?.id,
    q: _q,
    answered: _answered,
    sort: _sort,
  );

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final slug = widget.modelSlug;
    final car = slug == null ? null : ref.watch(communityCarProvider(slug));

    Widget content(CommunityCar? c) {
      final query = _query(c);
      final list = ref.watch(questionsControllerProvider(query));
      final muted = ref.watch(locallyMutedUsersProvider);
      final filtered = _q != null || _answered != AnsweredFilter.all;
      return AppScaffold.slivers(
        title: l10n.communityQuestionsTitle,
        largeTitle: true,
        onRefresh: () async {
          ref.invalidate(questionsControllerProvider(query));
          await ref.read(questionsControllerProvider(query).future).then((_) {}, onError: (_) {});
        },
        floatingActionButton: FloatingActionButton.extended(
          heroTag: 'ask-question',
          onPressed: () => context.push(CommunityRoutes.ask(modelSlug: c?.slug)),
          icon: const Icon(Icons.add_comment_outlined),
          label: Text(l10n.communityAskTitle),
        ),
        slivers: [
          SliverResponsivePadding(
            maxWidth: kMaxReadableWidth,
            sliver: SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (c != null) ...[
                    Wrap(
                      spacing: AppSpacing.sm,
                      runSpacing: AppSpacing.xs,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        InputChip(
                          avatar: const Icon(Icons.directions_car_outlined, size: 18),
                          label: Text(l10n.communityAboutCar(c.title)),
                          onDeleted: () => context.go(AppRoutes.questions()),
                          deleteButtonTooltipMessage: l10n.communityShowAllQuestions,
                        ),
                        if (c.isDemo) const DemoBadge(dense: true),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                  ],
                  AppSearchField(controller: _search, hintText: l10n.communitySearchQuestions, onChanged: _onSearch),
                  const SizedBox(height: AppSpacing.sm),
                  FilterBar(
                    padding: EdgeInsets.zero,
                    chips: [
                      for (final f in AnsweredFilter.values)
                        AppFilterChip(
                          label: switch (f) {
                            AnsweredFilter.all => l10n.communityFilterAll,
                            AnsweredFilter.answered => l10n.communityFilterAnswered,
                            AnsweredFilter.unanswered => l10n.communityFilterUnanswered,
                          },
                          selected: _answered == f,
                          onSelected: (_) => setState(() => _answered = f),
                        ),
                    ],
                  ),
                  ChoicePills<QuestionSort>(
                    options: {
                      QuestionSort.recent: l10n.communitySortRecent,
                      QuestionSort.votes: l10n.communitySortVotes,
                      QuestionSort.active: l10n.communitySortActive,
                    },
                    selected: _sort,
                    onSelected: (s) => setState(() => _sort = s),
                  ),
                ],
              ),
            ),
          ),
          SliverResponsivePadding(
            maxWidth: kMaxReadableWidth,
            sliver: SliverAsyncStateView<PagedList<Question>>(
              value: list,
              onRetry: () => ref.invalidate(questionsControllerProvider(query)),
              isEmpty: (p) => p.items.where((q) => !muted.contains(q.author.id)).isEmpty,
              emptyIcon: filtered ? Icons.search_off : Icons.help_outline,
              emptyTitle: filtered ? l10n.communityNoMatchingQuestionsTitle : l10n.communityNoQuestionsTitle,
              emptyMessage: filtered ? l10n.communityNoMatchingQuestionsMessage : l10n.communityNoQuestionsMessage,
              emptyActions: [
                StateAction(
                  label: l10n.communityAskTitle,
                  icon: Icons.add_comment_outlined,
                  primary: true,
                  onPressed: () => context.push(CommunityRoutes.ask(modelSlug: c?.slug)),
                ),
              ],
              loading: const Skeleton(child: SkeletonList(item: ListTileSkeleton(), count: 5)),
              builder: (context, page) {
                final items = page.items.where((q) => !muted.contains(q.author.id)).toList();
                return SliverList.list(
                  children: [
                    for (final q in items)
                      Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.md),
                        child: QuestionCard(question: q, onTap: () => context.push(AppRoutes.question(q.id))),
                      ),
                    LoadMoreFooter(
                      hasMore: page.hasMore,
                      loading: page.loadingMore,
                      error: page.loadMoreError,
                      onLoadMore: ref.read(questionsControllerProvider(query).notifier).loadMore,
                      label: l10n.communityLoadMoreQuestions,
                    ),
                    const SizedBox(height: 80),
                  ],
                );
              },
            ),
          ),
        ],
      );
    }

    if (car == null) return content(null);
    return car.when(
      skipLoadingOnRefresh: true,
      data: content,
      loading: () => AppScaffold(
        title: l10n.communityQuestionsTitle,
        body: const Skeleton(child: SkeletonList(item: ListTileSkeleton(), count: 5)),
      ),
      error: (e, _) => AppScaffold(
        title: l10n.communityQuestionsTitle,
        body: ErrorState(error: e, onRetry: () => ref.invalidate(communityCarProvider(slug!))),
      ),
    );
  }
}

/// One question in a list: title, excerpt, answered state (icon + text),
/// answer count, helpful score, author and time.
class QuestionCard extends StatelessWidget {
  const QuestionCard({super.key, required this.question, required this.onTap});

  final Question question;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final q = question;
    final time = friendlyTime(context, q.createdAt);
    final author = q.author.isDeleted ? l10n.communityDeletedUser : q.author.displayName;
    return AppCard(
      onTap: onTap,
      semanticLabel: [
        q.title,
        q.isAnswered ? l10n.communityAnswered : l10n.communityAnswerCount(q.answerCount),
        l10n.communityAskedBy(author),
        ?time,
      ].join('. '),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(q.title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          if (q.body != null && q.body!.trim().isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              q.body!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
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
                  label: q.answerCount == 0 ? l10n.communityNoAnswersYet : l10n.communityAnswerCount(q.answerCount),
                  icon: Icons.question_answer_outlined,
                  tone: q.answerCount == 0 ? AppTone.warning : AppTone.info,
                  dense: true,
                ),
              if (q.isAnswered && q.answerCount > 0)
                Pill(
                  label: l10n.communityAnswerCount(q.answerCount),
                  icon: Icons.question_answer_outlined,
                  dense: true,
                ),
              if (q.votes.up > 0)
                Pill(
                  label: l10n.communityHelpfulCount(fmt.number(q.votes.up) ?? '${q.votes.up}'),
                  icon: Icons.thumb_up_outlined,
                  dense: true,
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            [l10n.communityAskedBy(author), ?time].join(' · '),
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
