import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/paged.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/community_repository.dart';
import '../domain/community_models.dart';

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------

/// Id of the signed-in user (null for guests / while restoring).
final communityViewerIdProvider = Provider<String?>((ref) => ref.watch(authControllerProvider).user?.id);

/// `GET /me/community/status` for the signed-in user; `null` for guests.
final communityStatusProvider = FutureProvider.autoDispose<CommunityStatus?>((ref) async {
  final uid = ref.watch(communityViewerIdProvider);
  if (uid == null) return null;
  return ref.watch(communityRepositoryProvider).status();
});

/// Users muted ("blocked") in this session — hidden immediately, before the
/// lists are reloaded from the server (which then excludes them too).
class LocallyMutedUsers extends Notifier<Set<String>> {
  @override
  Set<String> build() {
    ref.watch(communityViewerIdProvider); // reset on sign-in/out
    return const {};
  }

  void add(String userId) => state = {...state, userId};

  void remove(String userId) => state = {...state}..remove(userId);
}

final locallyMutedUsersProvider = NotifierProvider<LocallyMutedUsers, Set<String>>(LocallyMutedUsers.new);

/// Report reasons (labels localized by the server; reloaded when the language changes).
final reportReasonsProvider = FutureProvider.autoDispose<List<ReportReason>>((ref) {
  ref.watch(effectiveLanguageProvider);
  return ref.watch(communityRepositoryProvider).reportReasons();
});

// ---------------------------------------------------------------------------
// Targets (slug → id)
// ---------------------------------------------------------------------------

final communityCarProvider = FutureProvider.autoDispose.family<CommunityCar, String>((ref, slug) {
  ref.watch(requestLocaleProvider);
  return ref.watch(communityRepositoryProvider).car(slug);
});

final communityArticleProvider = FutureProvider.autoDispose.family<CommunityArticle, String>((ref, slug) {
  ref.watch(effectiveLanguageProvider);
  return ref.watch(communityRepositoryProvider).article(slug);
});

// ---------------------------------------------------------------------------
// Generic paged list
// ---------------------------------------------------------------------------

/// A page-by-page list with "load more".
@immutable
class PagedList<T> {
  const PagedList({
    required this.items,
    this.page = 1,
    this.hasMore = false,
    this.total,
    this.loadingMore = false,
    this.loadMoreError,
  });

  final List<T> items;
  final int page;
  final bool hasMore;

  /// Server total (null when unknown — never shown as 0).
  final int? total;
  final bool loadingMore;
  final Object? loadMoreError;

  PagedList<T> copyWith({
    List<T>? items,
    int? page,
    bool? hasMore,
    int? Function()? total,
    bool? loadingMore,
    Object? Function()? loadMoreError,
  }) => PagedList(
    items: items ?? this.items,
    page: page ?? this.page,
    hasMore: hasMore ?? this.hasMore,
    total: total == null ? this.total : total(),
    loadingMore: loadingMore ?? this.loadingMore,
    loadMoreError: loadMoreError == null ? this.loadMoreError : loadMoreError(),
  );

  static PagedList<T> first<T>(Paged<T?> page) =>
      PagedList(items: page.items.whereType<T>().toList(), hasMore: page.meta.hasMore, total: page.meta.total);
}

