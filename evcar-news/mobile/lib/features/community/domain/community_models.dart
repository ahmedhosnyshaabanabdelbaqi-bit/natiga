import 'package:flutter/foundation.dart';

import '../../../core/json/json_readers.dart';

// Community domain (REQUIREMENTS §15) — shapes of `docs/decisions/backend-community.md` §3.
//
// Parsing is defensive: a malformed list item is skipped (`tryParse` → null),
// missing numbers stay `null` (the UI shows "Not available", never 0), and the
// "verified owner" badge is shown only when the server says `verifiedOwner: true`.

/// Moderation state of a community item.
///
/// Public lists only ever contain [approved] items; authors also see their own
/// [pending] / [hidden] / [rejected] items (by id, in "my content", or right
/// after posting).
enum ModerationStatus {
  approved,
  pending,
  hidden,
  rejected;

  static ModerationStatus parse(String? value) => switch (value) {
    'pending' => pending,
    'hidden' => hidden,
    'rejected' => rejected,
    _ => approved,
  };

  bool get isPublic => this == approved;
}

/// What a comment / question / vote / report is attached to.
abstract final class CommunityTargetTypes {
  // Comments.
  static const article = 'article';
  static const review = 'review';
  static const model = 'model';
  static const variant = 'variant';

  // Questions may also be about a station.
  static const station = 'station';

  // Votes / reports.
  static const comment = 'comment';
  static const question = 'question';
  static const answer = 'answer';
  static const user = 'user';

  static const commentTargets = {article, review, model, variant};
  static const questionTargets = {model, variant, station};
}

/// `Author = { id: uuid|null, displayName, isDeleted }`.
@immutable
class CommunityAuthor {
  const CommunityAuthor({required this.id, required this.displayName, this.isDeleted = false});

  /// `null` for a deleted account.
  final String? id;
  final String displayName;
  final bool isDeleted;

  static CommunityAuthor fromJson(Map<String, dynamic>? j) {
    if (j == null) return const CommunityAuthor(id: null, displayName: '', isDeleted: true);
    return CommunityAuthor(
      id: j.stringOrNull('id'),
      displayName: j.stringOrNull('displayName') ?? '',
      isDeleted: j.boolOr('isDeleted', false) || j.stringOrNull('id') == null,
    );
  }

  /// Initials for the avatar (first letter of up to two words).
  String get initials {
    final parts = displayName.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    String firstOf(String p) => String.fromCharCode(p.runes.first);
    final first = firstOf(parts.first);
    if (parts.length == 1) return first.toUpperCase();
    return (first + firstOf(parts[1])).toUpperCase();
  }
}

/// `Votes = { up, down, score, myVote: 1|-1|null }`.
@immutable
class Votes {
  const Votes({this.up = 0, this.down = 0, this.myVote});

  final int up;
  final int down;

  /// 1, -1 or null (not voted / guest).
  final int? myVote;

  int get score => up - down;

  static Votes fromJson(Map<String, dynamic>? j) {
    if (j == null) return const Votes();
    final my = j.intOrNull('myVote');
    return Votes(up: j.intOrNull('up') ?? 0, down: j.intOrNull('down') ?? 0, myVote: my == 1 || my == -1 ? my : null);
  }

  /// Optimistic result of voting [value] (1, -1 or 0 = remove).
  Votes applying(int value) {
    var u = up;
    var d = down;
    if (myVote == 1) u--;
    if (myVote == -1) d--;
    if (value == 1) u++;
    if (value == -1) d++;
    return Votes(up: u < 0 ? 0 : u, down: d < 0 ? 0 : d, myVote: value == 0 ? null : value);
  }

  @override
  bool operator ==(Object other) => other is Votes && other.up == up && other.down == down && other.myVote == myVote;

  @override
  int get hashCode => Object.hash(up, down, myVote);
}

/// `Target = { type, id }`.
@immutable
class TargetRef {
  const TargetRef({required this.type, required this.id});

  final String type;
  final String id;

  static TargetRef? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final type = j.stringOrNull('type');
    final id = j.stringOrNull('id');
    if (type == null || id == null) return null;
    return TargetRef(type: type, id: id);
  }

  @override
  bool operator ==(Object other) => other is TargetRef && other.type == type && other.id == id;

  @override
  int get hashCode => Object.hash(type, id);
}

