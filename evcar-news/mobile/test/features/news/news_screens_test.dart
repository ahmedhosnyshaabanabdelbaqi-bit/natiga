import 'dart:typed_data';

import 'package:evcar_news/app/router/app_router.dart';
import 'package:evcar_news/app/router/app_routes.dart';
import 'package:evcar_news/features/news/data/offline_image_store.dart';
import 'package:evcar_news/features/news/presentation/article_detail_screen.dart';
import 'package:evcar_news/features/news/presentation/news_list_screen.dart';
import 'package:evcar_news/features/news/presentation/widgets/article_body.dart';
import 'package:evcar_news/shared/widgets/image_with_fallback.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/kit_harness.dart' show FailingImage;
import '../../helpers/test_app.dart';
import 'news_fixtures.dart';

/// Fake news backend; [online] switches the transport off.
class _NewsServer {
  _NewsServer() {
    adapter.on('GET /articles', (req) {
      if (!online) throw const FakeNetworkError();
      return FakeResponse.json(200, pageJson(articles));
    });
    adapter.on('GET /articles/test-article', (_) {
      if (!online) throw const FakeNetworkError();
      return FakeResponse.json(200, {'data': detail});
    });
    adapter.on('POST /articles/test-article/view', (_) => FakeResponse.empty(204));
    adapter.on('GET /categories', (_) {
      if (!online) throw const FakeNetworkError();
      return FakeResponse.json(200, {
        'data': [
          {'id': 'cat-1', 'slug': 'charging', 'name': 'Charging', 'sortOrder': 1, 'parentId': null},
        ],
      });
    });
  }

  final adapter = FakeHttpAdapter();
  bool online = true;
  List<Map<String, dynamic>> articles = [
    summaryJson(),
    summaryJson(id: 'a2', slug: 'second', title: 'Second test article', isDemo: true),
  ];
  Map<String, dynamic> detail = detailJson(
    corrections: [
      {'id': 'c1', 'kind': 'correction', 'note': 'Test correction note', 'correctedAt': '2026-09-25T08:00:00Z'},
    ],
  );
}

final _overrides = [
  networkImageProviderFactory.overrideWithValue((_) => const FailingImage()),
  offlineImageDownloaderProvider.overrideWithValue((_) async => Uint8List.fromList([1, 2, 3])),
  newsShareProvider.overrideWithValue((text, {subject, origin}) async => _shared.add(text)),
];

final _shared = <String>[];

Future<_NewsServer> _pump(
  WidgetTester tester, {
  String language = 'en',
  String location = AppRoutes.news,
  Map<String, Object> prefs = const {},
}) async {
  tester.view.physicalSize = const Size(360, 780) * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final server = _NewsServer();
  await pumpTestApp(
    tester,
    language: language,
    adapter: server.adapter,
    features: allFeaturesOn,
    extraOverrides: _overrides,
    prefs: prefs,
  );
  tester.container().read(routerProvider).go(location);
  await tester.pumpAndSettle();
  return server;
}

