import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/paged.dart';
import '../domain/community_models.dart';

/// Every community endpoint the app uses (`docs/decisions/backend-community.md` §3).
///
/// Reads are public (the auth interceptor still attaches the token when signed
/// in, so `isMine` / `myVote` and mutes apply); writes need an account and a
/// verified e-mail — the server answers 401 / 403 `EMAIL_NOT_VERIFIED` /
/// 403 `COMMUNITY_USER_BLOCKED` otherwise. Nothing here is cached: community
/// content changes with moderation and must never be shown stale as live.
class CommunityRepository {
  CommunityRepository(this._api);

  final ApiClient _api;

  static const pageSize = 20;

  // --- Targets ---------------------------------------------------------------------------------

  /// `GET /cars/:slug` → the model id and its trims (reviews are per trim).
  Future<CommunityCar> car(String slug) => _api.getData('/cars/${Uri.encodeComponent(slug)}', CommunityCar.fromData);

  /// `GET /articles/:slug` → the article id and whether comments are open.
  Future<CommunityArticle> article(String slug) =>
      _api.getData('/articles/${Uri.encodeComponent(slug)}', CommunityArticle.fromData);

  // --- Reviews ---------------------------------------------------------------------------------

  Future<ReviewSummary> reviewSummary(String variantId) =>
      _api.getData('/community/reviews/summary', ReviewSummary.fromData, query: {'variantId': variantId});

  Future<Paged<Review?>> reviews(ReviewQuery query, {int page = 1}) => _api.getPage(
    '/community/reviews',
    Review.tryParse,
    query: {...query.toQuery(), 'page': page, 'pageSize': pageSize},
  );

  Future<Review> review(String id) => _api.getData('/community/reviews/${Uri.encodeComponent(id)}', Review.fromData);

  Future<Review> createReview(String variantId, ReviewDraft draft) =>
      _api.postData('/community/reviews', Review.fromData, body: draft.toCreateJson(variantId));

  Future<Review> updateReview(String id, ReviewDraft draft) =>
      _api.patchData('/community/reviews/${Uri.encodeComponent(id)}', Review.fromData, body: draft.toUpdateJson());

  Future<void> deleteReview(String id) => _api.send('DELETE', '/community/reviews/${Uri.encodeComponent(id)}');

  // --- Comments --------------------------------------------------------------------------------

  Future<Paged<Comment?>> comments(CommentTarget target, {CommentSort sort = CommentSort.newest, int page = 1}) =>
      _api.getPage(
        '/comments',
        Comment.tryParse,
        query: {'targetType': target.type, 'targetId': target.id, 'sort': sort.api, 'page': page, 'pageSize': pageSize},
      );

  Future<Paged<Comment?>> replies(String commentId, {int page = 1}) => _api.getPage(
    '/comments/${Uri.encodeComponent(commentId)}/replies',
    Comment.tryParse,
    query: {'page': page, 'pageSize': pageSize},
  );

  Future<Comment> createComment(CommentTarget target, String body, {String? parentId}) => _api.postData(
    '/comments',
    Comment.fromData,
    body: {'targetType': target.type, 'targetId': target.id, 'parentId': ?parentId, 'body': body.trim()},
  );

  Future<Comment> updateComment(String id, String body) =>
      _api.patchData('/comments/${Uri.encodeComponent(id)}', Comment.fromData, body: {'body': body.trim()});

  Future<void> deleteComment(String id) => _api.send('DELETE', '/comments/${Uri.encodeComponent(id)}');

  // --- Questions & answers ---------------------------------------------------------------------

  Future<Paged<Question?>> questions(QuestionQuery query, {int page = 1}) =>
      _api.getPage('/questions', Question.tryParse, query: {...query.toQuery(), 'page': page, 'pageSize': pageSize});

  Future<Question> question(String id) => _api.getData('/questions/${Uri.encodeComponent(id)}', Question.fromData);

  Future<Paged<Answer?>> answers(String questionId, {int page = 1}) => _api.getPage(
    '/questions/${Uri.encodeComponent(questionId)}/answers',
    Answer.tryParse,
    query: {'page': page, 'pageSize': pageSize},
  );

