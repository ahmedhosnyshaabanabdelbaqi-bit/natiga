import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/widgets/kit.dart';
import '../application/community_providers.dart';
import '../data/community_repository.dart';
import '../domain/community_models.dart';
import 'community_routes.dart';
import 'widgets/community_actions.dart';
import 'widgets/community_ui.dart';
import 'widgets/review_widgets.dart';

/// Owner reviews of a car (`/cars/:slug/reviews[?variant=]`).
///
/// Reviews belong to one trim, so the page starts with a trim selector (the
/// `variant` query parameter, then the server's default trim). Summary,
/// distribution and dimension averages come from the server — nothing is
/// averaged locally and an unrated value is "Not available", never 0. The
/// "Verified owner" badge is shown only when the API says so. Demo reviews are
/// never served by the API.
class CarReviewsScreen extends ConsumerStatefulWidget {
  const CarReviewsScreen({super.key, required this.carSlug, this.initialVariant});

  /// Car (model) slug.
  final String carSlug;

  /// Trim id or slug to preselect (else `?variant=` of the route).
  final String? initialVariant;

  @override
  ConsumerState<CarReviewsScreen> createState() => _CarReviewsScreenState();
}

class _CarReviewsScreenState extends ConsumerState<CarReviewsScreen> {
  String? _trimId;
  ReviewSort _sort = ReviewSort.helpful;
  int? _rating;
  bool _verifiedOnly = false;

  ReviewQuery _query(String variantId) =>
      ReviewQuery(variantId: variantId, sort: _sort, rating: _rating, verifiedOnly: _verifiedOnly);

  Future<void> _refresh(String? variantId) async {
    ref.invalidate(communityCarProvider(widget.carSlug));
    if (variantId == null) return;
    ref.invalidate(reviewSummaryProvider(variantId));
    ref.invalidate(myReviewProvider(variantId));
    await ref
        .refresh(reviewsControllerProvider(_query(variantId)).future)
        .catchError((_) => PagedList<Review>(items: const []));
  }

  void _write(CommunityTrim trim, Review? mine) {
    context.push(CommunityRoutes.writeReview(widget.carSlug, variant: trim.id, reviewId: mine?.id));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final car = ref.watch(communityCarProvider(widget.carSlug));
    final data = car.value;
    final trim = data?.initialTrim(_trimId ?? widget.initialVariant ?? routeQueryParam(context, 'variant'));
    final mine = trim == null ? null : ref.watch(myReviewProvider(trim.id)).value;

    return AppScaffold.slivers(
      title: l10n.communityCarReviewsTitle,
      onRefresh: () => _refresh(trim?.id),
      floatingActionButton: trim == null
          ? null
          : FloatingActionButton.extended(
              heroTag: 'write-review',
              onPressed: () => _write(trim, mine),
              icon: Icon(mine == null ? Icons.rate_review_outlined : Icons.edit_outlined),
              label: Text(mine == null ? l10n.communityWriteReviewTitle : l10n.communityEditMyReview),
            ),
      slivers: [
        SliverAsyncStateView<CommunityCar>(
          value: car,
          onRetry: () => ref.invalidate(communityCarProvider(widget.carSlug)),
          loading: const Skeleton(child: SkeletonList(item: ListTileSkeleton(), count: 4)),
          builder: (context, c) {
            if (trim == null) {
              return SliverFillRemaining(
                hasScrollBody: false,
                child: EmptyState(
                  icon: Icons.directions_car_outlined,
                  title: l10n.communityNoTrimsTitle,
                  message: l10n.communityNoTrimsMessage,
                ),
              );
            }
            return SliverResponsivePadding(
              maxWidth: kMaxReadableWidth,
              sliver: SliverMainAxisGroup(
                slivers: [
                  SliverToBoxAdapter(
                    child: _Header(car: c, trim: trim, onTrim: (t) => setState(() => _trimId = t.id)),
                  ),
                  if (mine != null)
                    SliverToBoxAdapter(
                      child: _MyReview(
                        review: mine,
                        onEdit: () => _write(trim, mine),
                        onDelete: () => confirmAndDelete(
                          context,
                          title: l10n.communityDeleteReviewTitle,
                          run: () async {
                            await ref.read(communityRepositoryProvider).deleteReview(mine.id);
                            ref.invalidate(myReviewProvider(trim.id));
                            ref.invalidate(reviewSummaryProvider(trim.id));
                            ref.invalidate(reviewsControllerProvider);
                          },
                        ),
                      ),
                    ),
                  ..._reviewSlivers(context, trim, mine),
                ],
              ),
            );
          },
        ),
      ],
    );
  }

