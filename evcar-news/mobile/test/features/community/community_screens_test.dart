import 'dart:convert';

import 'package:evcar_news/app/router/app_router.dart';
import 'package:evcar_news/app/router/app_routes.dart';
import 'package:evcar_news/core/app_config/app_config_controller.dart';
import 'package:evcar_news/core/app_config/features.dart';
import 'package:evcar_news/core/auth/auth_tokens.dart';
import 'package:evcar_news/core/auth/token_storage.dart';
import 'package:evcar_news/features/community/domain/community_models.dart';
import 'package:evcar_news/features/community/presentation/community_routes.dart';
import 'package:evcar_news/features/community/presentation/widgets/comments_section.dart';
import 'package:evcar_news/shared/widgets/image_with_fallback.dart';
import 'package:evcar_news/shared/widgets/sign_in_required_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/kit_harness.dart';
import '../../helpers/test_app.dart';
import 'community_fixtures.dart';

/// Fake backend built from captured responses; records write bodies.
class _Server {
  _Server({this.userId}) {
    final a = adapter;
    a.on('GET /cars/$demoCarSlug', (_) => FakeResponse.json(200, communityFixture('car')));
    a.on('GET /articles/$demoArticleSlug', (_) => FakeResponse.json(200, article));
    a.on('GET /community/reviews/summary', (r) {
      summaryRequests.add(r.queryParameters);
      return FakeResponse.json(200, summary);
    });
    a.on('GET /community/reviews', (r) {
      reviewRequests.add(r.queryParameters);
      return FakeResponse.json(200, reviews);
    });
    a.on('GET /comments', (r) => FakeResponse.json(200, comments));
    a.on('GET /questions', (r) {
      questionRequests.add(r.queryParameters);
      return FakeResponse.json(200, communityFixture('questions'));
    });
    final q = (fixtureData('question')! as Map)['id'] as String;
    questionId = q;
    a.on('GET /questions/$q', (_) => FakeResponse.json(200, question));
    a.on('GET /questions/$q/answers', (_) => FakeResponse.json(200, communityFixture('answers')));
    a.on('GET /community/report-reasons', (_) => FakeResponse.json(200, communityFixture('reasons_en')));
    a.on('GET /me/community/status', (_) => FakeResponse.json(200, {'data': status}));
    a.on(
      'GET /me/community/content',
      (_) => FakeResponse.json(200, {
        'data': <Object>[],
        'meta': {'page': 1, 'totalPages': 1},
      }),
    );
    if (userId != null) {
      a.on('GET /me', (_) => FakeResponse.json(200, {'data': fakeUserJson(id: userId!, displayName: 'Me')}));
    }
    a.on('POST /community/reports', (r) {
      writes.add(('POST /community/reports', r.data));
      return FakeResponse.json(201, communityFixture('report'));
    });
    a.on('POST /community/votes', (r) {
      writes.add(('POST /community/votes', r.data));
      final body = r.data as Map;
      return FakeResponse.json(200, {
        'data': {
          'targetType': body['targetType'],
          'targetId': body['targetId'],
          'votes': {'up': 2, 'down': 0, 'score': 2, 'myVote': body['value'] == 0 ? null : body['value']},
        },
      });
    });
    a.on('POST /comments', (r) {
      writes.add(('POST /comments', r.data));
      return FakeResponse.json(201, createdComment);
    });
    a.on('POST /community/reviews', (r) {
      writes.add(('POST /community/reviews', r.data));
      return reviewCreateResponse;
    });
    a.on('POST /questions', (r) {
      writes.add(('POST /questions', r.data));
      return FakeResponse.json(201, communityFixture('create_question'));
    });
    a.on('POST /questions/$q/answers', (r) {
      writes.add(('POST answers', r.data));
      return FakeResponse.json(201, communityFixture('create_answer'));
    });
    a.on('POST /questions/$q/accept', (r) {
      writes.add(('POST accept', r.data));
      final json = copyJson(question);
      final d = json['data'] as Map<String, dynamic>;
      d['acceptedAnswerId'] = null;
      d['acceptedAnswer'] = null;
      return FakeResponse.json(200, json);
    });
  }