/// Shared "load more" + in-place update logic for list controllers.
mixin PagedListOps<T extends CommunityPost> on AsyncNotifier<PagedList<T>> {
  Future<Paged<T?>> fetchPage(int page);

  List<T> _append(List<T> existing, List<T?> next) {
    final seen = {for (final e in existing) e.id};
    return [
      ...existing,
      for (final e in next.whereType<T>())
        if (seen.add(e.id)) e,
    ];
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || current.loadingMore || !current.hasMore || state.isLoading) return;
    state = AsyncData(current.copyWith(loadingMore: true, loadMoreError: () => null));
    try {
      final res = await fetchPage(current.page + 1);
      if (!ref.mounted) return;
      final latest = state.value ?? current;
      state = AsyncData(
        latest.copyWith(
          items: _append(latest.items, res.items),
          page: current.page + 1,
          hasMore: res.meta.hasMore && res.items.isNotEmpty,
          loadingMore: false,
        ),
      );
    } on Object catch (e) {
      if (!ref.mounted) return;
      final latest = state.value ?? current;
      state = AsyncData(latest.copyWith(loadingMore: false, loadMoreError: () => e));
    }
  }

  /// Replaces one item (e.g. after a vote or an edit).
  void replace(T item) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(current.copyWith(items: [for (final e in current.items) e.id == item.id ? item : e]));
  }

  /// Removes one item (deleted by its author).
  void removeById(String id) {
    final current = state.value;
    if (current == null) return;
    final before = current.items.length;
    final items = current.items.where((e) => e.id != id).toList();
    final removed = before - items.length;
    state = AsyncData(
      current.copyWith(items: items, total: () => current.total == null ? null : current.total! - removed),
    );
  }

  /// Adds a freshly posted item at the top.
  void prepend(T item) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      current.copyWith(
        items: [item, ...current.items.where((e) => e.id != item.id)],
        total: () => current.total == null ? null : current.total! + 1,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

final reviewSummaryProvider = FutureProvider.autoDispose.family<ReviewSummary, String>((ref, variantId) {
  ref.watch(effectiveLanguageProvider);
  ref.watch(communityViewerIdProvider);
  return ref.watch(communityRepositoryProvider).reviewSummary(variantId);
});

class ReviewsController extends AsyncNotifier<PagedList<Review>> with PagedListOps<Review> {
  ReviewsController(this.query);

  final ReviewQuery query;

  @override
  Future<Paged<Review?>> fetchPage(int page) => ref.read(communityRepositoryProvider).reviews(query, page: page);

  @override
  Future<PagedList<Review>> build() async {
    ref.watch(effectiveLanguageProvider);
    ref.watch(communityViewerIdProvider);
    final page = await ref.watch(communityRepositoryProvider).reviews(query);
    return PagedList.first(page);
  }
}

final reviewsControllerProvider = AsyncNotifierProvider.autoDispose
    .family<ReviewsController, PagedList<Review>, ReviewQuery>(ReviewsController.new);

/// The signed-in user's own review of a trim (pending / hidden / rejected
/// included), or null. Guests → null.
final myReviewProvider = FutureProvider.autoDispose.family<Review?, String>((ref, variantId) {
  final uid = ref.watch(communityViewerIdProvider);
  if (uid == null) return null;
  ref.watch(effectiveLanguageProvider);
  return ref.watch(communityRepositoryProvider).myReviewFor(variantId);
});

/// One review by id (author's own pending review, edit form).
final reviewProvider = FutureProvider.autoDispose.family<Review, String>((ref, id) {
  ref.watch(communityViewerIdProvider);
  return ref.watch(communityRepositoryProvider).review(id);
});

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

@immutable
class CommentThreadKey {
  const CommentThreadKey(this.target, this.sort);

  final CommentTarget target;
  final CommentSort sort;

  @override
  bool operator ==(Object other) => other is CommentThreadKey && other.target == target && other.sort == sort;

  @override
  int get hashCode => Object.hash(target, sort);
}

class CommentsController extends AsyncNotifier<PagedList<Comment>> with PagedListOps<Comment> {
  CommentsController(this.key);

  final CommentThreadKey key;

  CommunityRepository get _repo => ref.read(communityRepositoryProvider);

  @override
  Future<Paged<Comment?>> fetchPage(int page) => _repo.comments(key.target, sort: key.sort, page: page);

  @override
  Future<PagedList<Comment>> build() async {
    ref.watch(effectiveLanguageProvider);
    ref.watch(communityViewerIdProvider);
    final page = await ref.watch(communityRepositoryProvider).comments(key.target, sort: key.sort);
    return PagedList.first(page);
  }

  /// Posts a comment (or a reply when [parentId] is set) and shows it at once —
  /// with its moderation state when the server held it for review.
  Future<Comment> post(String body, {String? parentId}) async {
    final created = await _repo.createComment(key.target, body, parentId: parentId);
    if (!ref.mounted) return created;
    final rootId = created.parentId;
    if (rootId == null) {
      prepend(created);
    } else {
      _updateThread(
        rootId,
        (root) => root.copyWith(replies: [...root.replies, created], replyCount: root.replyCount + 1),
      );
    }
    return created;
  }

  Future<Comment> edit(Comment comment, String body) async {
    final updated = await _repo.updateComment(comment.id, body);
    if (ref.mounted) upsert(updated);
    return updated;
  }

  Future<void> delete(Comment comment) async {
    await _repo.deleteComment(comment.id);
    if (!ref.mounted) return;
    final parent = comment.parentId;
    if (parent == null) {
      removeById(comment.id);
    } else {
      _updateThread(
        parent,
        (root) => root.copyWith(
          replies: root.replies.where((r) => r.id != comment.id).toList(),
          replyCount: root.replyCount > 0 ? root.replyCount - 1 : 0,
        ),
      );
    }
  }

  /// Loads every reply of a thread (oldest first).
  Future<void> loadAllReplies(String rootId) async {
    final all = <Comment>[];
    var page = 1;
    while (true) {
      final res = await _repo.replies(rootId, page: page);
      all.addAll(res.items.whereType<Comment>());
      if (!res.meta.hasMore || res.items.isEmpty || page >= 20) break;
      page++;
    }
    if (!ref.mounted) return;
    _updateThread(
      rootId,
      (root) => root.copyWith(replies: all, replyCount: all.length > root.replyCount ? all.length : null),
    );
  }

  /// Replaces a top-level comment or a reply.
  void upsert(Comment comment) {
    final parent = comment.parentId;
    if (parent == null) {
      final current = state.value;
      if (current == null) return;
      state = AsyncData(
        current.copyWith(
          items: [
            for (final c in current.items)
              c.id == comment.id ? comment.copyWith(replies: c.replies, replyCount: c.replyCount) : c,
          ],
        ),
      );
    } else {
      _updateThread(
        parent,
        (root) => root.copyWith(replies: [for (final r in root.replies) r.id == comment.id ? comment : r]),
      );
    }
  }

  void _updateThread(String rootId, Comment Function(Comment root) update) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(current.copyWith(items: [for (final c in current.items) c.id == rootId ? update(c) : c]));
  }
}