  List<Widget> _reviewSlivers(BuildContext context, CommunityTrim trim, Review? mine) {
    final l10n = context.l10n;
    final summary = ref.watch(reviewSummaryProvider(trim.id));
    final query = _query(trim.id);
    final list = ref.watch(reviewsControllerProvider(query));
    final muted = ref.watch(locallyMutedUsersProvider);
    final filtered = _rating != null || _verifiedOnly;
    final noReviews = summary.value?.isEmpty ?? false;

    return [
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.only(top: AppSpacing.lg),
          child: AsyncStateView<ReviewSummary>(
            value: summary,
            compact: true,
            onRetry: () => ref.invalidate(reviewSummaryProvider(trim.id)),
            loading: const Skeleton(child: SkeletonBox(height: 160, radius: AppRadii.lg)),
            builder: (context, s) => s.isEmpty
                ? AppCard(
                    child: EmptyState(
                      compact: true,
                      icon: Icons.reviews_outlined,
                      title: l10n.communityNoReviewsTitle,
                      message: l10n.communityNoReviewsMessage,
                      actions: [
                        if (mine == null)
                          StateAction(
                            label: l10n.communityBeFirstToReview,
                            icon: Icons.rate_review_outlined,
                            primary: true,
                            onPressed: () => _write(trim, mine),
                          ),
                      ],
                    ),
                  )
                : ReviewSummaryCard(summary: s),
          ),
        ),
      ),
      if (!noReviews) ...[
        SliverToBoxAdapter(
          child: _Filters(
            sort: _sort,
            rating: _rating,
            verifiedOnly: _verifiedOnly,
            onSort: (s) => setState(() => _sort = s),
            onRating: (r) => setState(() => _rating = r),
            onVerified: (v) => setState(() => _verifiedOnly = v),
          ),
        ),
        SliverAsyncStateView<PagedList<Review>>(
          value: list,
          onRetry: () => ref.invalidate(reviewsControllerProvider(query)),
          isEmpty: (p) => p.items.where((r) => !muted.contains(r.author.id)).isEmpty,
          emptyIcon: Icons.filter_alt_off_outlined,
          emptyTitle: filtered ? l10n.communityNoFilteredReviewsTitle : l10n.communityNoReviewsTitle,
          emptyMessage: filtered ? l10n.communityNoFilteredReviewsMessage : l10n.communityNoReviewsMessage,
          emptyActions: [
            if (filtered)
              StateAction(
                label: l10n.communityClearFilters,
                icon: Icons.filter_alt_off_outlined,
                onPressed: () => setState(() {
                  _rating = null;
                  _verifiedOnly = false;
                }),
              ),
          ],
          loading: const Skeleton(
            child: SkeletonList(item: ListTileSkeleton(), count: 3, padding: EdgeInsets.zero),
          ),
          builder: (context, page) {
            final items = page.items.where((r) => !muted.contains(r.author.id)).toList();
            final ctrl = ref.read(reviewsControllerProvider(query).notifier);
            return SliverList.list(
              children: [
                for (final r in items)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.md),
                    child: ReviewCard(
                      review: r,
                      onVote: (v) => voteOn<Review>(
                        context,
                        ref,
                        post: r,
                        value: v,
                        withVotes: (p, votes) => p.copyWith(votes: votes),
                        apply: ctrl.replace,
                      ),
                      onEdit: () => _write(trim, r),
                      onDelete: () => confirmAndDelete(
                        context,
                        title: l10n.communityDeleteReviewTitle,
                        run: () async {
                          await ref.read(communityRepositoryProvider).deleteReview(r.id);
                          ctrl.removeById(r.id);
                          ref.invalidate(reviewSummaryProvider(trim.id));
                          ref.invalidate(myReviewProvider(trim.id));
                        },
                      ),
                      onReport: () =>
                          showReportSheet(context, ref, targetType: CommunityTargetTypes.review, targetId: r.id),
                      onMute: () => confirmAndMute(context, ref, r.author),
                    ),
                  ),
                LoadMoreFooter(
                  hasMore: page.hasMore,
                  loading: page.loadingMore,
                  error: page.loadMoreError,
                  onLoadMore: ctrl.loadMore,
                  label: l10n.communityLoadMoreReviews,
                ),
                const _Disclaimer(),
                const SizedBox(height: 80),
              ],
            );
          },
        ),
      ] else
        const SliverToBoxAdapter(child: _Disclaimer()),
    ];
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.car, required this.trim, required this.onTrim});

  final CommunityCar car;
  final CommunityTrim trim;
  final ValueChanged<CommunityTrim> onTrim;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text(car.title, style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
          ),
          if (car.isDemo || trim.isDemo) ...[const SizedBox(height: AppSpacing.sm), const DemoTargetNotice()],
          const SizedBox(height: AppSpacing.md),
          TrimSelector(trims: car.trims, selected: trim, onChanged: onTrim),
        ],
      ),
    );
  }
}

class _MyReview extends StatelessWidget {
  const _MyReview({required this.review, required this.onEdit, required this.onDelete});

  final Review review;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text(
              l10n.communityYourReview,
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          ReviewCard(review: review, onVote: (_) {}, onEdit: onEdit, onDelete: onDelete),
        ],
      ),
    );
  }
}

class _Filters extends StatelessWidget {
  const _Filters({
    required this.sort,
    required this.rating,
    required this.verifiedOnly,
    required this.onSort,
    required this.onRating,
    required this.onVerified,
  });

  final ReviewSort sort;
  final int? rating;
  final bool verifiedOnly;
  final ValueChanged<ReviewSort> onSort;
  final ValueChanged<int?> onRating;
  final ValueChanged<bool> onVerified;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text(
              l10n.communityAllReviews,
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          ChoicePills<ReviewSort>(
            options: {
              ReviewSort.helpful: l10n.communitySortHelpful,
              ReviewSort.recent: l10n.communitySortRecent,
              ReviewSort.ratingHigh: l10n.communitySortRatingHigh,
              ReviewSort.ratingLow: l10n.communitySortRatingLow,
            },
            selected: sort,
            onSelected: onSort,
          ),
          const SizedBox(height: AppSpacing.xs),
          FilterBar(
            padding: EdgeInsets.zero,
            chips: [
              AppFilterChip(
                label: l10n.communityVerifiedOnly,
                icon: Icons.verified_outlined,
                selected: verifiedOnly,
                onSelected: onVerified,
              ),
              for (var s = 5; s >= 1; s--)
                AppFilterChip(
                  label: l10n.communityStarOption(s),
                  icon: Icons.star_rounded,
                  selected: rating == s,
                  onSelected: (on) => onRating(on ? s : null),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Disclaimer extends StatelessWidget {
  const _Disclaimer();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, size: 18, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              context.l10n.communityReviewsDisclaimer,
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ),
        ],
      ),
    );
  }
}