  final String? userId;
  final adapter = FakeHttpAdapter();
  late final String questionId;
  final summaryRequests = <Map<String, dynamic>>[];
  final reviewRequests = <Map<String, dynamic>>[];
  final questionRequests = <Map<String, dynamic>>[];
  final writes = <(String, Object?)>[];

  Map<String, dynamic> summary = communityFixture('summary');
  Map<String, dynamic> reviews = communityFixture('reviews');
  Map<String, dynamic> comments = communityFixture('comments');
  Map<String, dynamic> article = communityFixture('article');
  Map<String, dynamic> question = communityFixture('question');
  Map<String, dynamic> status = copyJson(fixtureData('status')! as Map<String, dynamic>);
  Map<String, dynamic> createdComment = communityFixture('create_comment');
  FakeResponse reviewCreateResponse = FakeResponse.json(201, communityFixture('create_review'));

  void on(String route, FakeHandler handler) => adapter.on(route, handler);

  Object? lastWrite(String key) => writes.lastWhere((w) => w.$1 == key).$2;
}

Future<_Server> _pump(
  WidgetTester tester, {
  required String location,
  String language = 'en',
  String? userId,
  double textScale = 1,
  bool dark = false,
  void Function(_Server server)? setup,
}) async {
  tester.view.physicalSize = const Size(360, 780) * 3;
  tester.view.devicePixelRatio = 3;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  if (dark) tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearAllTestValues);
  final server = _Server(userId: userId);
  setup?.call(server);
  await pumpTestApp(
    tester,
    language: language,
    adapter: server.adapter,
    features: allFeaturesOn,
    tokens: userId == null ? null : InMemoryTokenStorage(const AuthTokens(accessToken: 'a', refreshToken: 'r')),
    prefs: dark ? const {'settings.themeMode': 'dark'} : const {},
    extraOverrides: [networkImageProviderFactory.overrideWithValue((_) => const FailingImage())],
  );
  tester.container().read(routerProvider).go(location);
  await tester.pumpAndSettle();
  return server;
}

Finder _mainList() =>
    find.byWidgetPredicate((w) => w is Scrollable && axisDirectionToAxis(w.axisDirection) == Axis.vertical).first;

Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  // A focused text field would scroll itself back into view.
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.pumpAndSettle();
  if (tester.any(finder)) {
    await tester.ensureVisible(finder.first);
  } else {
    await tester.scrollUntilVisible(finder, 200, scrollable: _mainList());
  }
  await tester.pumpAndSettle();
}

/// Lets a request started without an animation running complete.
Future<void> _settleNetwork(WidgetTester tester) async {
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
  await tester.pumpAndSettle();
}

Map<String, dynamic> _body(Object? data) =>
    data is String ? jsonDecode(data) as Map<String, dynamic> : Map<String, dynamic>.from(data! as Map);

/// testWidgets + flush the zero-delay transport timers of requests started in
/// the last frame (other features' screens below the route also fetch).
void _test(String name, Future<void> Function(WidgetTester tester) body) {
  testWidgets(name, (tester) async {
    await body(tester);
    await tester.pump(const Duration(seconds: 1));
  });
}

