import 'package:evcar_news/core/api/api_exception.dart';
import 'package:evcar_news/core/errors/app_errors.dart';
import 'package:evcar_news/core/l10n/l10n.dart';
import 'package:evcar_news/shared/widgets/async_state_view.dart';
import 'package:evcar_news/shared/widgets/not_available_value.dart';
import 'package:evcar_news/shared/widgets/reliability_badge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Widget host(Widget child, {String lang = 'en'}) => MaterialApp(
  locale: Locale(lang),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  home: Scaffold(body: child),
);

void main() {
  group('AsyncStateView', () {
    testWidgets('loading', (tester) async {
      await tester.pumpWidget(host(AsyncStateView<int>(value: const AsyncLoading(), builder: (_, v) => Text('$v'))));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Loading…'), findsOneWidget);
    });

    testWidgets('data and empty', (tester) async {
      await tester.pumpWidget(
        host(
          AsyncStateView<List<int>>(
            value: const AsyncData([1, 2]),
            isEmpty: (v) => v.isEmpty,
            builder: (_, v) => Text('items ${v.length}'),
          ),
        ),
      );
      expect(find.text('items 2'), findsOneWidget);

      await tester.pumpWidget(
        host(
          AsyncStateView<List<int>>(
            value: const AsyncData([]),
            isEmpty: (v) => v.isEmpty,
            emptyTitle: 'No articles',
            builder: (_, v) => Text('items ${v.length}'),
          ),
        ),
      );
      expect(find.text('No articles'), findsOneWidget);
      expect(find.byIcon(Icons.inbox_outlined), findsOneWidget);
    });

    testWidgets('network error shows the offline state with retry', (tester) async {
      var retried = 0;
      await tester.pumpWidget(
        host(
          AsyncStateView<int>(
            value: AsyncError(const ApiException(kind: ApiErrorKind.network, code: 'NETWORK_ERROR'), StackTrace.empty),
            onRetry: () => retried++,
            builder: (_, v) => Text('$v'),
          ),
        ),
      );
      expect(find.text("You're offline"), findsOneWidget);
      expect(find.byIcon(Icons.cloud_off_outlined), findsOneWidget);
      await tester.tap(find.text('Try again'));
      expect(retried, 1);
    });

    testWidgets('server error uses a generic message; 4xx shows the server message', (tester) async {
      await tester.pumpWidget(
        host(
          AsyncStateView<int>(
            value: AsyncError(
              const ApiException(kind: ApiErrorKind.server, code: 'HTTP_502', statusCode: 502),
              StackTrace.empty,
            ),
            onRetry: () {},
            builder: (_, v) => Text('$v'),
          ),
        ),
      );
      expect(find.text('Something went wrong'), findsOneWidget);
      expect(find.text('The server is currently unavailable. Please try again later.'), findsOneWidget);

      await tester.pumpWidget(
        host(
          AsyncStateView<int>(
            value: AsyncError(
              const ApiException(
                kind: ApiErrorKind.notFound,
                code: 'NOT_FOUND',
                statusCode: 404,
                message: 'Article not found',
              ),
              StackTrace.empty,
            ),
            onRetry: () {},
            builder: (_, v) => Text('$v'),
          ),
        ),
      );
      expect(find.text('Article not found'), findsOneWidget);
      expect(find.text('Try again'), findsNothing, reason: '404 is not retryable');
    });

    testWidgets('not-configured integration state', (tester) async {
      await tester.pumpWidget(
        host(
          AsyncStateView<int>(
            value: AsyncError(
              const ApiException(kind: ApiErrorKind.notConfigured, code: 'INTEGRATION_NOT_CONFIGURED', statusCode: 503),
              StackTrace.empty,
            ),
            onRetry: () {},
            builder: (_, v) => Text('$v'),
          ),
        ),
      );
      expect(find.text('Service not configured'), findsOneWidget);
      expect(find.text('Try again'), findsNothing);
    });

    testWidgets('permission denied offers the alternative actions', (tester) async {
      var manual = 0;
      await tester.pumpWidget(
        host(
          AsyncStateView<int>(
            value: AsyncError(const PermissionDeniedException(permission: 'location'), StackTrace.empty),
            permissionActions: [StateAction(label: 'Choose a city', onPressed: () => manual++)],
            builder: (_, v) => Text('$v'),
          ),
        ),
      );
      expect(find.text('Permission not granted'), findsOneWidget);
      await tester.tap(find.text('Choose a city'));
      expect(manual, 1);
    });

    testWidgets('Arabic strings and RTL', (tester) async {
      await tester.pumpWidget(
        host(
          AsyncStateView<int>(
            value: AsyncError(const ApiException(kind: ApiErrorKind.timeout, code: 'TIMEOUT'), StackTrace.empty),
            onRetry: () {},
            builder: (_, v) => Text('$v'),
          ),
          lang: 'ar',
        ),
      );
      expect(find.text('لا يوجد اتصال بالإنترنت'), findsOneWidget);
      expect(find.text('إعادة المحاولة'), findsOneWidget);
      expect(Directionality.of(tester.element(find.text('إعادة المحاولة'))), TextDirection.rtl);
    });

    testWidgets('error message is exposed to screen readers', (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(
        host(
          AsyncStateView<int>(
            value: AsyncError(const ApiException(kind: ApiErrorKind.network, code: 'NETWORK_ERROR'), StackTrace.empty),
            onRetry: () {},
            builder: (_, v) => Text('$v'),
          ),
        ),
      );
      expect(find.bySemanticsLabel("You're offline"), findsOneWidget);
      expect(tester.getSemantics(find.text('Try again')).label, contains('Try again'));
      handle.dispose();
    });
  });

  group('small widgets', () {
    testWidgets('NotAvailableValue / ValueOrNotAvailable never show 0 for missing', (tester) async {
      await tester.pumpWidget(
        host(
          const Column(children: [ValueOrNotAvailable(null), ValueOrNotAvailable('  '), ValueOrNotAvailable('450 km')]),
          lang: 'ar',
        ),
      );
      expect(find.text('غير متوفر'), findsNWidgets(2));
      expect(find.text('450 km'), findsOneWidget);
      expect(find.text('0'), findsNothing);
    });

    testWidgets('ReliabilityBadge pairs an icon with text (not colour only)', (tester) async {
      await tester.pumpWidget(host(const ReliabilityBadge(reliability: Reliability.manufacturerClaim), lang: 'ar'));
      expect(find.text('بيان الشركة المصنّعة'), findsOneWidget);
      expect(find.byIcon(Icons.factory_outlined), findsOneWidget);
      expect(Reliability.fromApi('manufacturer_claim'), Reliability.manufacturerClaim);
      expect(Reliability.fromApi('nope'), isNull);
    });
  });
}