final commentsControllerProvider = AsyncNotifierProvider.autoDispose
    .family<CommentsController, PagedList<Comment>, CommentThreadKey>(CommentsController.new);

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

class QuestionsController extends AsyncNotifier<PagedList<Question>> with PagedListOps<Question> {
  QuestionsController(this.query);

  final QuestionQuery query;

  @override
  Future<Paged<Question?>> fetchPage(int page) => ref.read(communityRepositoryProvider).questions(query, page: page);

  @override
  Future<PagedList<Question>> build() async {
    ref.watch(effectiveLanguageProvider);
    ref.watch(communityViewerIdProvider);
    final page = await ref.watch(communityRepositoryProvider).questions(query);
    return PagedList.first(page);
  }
}

final questionsControllerProvider = AsyncNotifierProvider.autoDispose
    .family<QuestionsController, PagedList<Question>, QuestionQuery>(QuestionsController.new);

/// A question with its answers.
@immutable
class QuestionThread {
  const QuestionThread({required this.question, required this.answers});

  final Question question;
  final PagedList<Answer> answers;

  QuestionThread copyWith({Question? question, PagedList<Answer>? answers}) =>
      QuestionThread(question: question ?? this.question, answers: answers ?? this.answers);
}

class QuestionThreadController extends AsyncNotifier<QuestionThread> {
  QuestionThreadController(this.questionId);

  final String questionId;

  CommunityRepository get _repo => ref.read(communityRepositoryProvider);

  @override
  Future<QuestionThread> build() async {
    ref.watch(effectiveLanguageProvider);
    ref.watch(communityViewerIdProvider);
    final repo = ref.watch(communityRepositoryProvider);
    final results = await Future.wait([repo.question(questionId), repo.answers(questionId)]);
    final question = results[0] as Question;
    final answers = PagedList.first(results[1] as Paged<Answer?>);
    return QuestionThread(question: question, answers: answers);
  }