void main() {
  group('owner reviews', () {
    _test('summary, list, not-available dimensions, no unearned badge', (tester) async {
      final server = await _pump(tester, location: AppRoutes.carReviews(demoCarSlug));
      expect(server.summaryRequests.single['variantId'], demoVariantId, reason: 'server default trim');
      expect(find.text('4.0'), findsOneWidget);
      expect(find.text('1 review'), findsOneWidget);
      expect(find.text('Not available'), findsWidgets, reason: 'unrated aspects are not 0');
      expect(find.textContaining('demo data'), findsWidgets, reason: 'the demo car is labelled');
      await _scrollTo(tester, find.text('Test review title'));
      expect(find.text('Test review title'), findsOneWidget);
      expect(find.text('Owned 8 months'), findsOneWidget);
      expect(find.text('Verified owner'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    _test('verified owner badge only when the API says so', (tester) async {
      await _pump(
        tester,
        location: AppRoutes.carReviews(demoCarSlug),
        setup: (s) {
          final item = ((s.reviews['data'] as List).first as Map<String, dynamic>);
          item['verifiedOwner'] = true;
          item['verifiedOwnerLabel'] = 'Verified owner';
        },
      );
      await _scrollTo(tester, find.text('Test review title'));
      expect(find.text('Verified owner'), findsOneWidget);
    });

    _test('empty trim: honest empty state, no averages', (tester) async {
      await _pump(
        tester,
        location: AppRoutes.carReviews(demoCarSlug),
        setup: (s) {
          s.summary = {
            'data': {
              'target': null,
              'count': 0,
              'average': null,
              'distribution': [],
              'verifiedOwnerCount': 0,
              'dimensions': [],
            },
          };
          s.reviews = {
            'data': <Object>[],
            'meta': {'page': 1, 'totalPages': 0, 'total': 0},
          };
        },
      );
      expect(find.text('No owner reviews yet'), findsOneWidget);
      expect(find.text('Be the first to review'), findsOneWidget);
      expect(find.text('0.0'), findsNothing);
    });

    _test('trim selector switches the reviewed trim', (tester) async {
      final server = await _pump(tester, location: CommunityRoutes.carReviews(demoCarSlug));
      await tester.tap(find.bySemanticsLabel(RegExp('^Trim: ')));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('PHEV').last);
      await tester.pumpAndSettle();
      expect(server.summaryRequests.last['variantId'], 'd0000000-0000-4000-8000-000000000015');
    });

    _test('filters are sent to the server', (tester) async {
      final server = await _pump(tester, location: AppRoutes.carReviews(demoCarSlug));
      await _scrollTo(tester, find.text('Verified owners only'));
      await tester.tap(find.text('Verified owners only'));
      await tester.pumpAndSettle();
      expect(server.reviewRequests.last['verifiedOnly'], 'true');
      expect(server.reviewRequests.last['sort'], 'helpful');
    });

    _test('guests must sign in to write', (tester) async {
      await _pump(tester, location: AppRoutes.writeCarReview(demoCarSlug));
      expect(find.byType(SignInRequiredView), findsOneWidget);
    });

    _test('unverified e-mail and moderator block are explained', (tester) async {
      await _pump(
        tester,
        location: AppRoutes.writeCarReview(demoCarSlug),
        userId: saraId,
        setup: (s) => s.status = {'canPost': false, 'emailVerified': false, 'isNewAccount': false, 'block': null},
      );
      expect(find.text('Verify your e-mail first'), findsOneWidget);
      expect(find.text('Submit for review'), findsNothing);
    });

    _test('blocked user sees reason and end date', (tester) async {
      await _pump(
        tester,
        location: AppRoutes.writeCarReview(demoCarSlug),
        userId: saraId,
        setup: (s) => s.status = {
          'canPost': false,
          'emailVerified': true,
          'isNewAccount': false,
          'block': {'scope': 'community', 'reason': 'Spam links', 'expiresAt': '2026-10-05T10:00:00.000Z'},
        },
      );
      expect(find.text('Posting is paused for your account'), findsOneWidget);
      expect(find.textContaining('Reason: Spam links'), findsOneWidget);
      expect(find.textContaining('until'), findsOneWidget);
    });

    _test('write a review: validation, body sent, pending confirmation', (tester) async {
      final server = await _pump(
        tester,
        location: CommunityRoutes.writeReview(demoCarSlug, variant: demoVariantId),
        userId: saraId,
      );
      expect(find.textContaining('Moderators check every review'), findsOneWidget);
      expect(find.textContaining('badge can\'t be chosen'), findsOneWidget);
      await _scrollTo(tester, find.text('Submit for review'));
      await tester.tap(find.text('Submit for review'));
      await tester.pumpAndSettle();
      expect(server.writes, isEmpty, reason: 'rating + body are required');
      expect(find.text('Choose a rating from 1 to 5 stars.'), findsOneWidget);
      await _scrollTo(tester, find.byTooltip('4 stars'));
      await tester.tap(find.byTooltip('4 stars').first);
      await tester.pumpAndSettle();
      expect(find.text('Very good'), findsOneWidget);
      final body = find.widgetWithText(
        TextFormField,
        'How do you use the car? What range do you really get? How are charging and servicing?',
      );
      await tester.enterText(body, 'Twelve months of daily commuting, very quiet and smooth.');
      await tester.enterText(find.widgetWithText(TextFormField, 'e.g. 8'), '12');
      await _scrollTo(tester, find.text('Submit for review'));
      await tester.tap(find.text('Submit for review'));
      await tester.pumpAndSettle();
      final sent = _body(server.lastWrite('POST /community/reviews'));
      expect(sent['variantId'], demoVariantId);
      expect(sent['rating'], 4);
      expect(sent['ownershipMonths'], 12);
      expect(sent['body'], 'Twelve months of daily commuting, very quiet and smooth.');
      expect(sent.containsKey('verifiedOwner'), isFalse, reason: 'clients never send the badge');
      expect(find.text('Review received'), findsOneWidget);
    });

    _test('existing review → offer to edit it', (tester) async {
      await _pump(
        tester,
        location: CommunityRoutes.writeReview(demoCarSlug),
        userId: saraId,
        setup: (s) => s.reviewCreateResponse = FakeResponse.error(
          409,
          'COMMUNITY_REVIEW_EXISTS',
          message: 'exists',
          details: {'existingId': 'r-existing'},
        ),
      );
      await _scrollTo(tester, find.byTooltip('5 stars'));
      await tester.tap(find.byTooltip('5 stars').first);
      await tester.enterText(
        find.widgetWithText(
          TextFormField,
          'How do you use the car? What range do you really get? How are charging and servicing?',
        ),
        'A body that is certainly long enough.',
      );
      await _scrollTo(tester, find.text('Submit for review'));
      await tester.tap(find.text('Submit for review'));
      await tester.pumpAndSettle();
      expect(find.text('You already reviewed this trim'), findsOneWidget);
    });
  });

  group('comments', () {
    _test('guests read threads and are asked to sign in to reply', (tester) async {
      await _pump(tester, location: AppRoutes.articleComments(demoArticleSlug));
      expect(find.text('Comments (1)'), findsOneWidget);
      expect(find.text('Join the conversation'), findsOneWidget);
      await _scrollTo(tester, find.text('Test comment from Omar'));
      expect(find.text('Test reply from Sara'), findsOneWidget);
      expect(find.text('Sign in to comment or reply.'), findsOneWidget, reason: 'the composer card');
      await tester.tap(find.text('Reply').first);
      await tester.pumpAndSettle();
      expect(find.text('Sign in to comment or reply.'), findsNWidgets(2), reason: '+ the sign-in sheet');
    });

    _test('closed comments', (tester) async {
      await _pump(
        tester,
        location: AppRoutes.articleComments(demoArticleSlug),
        setup: (s) => (s.article['data'] as Map)['allowComments'] = false,
      );
      expect(find.text('Comments are closed here.'), findsOneWidget);
      expect(find.text('Join the conversation'), findsNothing);
    });

    _test('posting a held comment shows it with its moderation state', (tester) async {
      final server = await _pump(
        tester,
        location: AppRoutes.articleComments(demoArticleSlug),
        userId: saraId,
        setup: (s) {
          (s.article['data'] as Map)['allowComments'] = true;
          final d = s.createdComment['data'] as Map<String, dynamic>;
          d['status'] = 'pending';
          d['id'] = 'new-comment';
          d['body'] = 'Held comment with a link';
          d['author'] = {'id': saraId, 'displayName': 'Sara', 'isDeleted': false};
        },
      );
      await tester.enterText(find.byType(TextField).first, 'Held comment with a link');
      await tester.tap(find.text('Send'));
      await tester.pumpAndSettle();
      final sent = _body(server.lastWrite('POST /comments'));
      expect(sent, {'targetType': 'article', 'targetId': demoArticleId, 'body': 'Held comment with a link'});
      await _scrollTo(tester, find.text('Awaiting review'));
      expect(find.text('Only you can see this until a moderator approves it.'), findsOneWidget);
    });

    _test('vote, report and block from a comment', (tester) async {
      final server = await _pump(tester, location: AppRoutes.articleComments(demoArticleSlug), userId: saraId);
      await _scrollTo(tester, find.text('Test comment from Omar'));
      // Omar's comment: Sara already voted helpful → tapping removes the vote.
      await tester.tap(find.bySemanticsLabel(RegExp('^Helpful, 1 vote')).first);
      await tester.pumpAndSettle();
      expect(_body(server.lastWrite('POST /community/votes'))['value'], 0);

      await tester.tap(find.byTooltip('More actions').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Report'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Spam or advertising'));
      await tester.pumpAndSettle();
      await _scrollTo(tester, find.text('Send report'));
      await tester.tap(find.text('Send report'));
      await tester.pumpAndSettle();
      final report = _body(server.lastWrite('POST /community/reports'));
      expect(report['targetType'], 'comment');
      expect(report['reason'], 'spam');
      expect(find.text('Thanks — your report reached the moderators.'), findsOneWidget);

      server.on('PUT /me/mutes/$omarId', (r) {
        server.writes.add(('PUT mute', null));
        return FakeResponse.json(200, {'data': (fixtureData('mutes')! as List).single});
      });
      server.comments = {
        'data': <Object>[],
        'meta': {'page': 1, 'totalPages': 0, 'total': 0},
      };
      await tester.tap(find.byTooltip('More actions').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Block this user'));
      await tester.pumpAndSettle();
      expect(find.text('Block Omar?'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Block'));
      await _settleNetwork(tester);
      expect(server.writes.any((w) => w.$1 == 'PUT mute'), isTrue);
      expect(find.text('Test comment from Omar'), findsNothing);
      expect(find.text('Omar blocked'), findsOneWidget);
    });

    _test('CommentsSection renders nothing when the feature is off', (tester) async {
      await pumpKit(
        tester,
        const CommentsSection(targetType: CommunityTargetTypes.article, targetId: 'x'),
        overrides: [featureFlagProvider(Features.community).overrideWithValue(false)],
      );
      expect(find.text('Comments'), findsNothing);
      expect(find.byType(TextField), findsNothing);
    });
  });

  group('questions', () {
    _test('list filtered by car, search and answered filter', (tester) async {
      final server = await _pump(tester, location: AppRoutes.questions(model: demoCarSlug));
      expect(server.questionRequests.last['targetType'], 'model');
      expect(server.questionRequests.last['targetId'], demoModelId);
      expect(find.text('Test question about home charging?'), findsOneWidget);
      expect(find.text('Answered'), findsWidgets);
      await _scrollTo(tester, find.text('Unanswered'));
      await tester.tap(find.text('Unanswered'));
      await tester.pumpAndSettle();
      expect(server.questionRequests.last['answered'], 'false');
      await tester.enterText(find.byType(TextField).first, 'range');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(server.questionRequests.last['q'], 'range');
    });

    _test('detail: accepted answer pinned, asker can remove acceptance, answer posting', (tester) async {
      final server = await _pump(tester, location: AppRoutes.question('x'), userId: omarId, setup: (_) {});
      tester.container().read(routerProvider).go(AppRoutes.question(server.questionId));
      await tester.pumpAndSettle();
      expect(find.text('Test question about home charging?'), findsOneWidget);
      await _scrollTo(tester, find.text('Accepted answer'));
      expect(find.text('Test answer from Sara'), findsOneWidget);
      await _scrollTo(tester, find.text('Remove acceptance'));
      await tester.tap(find.text('Remove acceptance'));
      await tester.pumpAndSettle();
      expect(_body(server.lastWrite('POST accept')), {'answerId': null});
      expect(find.text('Accepted answer'), findsNothing);

      await _scrollTo(tester, find.text('Post answer'));
      await tester.enterText(find.byType(TextField).last, 'My own follow-up');
      await tester.tap(find.text('Post answer'));
      await tester.pumpAndSettle();
      expect(_body(server.lastWrite('POST answers')), {'body': 'My own follow-up'});
    });

    _test('a question that is not public is "not available"', (tester) async {
      await _pump(
        tester,
        location: AppRoutes.question('hidden-one'),
        setup: (s) => s.on('GET /questions/hidden-one', (_) => FakeResponse.error(404, 'NOT_FOUND', message: 'nope')),
      );
      expect(find.text('Question not available'), findsOneWidget);
    });

    _test('ask: guest → sign in; signed in → posts with the car as target', (tester) async {
      await _pump(tester, location: AppRoutes.askQuestion);
      expect(find.byType(SignInRequiredView), findsOneWidget);
    });

    _test('ask about a car', (tester) async {
      final server = await _pump(
        tester,
        location: CommunityRoutes.ask(modelSlug: demoCarSlug),
        userId: omarId,
      );
      expect(find.textContaining('About: '), findsOneWidget);
      await tester.enterText(find.byType(TextFormField).first, 'Short');
      await tester.tap(find.text('Post question'));
      await tester.pumpAndSettle();
      expect(find.text('Write at least 10 characters.'), findsOneWidget);
      await tester.enterText(find.byType(TextFormField).first, 'How long does home charging take?');
      await tester.tap(find.text('Post question'));
      await tester.pumpAndSettle();
      final sent = _body(server.lastWrite('POST /questions'));
      expect(sent['targetType'], 'model');
      expect(sent['targetId'], demoModelId);
      expect(sent['title'], 'How long does home charging take?');
    });
  });

  group('layout matrix (ar/en × light/dark × 200% text)', () {
    const configs = [
      KitConfig('ar'),
      KitConfig('en', dark: true),
      KitConfig('ar', dark: true, textScale: 2.0),
      KitConfig('en', textScale: 2.0),
    ];
    for (final c in configs) {
      _test('reviews, comments and question detail render without overflow ($c)', (tester) async {
        final server = await _pump(
          tester,
          location: AppRoutes.carReviews(demoCarSlug),
          language: c.lang,
          dark: c.dark,
          textScale: c.textScale,
          userId: saraId,
        );
        expect(tester.takeException(), isNull);
        await tester.drag(_mainList(), const Offset(0, -1500));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        tester.container().read(routerProvider).go(AppRoutes.articleComments(demoArticleSlug));
        await tester.pumpAndSettle();
        await tester.drag(_mainList(), const Offset(0, -1500));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        tester.container().read(routerProvider).go(AppRoutes.question(server.questionId));
        await tester.pumpAndSettle();
        await tester.drag(_mainList(), const Offset(0, -1500));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        tester.container().read(routerProvider).go(CommunityRoutes.writeReview(demoCarSlug));
        await tester.pumpAndSettle();
        await tester.drag(_mainList(), const Offset(0, -3000));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  });
}
