import 'package:evcar_news/shared/widgets/kit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/kit_harness.dart';

void main() {
  testWidgets('shows the offline banner on full-screen pages, once', (tester) async {
    await pumpKit(
      tester,
      const AppScaffold(title: 'Station', body: Text('body')),
      scroll: false,
      online: false,
    );
    expect(find.byType(OfflineBanner), findsOneWidget);

    // Inside the tab shell (which shows its own banner) there is none.
    await pumpKit(
      tester,
      const OfflineBannerScope(
        child: AppScaffold(title: 'Tab', body: Text('body')),
      ),
      scroll: false,
      online: false,
    );
    expect(find.byType(OfflineBanner), findsNothing);
  });

  testWidgets('slivers form with large title and pull-to-refresh at 200% text', (tester) async {
    var refreshed = 0;
    await pumpKit(
      tester,
      AppScaffold.slivers(
        title: 'أخبار السيارات الكهربائية',
        largeTitle: true,
        onRefresh: () async => refreshed++,
        slivers: [
          SliverList.list(children: [for (var i = 0; i < 20; i++) ListTile(title: Text('Row $i'))]),
        ],
      ),
      scroll: false,
      config: const KitConfig('ar', textScale: 2.0),
    );
    expect(tester.takeException(), isNull);
    await tester.fling(find.text('Row 0'), const Offset(0, 400), 1000);
    await tester.pumpAndSettle();
    expect(refreshed, 1);
  });

  testWidgets('section header announces "See all: <section>"', (tester) async {
    final handle = tester.ensureSemantics();
    var tapped = false;
    await pumpKit(tester, SectionHeader(title: 'Latest news', onSeeAll: () => tapped = true));
    expect(find.bySemanticsLabel('See all: Latest news'), findsOneWidget);
    await tester.tap(find.text('See all'));
    expect(tapped, isTrue);
    handle.dispose();
  });
}