void main() {
  setUp(_shared.clear);

  for (final lang in ['en', 'ar']) {
    testWidgets('news list renders chips and articles ($lang)', (tester) async {
      await _pump(tester, language: lang);
      expect(find.byType(NewsListScreen), findsOneWidget);
      expect(find.text(lang == 'ar' ? 'الكل' : 'All'), findsOneWidget);
      expect(find.text('Charging'), findsWidgets);
      expect(find.text('Test article title'), findsOneWidget);
      // Demo article is visibly labelled.
      expect(find.text(lang == 'ar' ? 'بيانات تجريبية' : 'Demo data'), findsWidgets);
      expect(tester.takeException(), isNull);
    });

    testWidgets('article reader shows dates, attribution, corrections, video, related ($lang)', (tester) async {
      await _pump(tester, language: lang, location: AppRoutes.article('test-article'));
      expect(find.byType(ArticleDetailScreen), findsOneWidget);
      expect(find.text('Test article title'), findsOneWidget);
      expect(find.textContaining(lang == 'ar' ? 'تاريخ الحدث' : 'Event date'), findsOneWidget);
      expect(find.byType(ArticleBody), findsOneWidget);
      expect(find.textContaining('First paragraph of the test body.', findRichText: true), findsOneWidget);

      await tester.scrollUntilVisible(find.byType(VideoCard), 300, scrollable: find.byType(Scrollable).first);
      expect(find.textContaining('YouTube'), findsWidgets);

      await tester.scrollUntilVisible(
        find.text('Test attribution text'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.scrollUntilVisible(
        find.text('Test correction note'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.scrollUntilVisible(find.text('Test Model'), 300, scrollable: find.byType(Scrollable).first);
      await tester.scrollUntilVisible(
        find.text('Related test article'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('deep link https://evcar.news/n/<slug> opens the reader and counts one view', (tester) async {
    final server = await _pump(tester, location: '/n/test-article');
    expect(find.byType(ArticleDetailScreen), findsOneWidget);
    expect(server.adapter.requestsTo('POST /articles/test-article/view'), hasLength(1));
  });

  testWidgets('share sends the public evcar.news link', (tester) async {
    await _pump(tester, location: AppRoutes.article('test-article'));
    await tester.tap(find.byTooltip('Share'));
    await tester.pumpAndSettle();
    expect(_shared.single, 'Test article title\nhttps://evcar.news/n/test-article');
  });

  testWidgets('save offline, then read it and find it in the saved list without internet', (tester) async {
    final server = await _pump(tester, location: AppRoutes.article('test-article'));
    await tester.tap(find.byTooltip('Save for offline reading'));
    await tester.pumpAndSettle();
    expect(find.text('Saved. You can read it without internet.'), findsOneWidget);
    expect(find.byTooltip('Saved for offline reading'), findsOneWidget);

    // Offline: the reader falls back to the saved copy and says so.
    server.online = false;
    final router = tester.container().read(routerProvider);
    router.go(AppRoutes.home);
    await tester.pumpAndSettle();
    router.go(AppRoutes.article('test-article'));
    await tester.pumpAndSettle();
    expect(find.text('Test article title'), findsOneWidget);
    expect(find.textContaining('Saved copy from'), findsOneWidget);

    // News list offline without a cached copy → offline state offers the saved list.
    router.go(AppRoutes.news);
    await tester.pumpAndSettle();
    expect(find.text('Saved offline'), findsOneWidget);
    await tester.tap(find.text('Open saved articles'));
    await tester.pumpAndSettle();
    expect(find.text('1 article on this device'), findsOneWidget);
    expect(find.textContaining('Saved just now'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('reader settings change text size and persist', (tester) async {
    await _pump(tester, location: AppRoutes.article('test-article'));
    await tester.tap(find.byTooltip('Reading settings'));
    await tester.pumpAndSettle();
    expect(find.text('100%'), findsOneWidget);
    await tester.tap(find.byTooltip('Larger text'));
    await tester.pumpAndSettle();
    expect(find.text('115%'), findsOneWidget);
    await tester.tap(find.text('Dark'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('unknown article shows the not-available state', (tester) async {
    final server = _NewsServer();
    server.adapter.on(
      'GET /articles/gone',
      (_) => FakeResponse.error(404, 'ARTICLE_NOT_FOUND', message: 'Article not found'),
    );
    tester.view.physicalSize = const Size(360, 780) * 3;
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await pumpTestApp(
      tester,
      language: 'en',
      adapter: server.adapter,
      features: allFeaturesOn,
      extraOverrides: _overrides,
    );
    tester.container().read(routerProvider).go(AppRoutes.article('gone'));
    await tester.pumpAndSettle();
    expect(find.text('Article not available'), findsOneWidget);
    expect(find.text('Browse all news'), findsOneWidget);
  });

  testWidgets('news list at 200% text in Arabic has no overflow', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await _pump(tester, language: 'ar');
    expect(find.text('Test article title'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  for (final dark in [false, true]) {
    testWidgets('whole article at 200% text in Arabic has no overflow (dark: $dark)', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2.0;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await _pump(
        tester,
        language: 'ar',
        location: AppRoutes.article('test-article'),
        prefs: {if (dark) 'settings.themeMode': 'dark'},
      );
      expect(find.text('Test article title'), findsOneWidget);
      // Scroll to the end: every section (body, table, video, source,
      // corrections, cars, related) must lay out without overflow.
      for (var i = 0; i < 40; i++) {
        await tester.drag(find.byType(Scrollable).first, const Offset(0, -400));
        await tester.pump();
        expect(tester.takeException(), isNull);
      }
      await tester.pumpAndSettle();
      expect(find.text('Related test article'), findsOneWidget);
    });
  }
}
