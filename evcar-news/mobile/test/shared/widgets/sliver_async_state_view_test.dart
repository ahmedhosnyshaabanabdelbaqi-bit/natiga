import 'package:evcar_news/core/api/api_exception.dart';
import 'package:evcar_news/shared/widgets/kit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/kit_harness.dart';

Widget screen(AsyncValue<List<String>> value, {VoidCallback? onRetry}) => AppScaffold.slivers(
  title: 'News',
  slivers: [
    SliverAsyncStateView<List<String>>(
      value: value,
      isEmpty: (items) => items.isEmpty,
      onRetry: onRetry,
      emptyTitle: 'No news yet',
      loading: const Skeleton(child: SkeletonList(item: NewsCardSkeleton.compact(), count: 2)),
      builder: (context, items) => SliverList.list(children: [for (final i in items) ListTile(title: Text(i))]),
    ),
  ],
);

void main() {
  testWidgets('loading → skeleton, data → slivers, empty → empty state, error → retry', (tester) async {
    await pumpKit(tester, screen(const AsyncLoading()), scroll: false);
    expect(find.byType(NewsCardSkeleton), findsNWidgets(2));

    await pumpKit(tester, screen(const AsyncData(['First', 'Second'])), scroll: false);
    expect(find.text('Second'), findsOneWidget);

    await pumpKit(tester, screen(const AsyncData([])), scroll: false);
    expect(find.text('No news yet'), findsOneWidget);

    var retried = 0;
    await pumpKit(
      tester,
      screen(
        AsyncError(const ApiException(kind: ApiErrorKind.server, code: 'INTERNAL'), StackTrace.empty),
        onRetry: () => retried++,
      ),
      scroll: false,
    );
    await tester.tap(find.text('Try again'));
    expect(retried, 1);
    expect(tester.takeException(), isNull);
  });
}