/// Anything users can vote on / report / edit — used by the shared widgets.
abstract interface class CommunityPost {
  String get id;
  CommunityAuthor get author;
  Votes get votes;
  ModerationStatus get status;
  bool get isMine;
  DateTime? get createdAt;

  /// `review` | `comment` | `question` | `answer`.
  String get voteType;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

/// Rating dimension codes (`review_ratings.dimension`).
abstract final class ReviewDimensions {
  static const car = [
    'range_real_world',
    'charging',
    'comfort',
    'technology',
    'build_quality',
    'value_for_money',
    'reliability',
    'after_sales',
  ];
}

@immutable
class DimensionScore {
  const DimensionScore({required this.dimension, required this.label, required this.score});

  final String dimension;

  /// Localized by the server (ar/en).
  final String label;
  final int score;

  static DimensionScore? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final d = j.stringOrNull('dimension');
    final s = j.intOrNull('score');
    if (d == null || s == null) return null;
    return DimensionScore(dimension: d, label: j.stringOrNull('label') ?? d, score: s);
  }
}

@immutable
class Review implements CommunityPost {
  const Review({
    required this.id,
    required this.target,
    required this.rating,
    required this.body,
    required this.author,
    this.title,
    this.pros,
    this.cons,
    this.ownershipMonths,
    this.ratings = const [],
    this.verifiedOwner = false,
    this.verifiedOwnerLabel,
    this.locale,
    this.marketCode,
    this.votes = const Votes(),
    this.commentCount,
    this.status = ModerationStatus.approved,
    this.isMine = false,
    this.createdAt,
    this.updatedAt,
  });

  @override
  final String id;
  final TargetRef target;

  /// 1..5.
  final int rating;
  final String? title;
  final String body;
  final String? pros;
  final String? cons;
  final int? ownershipMonths;
  final List<DimensionScore> ratings;
  @override
  final CommunityAuthor author;

  /// Only true when an approved, unexpired verification exists (server-side).
  final bool verifiedOwner;
  final String? verifiedOwnerLabel;
  final String? locale;
  final String? marketCode;
  @override
  final Votes votes;
  final int? commentCount;
  @override
  final ModerationStatus status;
  @override
  final bool isMine;
  @override
  final DateTime? createdAt;
  final DateTime? updatedAt;

  @override
  String get voteType => CommunityTargetTypes.review;

  Review copyWith({Votes? votes}) => Review(
    id: id,
    target: target,
    rating: rating,
    body: body,
    author: author,
    title: title,
    pros: pros,
    cons: cons,
    ownershipMonths: ownershipMonths,
    ratings: ratings,
    verifiedOwner: verifiedOwner,
    verifiedOwnerLabel: verifiedOwnerLabel,
    locale: locale,
    marketCode: marketCode,
    votes: votes ?? this.votes,
    commentCount: commentCount,
    status: status,
    isMine: isMine,
    createdAt: createdAt,
    updatedAt: updatedAt,
  );

  static Review? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('id');
    final target = TargetRef.tryParse(j['target']);
    final rating = j.intOrNull('rating');
    final body = j.stringOrNull('body');
    if (id == null || target == null || rating == null || body == null) return null;
    final verified = j.boolOrNull('verifiedOwner') == true;
    return Review(
      id: id,
      target: target,
      rating: rating.clamp(1, 5),
      title: j.stringOrNull('title'),
      body: body,
      pros: j.stringOrNull('pros'),
      cons: j.stringOrNull('cons'),
      ownershipMonths: j.intOrNull('ownershipMonths'),
      ratings: j['ratings'] is List ? [for (final r in j['ratings'] as List) ?DimensionScore.tryParse(r)] : const [],
      author: CommunityAuthor.fromJson(j.objectOrNull('author')),
      verifiedOwner: verified,
      verifiedOwnerLabel: verified ? j.stringOrNull('verifiedOwnerLabel') : null,
      locale: j.stringOrNull('locale'),
      marketCode: j.stringOrNull('marketCode'),
      votes: Votes.fromJson(j.objectOrNull('votes')),
      commentCount: j.intOrNull('commentCount'),
      status: ModerationStatus.parse(j.stringOrNull('status')),
      isMine: j.boolOr('isMine', false),
      createdAt: j.dateTimeOrNull('createdAt'),
      updatedAt: j.dateTimeOrNull('updatedAt'),
    );
  }

  static Review fromData(Object? data) => tryParse(data) ?? (throw const FormatException('Invalid review'));
}