  Future<Question> askQuestion({
    required String title,
    String? body,
    String? targetType,
    String? targetId,
    String? locale,
  }) {
    final b = body?.trim();
    return _api.postData(
      '/questions',
      Question.fromData,
      body: {
        if (targetType != null && targetId != null) ...{'targetType': targetType, 'targetId': targetId},
        'title': title.trim(),
        if (b != null && b.isNotEmpty) 'body': b,
        'locale': ?locale,
      },
    );
  }

  Future<Question> updateQuestion(String id, {required String title, String? body}) {
    final b = body?.trim();
    return _api.patchData(
      '/questions/${Uri.encodeComponent(id)}',
      Question.fromData,
      body: {'title': title.trim(), 'body': (b == null || b.isEmpty) ? null : b},
    );
  }

  Future<void> deleteQuestion(String id) => _api.send('DELETE', '/questions/${Uri.encodeComponent(id)}');

  /// Asker only; `answerId: null` clears the accepted answer.
  Future<Question> acceptAnswer(String questionId, String? answerId) => _api.postData(
    '/questions/${Uri.encodeComponent(questionId)}/accept',
    Question.fromData,
    body: {'answerId': answerId},
  );

  Future<Answer> answer(String questionId, String body) => _api.postData(
    '/questions/${Uri.encodeComponent(questionId)}/answers',
    Answer.fromData,
    body: {'body': body.trim()},
  );

  Future<Answer> updateAnswer(String id, String body) =>
      _api.patchData('/answers/${Uri.encodeComponent(id)}', Answer.fromData, body: {'body': body.trim()});

  Future<void> deleteAnswer(String id) => _api.send('DELETE', '/answers/${Uri.encodeComponent(id)}');

  // --- Votes, reports, mutes, status -----------------------------------------------------------

  /// `value`: 1, -1 or 0 (remove). Returns the server's counters.
  Future<Votes> vote(String targetType, String targetId, int value) => _api.postData(
    '/community/votes',
    (d) => Votes.fromJson(d is Map ? (d['votes'] is Map ? Map<String, dynamic>.from(d['votes'] as Map) : null) : null),
    body: {'targetType': targetType, 'targetId': targetId, 'value': value},
  );

  Future<List<ReportReason>> reportReasons() async {
    final page = await _api.getPage('/community/report-reasons', ReportReason.tryParse);
    return page.items.whereType<ReportReason>().toList();
  }

  Future<void> report({required String targetType, required String targetId, required String reason, String? details}) {
    final d = details?.trim();
    return _api.send(
      'POST',
      '/community/reports',
      body: {
        'targetType': targetType,
        'targetId': targetId,
        'reason': reason,
        if (d != null && d.isNotEmpty) 'details': d,
      },
    );
  }

  /// My review of a trim (any moderation state except deleted), via
  /// `GET /me/community/content?type=review` → `GET /community/reviews/:id`.
  Future<Review?> myReviewFor(String variantId) async {
    for (var page = 1; page <= 5; page++) {
      final res = await _api.getPage(
        '/me/community/content',
        (j) => j,
        query: {'type': 'review', 'page': page, 'pageSize': 50},
      );
      for (final item in res.items.whereType<Map<String, dynamic>>()) {
        final target = TargetRef.tryParse(item['target']);
        final id = item['id'];
        if (target?.id == variantId && id is String) return review(id);
      }
      if (!res.meta.hasMore) break;
    }
    return null;
  }

  Future<CommunityStatus> status() => _api.getData('/me/community/status', CommunityStatus.fromData);

  /// "Block this user" for me: hides their community content from me only.
  Future<void> mute(String userId) => _api.send('PUT', '/me/mutes/${Uri.encodeComponent(userId)}');

  Future<void> unmute(String userId) => _api.send('DELETE', '/me/mutes/${Uri.encodeComponent(userId)}');

  Future<Paged<MutedUser?>> mutes({int page = 1}) =>
      _api.getPage('/me/mutes', MutedUser.tryParse, query: {'page': page, 'pageSize': 50});
}

final communityRepositoryProvider = Provider<CommunityRepository>(
  (ref) => CommunityRepository(ref.watch(apiClientProvider)),
);
