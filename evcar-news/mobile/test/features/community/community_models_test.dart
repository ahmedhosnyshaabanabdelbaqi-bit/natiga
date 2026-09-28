import 'package:evcar_news/core/api/api_exception.dart';
import 'package:evcar_news/features/community/domain/community_models.dart';
import 'package:evcar_news/features/community/presentation/community_routes.dart';
import 'package:evcar_news/features/community/presentation/widgets/community_ui.dart';
import 'package:evcar_news/l10n/generated/app_localizations_en.dart';
import 'package:flutter_test/flutter_test.dart';

import 'community_fixtures.dart';

void main() {
  group('parsing real responses', () {
    test('review list item', () {
      final items = fixtureData('reviews')! as List;
      final r = Review.tryParse(items.first)!;
      expect(r.rating, 4);
      expect(r.target, const TargetRef(type: 'variant', id: demoVariantId));
      expect(r.title, 'Test review title');
      expect(r.pros, 'Quiet cabin');
      expect(r.cons, isNull, reason: 'missing stays null');
      expect(r.ownershipMonths, 8);
      expect(r.ratings.map((d) => d.dimension), ['charging', 'comfort']);
      expect(r.verifiedOwner, isFalse);
      expect(r.verifiedOwnerLabel, isNull);
      expect(r.status, ModerationStatus.approved);
      expect(r.author.displayName, 'Sara');
      expect(r.votes.myVote, isNull);
    });

    test('verified owner label is ignored unless verifiedOwner is true', () {
      final json = copyJson((fixtureData('reviews')! as List).first as Map<String, dynamic>)
        ..['verifiedOwner'] = false
        ..['verifiedOwnerLabel'] = 'Verified owner';
      expect(Review.tryParse(json)!.verifiedOwnerLabel, isNull);
      json
        ..['verifiedOwner'] = 'yes'
        ..['verifiedOwnerLabel'] = 'Verified owner';
      expect(Review.tryParse(json)!.verifiedOwner, isFalse, reason: 'only a real boolean true counts');
      json['verifiedOwner'] = true;
      final verified = Review.tryParse(json)!;
      expect(verified.verifiedOwner, isTrue);
      expect(verified.verifiedOwnerLabel, 'Verified owner');
    });

    test('created review is pending', () {
      expect(Review.fromData(fixtureData('create_review')).status, ModerationStatus.pending);
    });

    test('summary keeps unrated dimensions null (never 0)', () {
      final s = ReviewSummary.fromData(fixtureData('summary'));
      expect(s.count, 1);
      expect(s.average, 4);
      expect(s.distribution.map((b) => b.rating), [5, 4, 3, 2, 1]);
      expect(s.distribution.firstWhere((b) => b.rating == 4).count, 1);
      final range = s.dimensions.firstWhere((d) => d.dimension == 'range_real_world');
      expect(range.average, isNull);
      expect(range.count, 0);
      expect(s.dimensions.firstWhere((d) => d.dimension == 'comfort').average, 5);
    });

    test('empty summary has no average even if the server sent 0', () {
      final s = ReviewSummary.fromData({'count': 0, 'average': 0, 'distribution': [], 'dimensions': []});
      expect(s.isEmpty, isTrue);
      expect(s.average, isNull);
    });

    test('comments with replies', () {
      final list = (fixtureData('comments')! as List).map(Comment.tryParse).whereType<Comment>().toList();
      expect(list, hasLength(1));
      final c = list.single;
      expect(c.replyCount, 1);
      expect(c.replies.single.parentId, c.id);
      expect(c.replies.single.isMine, isTrue);
      expect(c.votes, const Votes(up: 1, myVote: 1));
      expect(c.hasMoreReplies, isFalse);
    });

    test('question detail with accepted answer', () {
      final q = Question.fromData(fixtureData('question'));
      expect(q.isAnswered, isTrue);
      expect(q.target!.type, 'model');
      expect(q.acceptedAnswer!.isAccepted, isTrue);
      expect(q.answerCount, 1);
    });

    test('answers, report reasons, status, mutes', () {
      final a = Answer.tryParse((fixtureData('answers')! as List).single)!;
      expect(a.body, 'Test answer from Sara');
      final reasons = (fixtureData('reasons_en')! as List).map(ReportReason.tryParse).whereType<ReportReason>();
      expect(reasons.map((r) => r.code), contains('other'));
      expect(reasons.firstWhere((r) => r.code == 'other').requiresDetails, isTrue);
      final st = CommunityStatus.fromData(fixtureData('status'));
      expect(st.canPost, isTrue);
      expect(st.block, isNull);
      final m = MutedUser.tryParse((fixtureData('mutes')! as List).single)!;
      expect(m.userId, saraId);
    });

    test('car → trims (newest year first), article → id + allowComments', () {
      final car = CommunityCar.fromData(fixtureData('car'));
      expect(car.id, demoModelId);
      expect(car.isDemo, isTrue);
      expect(car.trims, hasLength(2));
      expect(car.initialTrim(null)!.id, demoVariantId, reason: 'server default trim');
      expect(car.initialTrim('demo-ev-one-2025-standard-phev')!.powertrain, 'PHEV');
      expect(car.initialTrim('unknown')!.id, demoVariantId);
      final article = CommunityArticle.fromData(fixtureData('article'));
      expect(article.id, demoArticleId);
      expect(article.isDemo, isTrue);
    });

    test('malformed items are skipped', () {
      expect(Review.tryParse({'id': 'x'}), isNull);
      expect(Comment.tryParse('nope'), isNull);
      expect(Question.tryParse({'id': 'q'}), isNull);
      expect(CommunityAuthor.fromJson(null).isDeleted, isTrue);
      expect(CommunityAuthor.fromJson({'id': null, 'displayName': 'Deleted user', 'isDeleted': true}).id, isNull);
    });
  });

  group('behaviour', () {
    test('optimistic votes', () {
      const v = Votes(up: 3, down: 1);
      expect(v.applying(1), const Votes(up: 4, down: 1, myVote: 1));
      expect(v.applying(1).applying(-1), const Votes(up: 3, down: 2, myVote: -1));
      expect(v.applying(1).applying(0), const Votes(up: 3, down: 1));
      expect(const Votes().applying(0), const Votes());
    });

    test('review draft JSON: create omits empty optionals, update clears them', () {
      const draft = ReviewDraft(
        rating: 5,
        body: '  A long enough body text here.  ',
        title: ' ',
        pros: 'Quiet',
        ratings: {'comfort': 4},
      );
      final create = draft.toCreateJson('v1');
      expect(create, {
        'variantId': 'v1',
        'rating': 5,
        'body': 'A long enough body text here.',
        'pros': 'Quiet',
        'ratings': [
          {'dimension': 'comfort', 'score': 4},
        ],
      });
      final update = draft.toUpdateJson();
      expect(update['title'], isNull);
      expect(update.containsKey('title'), isTrue);
      expect(update.containsKey('cons'), isTrue);
      expect(update.containsKey('variantId'), isFalse);
    });

    test('question query', () {
      const q = QuestionQuery(targetType: 'model', targetId: 'm1', q: ' range ', answered: AnsweredFilter.unanswered);
      expect(q.toQuery(), {
        'targetType': 'model',
        'targetId': 'm1',
        'q': 'range',
        'answered': 'false',
        'sort': 'recent',
      });
      expect(const QuestionQuery().toQuery(), {'sort': 'recent'});
    });

    test('review query', () {
      const q = ReviewQuery(variantId: 'v', rating: 5, verifiedOnly: true);
      expect(q.toQuery(), {'variantId': 'v', 'sort': 'helpful', 'rating': 5, 'verifiedOnly': 'true'});
      expect(q.copyWith(rating: () => null).toQuery().containsKey('rating'), isFalse);
    });

    test('initials', () {
      expect(const CommunityAuthor(id: '1', displayName: 'sara ali').initials, 'SA');
      expect(const CommunityAuthor(id: '1', displayName: 'عمر').initials, 'ع');
      expect(const CommunityAuthor(id: '1', displayName: ' ').initials, '?');
    });

    test('routes with query parameters', () {
      expect(CommunityRoutes.writeReview('ev one', variant: 'v1'), '/cars/ev%20one/reviews/new?variant=v1');
      expect(CommunityRoutes.carReviews('x'), '/cars/x/reviews');
      expect(CommunityRoutes.ask(modelSlug: 'x'), '/questions/ask?model=x');
    });

    test('error messages', () {
      final l10n = AppLocalizationsEn();
      expect(
        communityErrorMessage(
          l10n,
          const ApiException(
            kind: ApiErrorKind.rateLimited,
            code: 'COMMUNITY_RATE_LIMITED',
            details: {'retryAfterSeconds': 125},
          ),
        ),
        'You\'ve posted a lot in a short time. Try again in 3 minutes.',
      );
      expect(
        communityErrorMessage(l10n, const ApiException(kind: ApiErrorKind.forbidden, code: 'EMAIL_NOT_VERIFIED')),
        l10n.communityErrEmailNotVerified,
      );
      expect(
        communityErrorMessage(
          l10n,
          const ApiException(
            kind: ApiErrorKind.conflict,
            code: 'COMMUNITY_DUPLICATE_CONTENT',
            message: 'Server says dup',
          ),
        ),
        'Server says dup',
        reason: 'server messages are already localized',
      );
    });
  });
}