@immutable
class RatingBucket {
  const RatingBucket({required this.rating, required this.count});

  final int rating;
  final int count;
}

@immutable
class DimensionAverage {
  const DimensionAverage({required this.dimension, required this.label, required this.average, required this.count});

  final String dimension;
  final String label;

  /// `null` when nobody rated it (never 0).
  final double? average;
  final int count;
}

/// `GET /community/reviews/summary`.
@immutable
class ReviewSummary {
  const ReviewSummary({
    required this.count,
    this.average,
    this.distribution = const [],
    this.verifiedOwnerCount = 0,
    this.dimensions = const [],
  });

  final int count;

  /// `null` when there is no approved review.
  final double? average;

  /// 5 → 1.
  final List<RatingBucket> distribution;
  final int verifiedOwnerCount;
  final List<DimensionAverage> dimensions;

  bool get isEmpty => count == 0;

  static ReviewSummary fromData(Object? data) {
    final j = asJsonObject(data, 'summary');
    final dist = <RatingBucket>[
      if (j['distribution'] is List)
        for (final b in j['distribution'] as List)
          if (b is Map && asJsonObject(b).intOrNull('rating') != null)
            RatingBucket(rating: asJsonObject(b).intOrNull('rating')!, count: asJsonObject(b).intOrNull('count') ?? 0),
    ]..sort((a, b) => b.rating.compareTo(a.rating));
    final dims = <DimensionAverage>[
      if (j['dimensions'] is List)
        for (final d in j['dimensions'] as List)
          if (d is Map && asJsonObject(d).stringOrNull('dimension') != null)
            DimensionAverage(
              dimension: asJsonObject(d).stringOrNull('dimension')!,
              label: asJsonObject(d).stringOrNull('label') ?? asJsonObject(d).stringOrNull('dimension')!,
              average: asJsonObject(d).doubleOrNull('average'),
              count: asJsonObject(d).intOrNull('count') ?? 0,
            ),
    ];
    final count = j.intOrNull('count') ?? 0;
    return ReviewSummary(
      count: count,
      average: count == 0 ? null : j.doubleOrNull('average'),
      distribution: dist,
      verifiedOwnerCount: j.intOrNull('verifiedOwnerCount') ?? 0,
      dimensions: dims,
    );
  }
}

/// Review list sort (`sort=`).
enum ReviewSort {
  helpful('helpful'),
  recent('recent'),
  ratingHigh('rating_high'),
  ratingLow('rating_low');

  const ReviewSort(this.api);
  final String api;
}

/// Filters of the review list.
@immutable
class ReviewQuery {
  const ReviewQuery({required this.variantId, this.sort = ReviewSort.helpful, this.rating, this.verifiedOnly = false});

  final String variantId;
  final ReviewSort sort;
  final int? rating;
  final bool verifiedOnly;

  ReviewQuery copyWith({ReviewSort? sort, int? Function()? rating, bool? verifiedOnly}) => ReviewQuery(
    variantId: variantId,
    sort: sort ?? this.sort,
    rating: rating == null ? this.rating : rating(),
    verifiedOnly: verifiedOnly ?? this.verifiedOnly,
  );

  Map<String, dynamic> toQuery() => {
    'variantId': variantId,
    'sort': sort.api,
    'rating': ?rating,
    if (verifiedOnly) 'verifiedOnly': 'true',
  };

  @override
  bool operator ==(Object other) =>
      other is ReviewQuery &&
      other.variantId == variantId &&
      other.sort == sort &&
      other.rating == rating &&
      other.verifiedOnly == verifiedOnly;

  @override
  int get hashCode => Object.hash(variantId, sort, rating, verifiedOnly);
}

/// Body of `POST /community/reviews` / `PATCH /community/reviews/:id`.
@immutable
class ReviewDraft {
  const ReviewDraft({
    required this.rating,
    required this.body,
    this.title,
    this.pros,
    this.cons,
    this.ownershipMonths,
    this.ratings = const {},
    this.locale,
  });

  final int rating;
  final String body;
  final String? title;
  final String? pros;
  final String? cons;
  final int? ownershipMonths;