  Future<void> loadMoreAnswers() async {
    final current = state.value;
    if (current == null || current.answers.loadingMore || !current.answers.hasMore) return;
    state = AsyncData(
      current.copyWith(answers: current.answers.copyWith(loadingMore: true, loadMoreError: () => null)),
    );
    try {
      final res = await _repo.answers(questionId, page: current.answers.page + 1);
      if (!ref.mounted) return;
      final latest = state.value ?? current;
      final seen = {for (final a in latest.answers.items) a.id};
      state = AsyncData(
        latest.copyWith(
          answers: latest.answers.copyWith(
            items: [
              ...latest.answers.items,
              for (final a in res.items.whereType<Answer>())
                if (seen.add(a.id)) a,
            ],
            page: current.answers.page + 1,
            hasMore: res.meta.hasMore && res.items.isNotEmpty,
            loadingMore: false,
          ),
        ),
      );
    } on Object catch (e) {
      if (!ref.mounted) return;
      final latest = state.value ?? current;
      state = AsyncData(latest.copyWith(answers: latest.answers.copyWith(loadingMore: false, loadMoreError: () => e)));
    }
  }

  Future<Answer> postAnswer(String body) async {
    final created = await _repo.answer(questionId, body);
    if (!ref.mounted) return created;
    final current = state.value;
    if (current != null) {
      state = AsyncData(
        current.copyWith(
          answers: current.answers.copyWith(
            items: [...current.answers.items, created],
            total: () => current.answers.total == null ? null : current.answers.total! + 1,
          ),
        ),
      );
    }
    return created;
  }

  Future<Answer> editAnswer(Answer answer, String body) async {
    final updated = await _repo.updateAnswer(answer.id, body);
    if (ref.mounted) replaceAnswer(updated);
    return updated;
  }

  Future<void> deleteAnswer(Answer answer) async {
    await _repo.deleteAnswer(answer.id);
    if (!ref.mounted) return;
    ref.invalidateSelf();
  }

  /// Asker only. `null` clears the accepted answer.
  Future<void> accept(String? answerId) async {
    final question = await _repo.acceptAnswer(questionId, answerId);
    if (!ref.mounted) return;
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      current.copyWith(
        question: question,
        answers: current.answers.copyWith(
          items: [for (final a in current.answers.items) a.copyWith(isAccepted: a.id == answerId)],
        ),
      ),
    );
  }

  Future<Question> editQuestion({required String title, String? body}) async {
    final updated = await _repo.updateQuestion(questionId, title: title, body: body);
    if (ref.mounted) {
      final current = state.value;
      if (current != null) state = AsyncData(current.copyWith(question: updated));
    }
    return updated;
  }

  void replaceQuestion(Question q) {
    final current = state.value;
    if (current != null) state = AsyncData(current.copyWith(question: q));
  }

  void replaceAnswer(Answer a) {
    final current = state.value;
    if (current == null) return;
    final q = current.question;
    state = AsyncData(
      current.copyWith(
        question: q.acceptedAnswer?.id == a.id
            ? Question(
                id: q.id,
                title: q.title,
                author: q.author,
                target: q.target,
                body: q.body,
                locale: q.locale,
                votes: q.votes,
                answerCount: q.answerCount,
                acceptedAnswerId: q.acceptedAnswerId,
                status: q.status,
                isMine: q.isMine,
                editedAt: q.editedAt,
                createdAt: q.createdAt,
                acceptedAnswer: a,
              )
            : q,
        answers: current.answers.copyWith(items: [for (final e in current.answers.items) e.id == a.id ? a : e]),
      ),
    );
  }
}

final questionThreadProvider = AsyncNotifierProvider.autoDispose
    .family<QuestionThreadController, QuestionThread, String>(QuestionThreadController.new);

// ---------------------------------------------------------------------------
// Mutes
// ---------------------------------------------------------------------------

final mutedUsersProvider = FutureProvider.autoDispose<List<MutedUser>>((ref) async {
  final uid = ref.watch(communityViewerIdProvider);
  if (uid == null) return const [];
  final page = await ref.watch(communityRepositoryProvider).mutes();
  return page.items.whereType<MutedUser>().toList();
});

/// Reloads every community list after a mute / unmute (the server filters
/// muted authors per viewer).
void invalidateCommunityLists(WidgetRef ref) {
  ref.invalidate(reviewsControllerProvider);
  ref.invalidate(commentsControllerProvider);
  ref.invalidate(questionsControllerProvider);
  ref.invalidate(questionThreadProvider);
  ref.invalidate(reviewSummaryProvider);
  ref.invalidate(myReviewProvider);
  ref.invalidate(mutedUsersProvider);
}