  /// dimension → 1..5.
  final Map<String, int> ratings;
  final String? locale;

  static String? _clean(String? s) {
    final t = s?.trim();
    return t == null || t.isEmpty ? null : t;
  }

  Map<String, dynamic> toCreateJson(String variantId) => {
    'variantId': variantId,
    ..._fields(forUpdate: false),
    'locale': ?locale,
  };

  /// PATCH: optional texts are sent as `null` to clear them.
  Map<String, dynamic> toUpdateJson() => _fields(forUpdate: true);

  Map<String, dynamic> _fields({required bool forUpdate}) {
    final title = _clean(this.title);
    final pros = _clean(this.pros);
    final cons = _clean(this.cons);
    return {
      'rating': rating,
      'body': body.trim(),
      if (forUpdate || title != null) 'title': title,
      if (forUpdate || pros != null) 'pros': pros,
      if (forUpdate || cons != null) 'cons': cons,
      if (forUpdate || ownershipMonths != null) 'ownershipMonths': ownershipMonths,
      if (forUpdate || ratings.isNotEmpty)
        'ratings': [
          for (final e in ratings.entries) {'dimension': e.key, 'score': e.value},
        ],
    };
  }
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

@immutable
class Comment implements CommunityPost {
  const Comment({
    required this.id,
    required this.target,
    required this.body,
    required this.author,
    this.parentId,
    this.votes = const Votes(),
    this.status = ModerationStatus.approved,
    this.isMine = false,
    this.replyCount = 0,
    this.replies = const [],
    this.editedAt,
    this.createdAt,
  });

  @override
  final String id;
  final TargetRef target;
  final String? parentId;
  final String body;
  @override
  final CommunityAuthor author;
  @override
  final Votes votes;
  @override
  final ModerationStatus status;
  @override
  final bool isMine;
  final int replyCount;

  /// First replies (oldest first) — up to 3 in list responses.
  final List<Comment> replies;
  final DateTime? editedAt;
  @override
  final DateTime? createdAt;

  @override
  String get voteType => CommunityTargetTypes.comment;

  bool get hasMoreReplies => replyCount > replies.length;

  Comment copyWith({Votes? votes, String? body, DateTime? editedAt, List<Comment>? replies, int? replyCount}) =>
      Comment(
        id: id,
        target: target,
        parentId: parentId,
        body: body ?? this.body,
        author: author,
        votes: votes ?? this.votes,
        status: status,
        isMine: isMine,
        replyCount: replyCount ?? this.replyCount,
        replies: replies ?? this.replies,
        editedAt: editedAt ?? this.editedAt,
        createdAt: createdAt,
      );

  static Comment? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('id');
    final target = TargetRef.tryParse(j['target']);
    final body = j.stringOrNull('body');
    if (id == null || target == null || body == null) return null;
    final replies = j['replies'] is List ? [for (final r in j['replies'] as List) ?Comment.tryParse(r)] : <Comment>[];
    return Comment(
      id: id,
      target: target,
      parentId: j.stringOrNull('parentId'),
      body: body,
      author: CommunityAuthor.fromJson(j.objectOrNull('author')),
      votes: Votes.fromJson(j.objectOrNull('votes')),
      status: ModerationStatus.parse(j.stringOrNull('status')),
      isMine: j.boolOr('isMine', false),
      replyCount: j.intOrNull('replyCount') ?? replies.length,
      replies: replies,
      editedAt: j.dateTimeOrNull('editedAt'),
      createdAt: j.dateTimeOrNull('createdAt'),
    );
  }

  static Comment fromData(Object? data) => tryParse(data) ?? (throw const FormatException('Invalid comment'));
}

enum CommentSort {
  newest('newest'),
  oldest('oldest'),
  top('top');

  const CommentSort(this.api);
  final String api;
}

/// A comment thread target (`targetType` ∈ article|review|model|variant).
@immutable
class CommentTarget {
  const CommentTarget(this.type, this.id);

  final String type;
  final String id;

  @override
  bool operator ==(Object other) => other is CommentTarget && other.type == type && other.id == id;

  @override
  int get hashCode => Object.hash(type, id);

  @override
  String toString() => '$type:$id';
}

// ---------------------------------------------------------------------------
// Questions & answers
// ---------------------------------------------------------------------------

@immutable
class Answer implements CommunityPost {
  const Answer({
    required this.id,
    required this.questionId,
    required this.body,
    required this.author,
    this.votes = const Votes(),
    this.isAccepted = false,
    this.status = ModerationStatus.approved,
    this.isMine = false,
    this.editedAt,
    this.createdAt,
  });

  @override
  final String id;
  final String questionId;
  final String body;
  @override
  final CommunityAuthor author;
  @override
  final Votes votes;
  final bool isAccepted;
  @override
  final ModerationStatus status;
  @override
  final bool isMine;
  final DateTime? editedAt;
  @override
  final DateTime? createdAt;

  @override
  String get voteType => CommunityTargetTypes.answer;

  Answer copyWith({Votes? votes, bool? isAccepted, String? body, DateTime? editedAt}) => Answer(
    id: id,
    questionId: questionId,
    body: body ?? this.body,
    author: author,
    votes: votes ?? this.votes,
    isAccepted: isAccepted ?? this.isAccepted,
    status: status,
    isMine: isMine,
    editedAt: editedAt ?? this.editedAt,
    createdAt: createdAt,
  );

  static Answer? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('id');
    final body = j.stringOrNull('body');
    if (id == null || body == null) return null;
    return Answer(
      id: id,
      questionId: j.stringOrNull('questionId') ?? '',
      body: body,
      author: CommunityAuthor.fromJson(j.objectOrNull('author')),
      votes: Votes.fromJson(j.objectOrNull('votes')),
      isAccepted: j.boolOr('isAccepted', false),
      status: ModerationStatus.parse(j.stringOrNull('status')),
      isMine: j.boolOr('isMine', false),
      editedAt: j.dateTimeOrNull('editedAt'),
      createdAt: j.dateTimeOrNull('createdAt'),
    );
  }

  static Answer fromData(Object? data) => tryParse(data) ?? (throw const FormatException('Invalid answer'));
}

@immutable
class Question implements CommunityPost {
  const Question({
    required this.id,
    required this.title,
    required this.author,
    this.target,
    this.body,
    this.locale,
    this.votes = const Votes(),
    this.answerCount = 0,
    this.acceptedAnswerId,
    this.status = ModerationStatus.approved,
    this.isMine = false,
    this.editedAt,
    this.createdAt,
    this.acceptedAnswer,
  });

  @override
  final String id;

  /// `null` = general question.
  final TargetRef? target;
  final String title;
  final String? body;
  final String? locale;
  @override
  final CommunityAuthor author;
  @override
  final Votes votes;
  final int answerCount;
  final String? acceptedAnswerId;
  @override
  final ModerationStatus status;
  @override
  final bool isMine;
  final DateTime? editedAt;
  @override
  final DateTime? createdAt;

  /// Only in the detail response.
  final Answer? acceptedAnswer;

  @override
  String get voteType => CommunityTargetTypes.question;

  bool get isAnswered => acceptedAnswerId != null;

  Question copyWith({Votes? votes}) => Question(
    id: id,
    title: title,
    author: author,
    target: target,
    body: body,
    locale: locale,
    votes: votes ?? this.votes,
    answerCount: answerCount,
    acceptedAnswerId: acceptedAnswerId,
    status: status,
    isMine: isMine,
    editedAt: editedAt,
    createdAt: createdAt,
    acceptedAnswer: acceptedAnswer,
  );

  static Question? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('id');
    final title = j.stringOrNull('title');
    if (id == null || title == null) return null;
    return Question(
      id: id,
      title: title,
      target: TargetRef.tryParse(j['target']),
      body: j.stringOrNull('body'),
      locale: j.stringOrNull('locale'),
      author: CommunityAuthor.fromJson(j.objectOrNull('author')),
      votes: Votes.fromJson(j.objectOrNull('votes')),
      answerCount: j.intOrNull('answerCount') ?? 0,
      acceptedAnswerId: j.stringOrNull('acceptedAnswerId'),
      status: ModerationStatus.parse(j.stringOrNull('status')),
      isMine: j.boolOr('isMine', false),
      editedAt: j.dateTimeOrNull('editedAt'),
      createdAt: j.dateTimeOrNull('createdAt'),
      acceptedAnswer: Answer.tryParse(j['acceptedAnswer']),
    );
  }

  static Question fromData(Object? data) => tryParse(data) ?? (throw const FormatException('Invalid question'));
}

enum QuestionSort {
  recent('recent'),
  votes('votes'),
  active('active');

  const QuestionSort(this.api);
  final String api;
}

/// Answered filter of the questions list.
enum AnsweredFilter { all, answered, unanswered }

@immutable
class QuestionQuery {
  const QuestionQuery({
    this.targetType,
    this.targetId,
    this.q,
    this.answered = AnsweredFilter.all,
    this.sort = QuestionSort.recent,
  });

  final String? targetType;
  final String? targetId;
  final String? q;
  final AnsweredFilter answered;
  final QuestionSort sort;

  QuestionQuery copyWith({String? Function()? q, AnsweredFilter? answered, QuestionSort? sort}) => QuestionQuery(
    targetType: targetType,
    targetId: targetId,
    q: q == null ? this.q : q(),
    answered: answered ?? this.answered,
    sort: sort ?? this.sort,
  );

  Map<String, dynamic> toQuery() {
    final text = q?.trim();
    return {
      if (targetType != null && targetId != null) ...{'targetType': targetType, 'targetId': targetId},
      if (text != null && text.isNotEmpty) 'q': text,
      if (answered == AnsweredFilter.answered) 'answered': 'true',
      if (answered == AnsweredFilter.unanswered) 'answered': 'false',
      'sort': sort.api,
    };
  }

  @override
  bool operator ==(Object other) =>
      other is QuestionQuery &&
      other.targetType == targetType &&
      other.targetId == targetId &&
      other.q == q &&
      other.answered == answered &&
      other.sort == sort;

  @override
  int get hashCode => Object.hash(targetType, targetId, q, answered, sort);
}

// ---------------------------------------------------------------------------
// Reports, status, mutes
// ---------------------------------------------------------------------------

/// `GET /community/report-reasons` item (labels localized by the server).
@immutable
class ReportReason {
  const ReportReason({required this.code, required this.label, this.description, this.requiresDetails = false});

  final String code;
  final String label;
  final String? description;
  final bool requiresDetails;

  static ReportReason? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final code = j.stringOrNull('code');
    if (code == null) return null;
    return ReportReason(
      code: code,
      label: j.stringOrNull('label') ?? code,
      description: j.stringOrNull('description'),
      requiresDetails: j.boolOr('requiresDetails', false),
    );
  }
}

/// A moderator block ("ban") on the current user.
@immutable
class CommunityBlock {
  const CommunityBlock({required this.scope, this.reason, this.expiresAt});

  final String scope;
  final String? reason;

  /// `null` = until further notice.
  final DateTime? expiresAt;

  static CommunityBlock? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    return CommunityBlock(
      scope: j.stringOrNull('scope') ?? 'community',
      reason: j.stringOrNull('reason'),
      expiresAt: j.dateTimeOrNull('expiresAt'),
    );
  }
}

/// `GET /me/community/status`.
@immutable
class CommunityStatus {
  const CommunityStatus({
    required this.canPost,
    required this.emailVerified,
    this.isNewAccount = false,
    this.newAccountUntil,
    this.block,
  });

  final bool canPost;
  final bool emailVerified;
  final bool isNewAccount;
  final DateTime? newAccountUntil;
  final CommunityBlock? block;

  static CommunityStatus fromData(Object? data) {
    final j = asJsonObject(data, 'status');
    return CommunityStatus(
      canPost: j.boolOr('canPost', false),
      emailVerified: j.boolOr('emailVerified', false),
      isNewAccount: j.boolOr('isNewAccount', false),
      newAccountUntil: j.dateTimeOrNull('newAccountUntil'),
      block: CommunityBlock.tryParse(j['block']),
    );
  }
}

/// `PUT /me/mutes/:userId` / `GET /me/mutes` item.
@immutable
class MutedUser {
  const MutedUser({required this.userId, required this.displayName, this.mutedAt});

  final String userId;
  final String displayName;
  final DateTime? mutedAt;

  static MutedUser? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('userId');
    if (id == null) return null;
    return MutedUser(
      userId: id,
      displayName: j.stringOrNull('displayName') ?? '',
      mutedAt: j.dateTimeOrNull('mutedAt'),
    );
  }
}

// ---------------------------------------------------------------------------
// Targets resolved from route slugs
// ---------------------------------------------------------------------------

/// One trim of a car, as needed by the community screens (from `GET /cars/:slug`).
@immutable
class CommunityTrim {
  const CommunityTrim({
    required this.id,
    required this.slug,
    required this.name,
    this.modelYear,
    this.powertrain,
    this.isDemo = false,
  });

  final String id;
  final String slug;
  final String name;
  final int? modelYear;
  final String? powertrain;
  final bool isDemo;

  /// "2025 · Standard · BEV".
  String get label => [
    if (modelYear != null) '$modelYear',
    name,
    if (powertrain != null && powertrain!.isNotEmpty) powertrain!,
  ].join(' · ');
}

/// A car model resolved from its slug (`GET /cars/:slug`).
@immutable
class CommunityCar {
  const CommunityCar({
    required this.id,
    required this.slug,
    required this.title,
    this.trims = const [],
    this.defaultTrimId,
    this.isDemo = false,
  });

  final String id;
  final String slug;
  final String title;
  final List<CommunityTrim> trims;
  final String? defaultTrimId;
  final bool isDemo;

  /// Finds a trim by id or slug.
  CommunityTrim? trim(String? idOrSlug) {
    if (idOrSlug == null) return null;
    for (final t in trims) {
      if (t.id == idOrSlug || t.slug == idOrSlug) return t;
    }
    return null;
  }

  /// [preferred] (id or slug) → the server default → the newest trim.
  CommunityTrim? initialTrim(String? preferred) =>
      trim(preferred) ?? trim(defaultTrimId) ?? (trims.isEmpty ? null : trims.first);

  static CommunityCar fromData(Object? data) {
    final j = asJsonObject(data, 'car');
    final id = j.stringOrNull('id');
    final slug = j.stringOrNull('slug');
    if (id == null || slug == null) throw const FormatException('Invalid car');
    final brand = j.objectOrNull('brand')?.stringOrNull('name');
    final name = j.stringOrNull('name') ?? slug;
    final trims = <CommunityTrim>[];
    final seen = <String>{};
    final gens = j['generations'];
    if (gens is List) {
      for (final g in gens.whereType<Map<dynamic, dynamic>>()) {
        final years = g['years'];
        if (years is! List) continue;
        for (final y in years.whereType<Map<dynamic, dynamic>>()) {
          final yj = asJsonObject(y);
          final vs = yj['variants'];
          if (vs is! List) continue;
          for (final v in vs.whereType<Map<dynamic, dynamic>>()) {
            final vj = asJsonObject(v);
            final vid = vj.stringOrNull('id');
            final vslug = vj.stringOrNull('slug');
            if (vid == null || vslug == null || !seen.add(vid)) continue;
            final local = vj.stringOrNull('localName');
            trims.add(
              CommunityTrim(
                id: vid,
                slug: vslug,
                name: (local != null && local.trim().isNotEmpty) ? local : (vj.stringOrNull('name') ?? vslug),
                modelYear: vj.intOrNull('modelYear') ?? yj.intOrNull('year'),
                powertrain: vj.stringOrNull('powertrainType'),
                isDemo: vj.boolOr('isDemo', false),
              ),
            );
          }
        }
      }
    }
    trims.sort((a, b) => (b.modelYear ?? 0).compareTo(a.modelYear ?? 0));
    return CommunityCar(
      id: id,
      slug: slug,
      title: j.stringOrNull('title') ?? (brand == null ? name : '$brand $name'),
      trims: trims,
      defaultTrimId: j.stringOrNull('defaultVariantId'),
      isDemo: j.boolOr('isDemo', false),
    );
  }
}

/// An article resolved from its slug (`GET /articles/:slug`).
@immutable
class CommunityArticle {
  const CommunityArticle({
    required this.id,
    required this.slug,
    required this.title,
    this.allowComments = false,
    this.isDemo = false,
  });

  final String id;
  final String slug;
  final String title;
  final bool allowComments;
  final bool isDemo;

  static CommunityArticle fromData(Object? data) {
    final j = asJsonObject(data, 'article');
    final id = j.stringOrNull('id');
    if (id == null) throw const FormatException('Invalid article');
    return CommunityArticle(
      id: id,
      slug: j.stringOrNull('slug') ?? id,
      title: j.stringOrNull('title') ?? '',
      allowComments: j.boolOr('allowComments', false),
      isDemo: j.boolOr('isDemo', false),
    );
  }
}
