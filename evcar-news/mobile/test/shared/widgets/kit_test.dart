import 'package:evcar_news/core/api/api_exception.dart';
import 'package:evcar_news/core/errors/app_errors.dart';
import 'package:evcar_news/shared/widgets/kit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/kit_harness.dart';

final _now = DateTime.utc(2026, 9, 25, 12);

/// A screen-like composition using most of the kit, rendered in every
/// configuration of [kitMatrix].
Widget _gallery() => Builder(
  builder: (context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(title: 'Latest EV news with a long title', icon: Icons.bolt, onSeeAll: () {}),
        NewsCard(
          variant: NewsCardVariant.hero,
          title: 'A very long headline about batteries and charging that wraps over several lines',
          imageUrl: 'https://media.test/a.jpg',
          imageCredit: 'Photo agency',
          category: 'Batteries',
          publishedAt: _now.subtract(const Duration(hours: 3)),
          isSponsored: true,
          sponsorName: 'Sponsor Co',
          isDemo: true,
          now: _now,
        ),
        const SizedBox(height: 12),
        NewsCard(
          title: 'Standard card title that is also rather long to test wrapping',
          summary: 'Summary text that explains the article in two lines at most, then gets cut.',
          imageUrl: 'https://media.test/b.jpg',
          category: 'Reviews',
          publishedAt: _now.subtract(const Duration(days: 30)),
          sourceName: 'EV Car News',
          trailingAction: IconButton(onPressed: () {}, icon: const Icon(Icons.favorite_border)),
          now: _now,
        ),
        const SizedBox(height: 12),
        NewsCard(
          variant: NewsCardVariant.compact,
          title: 'Compact card with a long title that needs three lines on a phone',
          imageUrl: null,
          category: 'Guides',
          publishedAt: _now.subtract(const Duration(minutes: 5)),
          trailingAction: IconButton(onPressed: () {}, icon: const Icon(Icons.favorite_border)),
          now: _now,
        ),
        const SizedBox(height: 12),
        CarCard(
          brandName: 'Brand',
          title: 'Model with a fairly long name',
          subtitle: 'Long Range AWD · 2026 · EG',
          imageUrl: 'https://media.test/c.jpg',
          powertrain: Powertrain.bev,
          hasTour: true,
          isDemo: true,
          stats: const [
            CarCardStat(icon: Icons.route_outlined, label: 'Range', value: '520 km', qualifier: 'WLTP'),
            CarCardStat(icon: Icons.battery_charging_full, label: 'Battery', value: null),
            CarCardStat(icon: Icons.bolt, label: 'DC peak', value: '150 kW'),
          ],
          price: '1,250,000 ج.م',
          priceType: PriceType.officialMsrp,
          trailingAction: IconButton(onPressed: () {}, icon: const Icon(Icons.favorite_border)),
          footer: OutlinedButton(onPressed: () {}, child: const Text('Add to compare')),
        ),
        const SizedBox(height: 12),
        CarCard(
          layout: CarCardLayout.horizontal,
          title: 'Plug-in hybrid',
          subtitle: 'Base · 2025 · SA',
          powertrain: Powertrain.phev,
          price: null,
          stats: const [CarCardStat(icon: Icons.route_outlined, label: 'Electric range', value: null)],
        ),
        const SizedBox(height: 12),
        SpecGroup(
          title: 'Battery & charging',
          icon: Icons.battery_charging_full,
          collapsible: true,
          rows: [
            SpecRow(
              label: 'Usable battery capacity',
              value: '77 kWh',
              reliability: Reliability.verified,
              source: SpecSource(name: 'Manufacturer', verifiedAt: _now),
            ),
            SpecRow(label: 'Range', value: '520 km', qualifier: RangeCycle.wltp.label(l10n)),
            const SpecRow(label: 'Warranty', value: null, reliability: Reliability.unverified),
            const SpecRow(label: 'DC 10–80%', value: '28 min', note: 'On a 150 kW charger'),
          ],
          footer: LastUpdatedText(
            time: _now.subtract(const Duration(days: 60)),
            staleAfter: const Duration(days: 30),
            now: _now,
          ),
        ),
        const SizedBox(height: 12),
        StatTileRow(
          tiles: const [
            StatTile(label: 'Range', value: '520 km', icon: Icons.route_outlined, qualifier: 'WLTP'),
            StatTile(label: 'Battery', value: null, icon: Icons.battery_full),
            StatTile(label: 'Monthly cost', value: '1,200 EGP', icon: Icons.payments_outlined, tone: AppTone.success),
          ],
        ),
        const SizedBox(height: 12),
        PriceTag(
          price: '45,000 SAR',
          type: PriceType.dealer,
          isConverted: true,
          effectiveDate: _now,
          sourceName: 'Dealer list',
        ),
        const SizedBox(height: 12),
        const Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            DemoBadge(),
            SponsoredLabel(sponsorName: 'Sponsor Co'),
            SponsoredLabel(kind: SponsoredKind.ad),
            Tour360Badge(),
            PowertrainPill(powertrain: Powertrain.erev),
            Pill(label: 'CCS2', icon: Icons.power, tone: AppTone.info),
          ],
        ),
        const SizedBox(height: 12),
        FilterBar(
          activeCount: 2,
          onOpenFilters: () {},
          chips: [
            AppFilterChip(label: 'CCS2', selected: true, onSelected: (_) {}),
            AppFilterChip(label: 'Open now', selected: false, onSelected: (_) {}),
          ],
        ),
        const SizedBox(height: 12),
        PrimaryButton(label: 'Save', icon: Icons.check, onPressed: () {}, expand: true),
        const SizedBox(height: 8),
        const SecondaryButton(label: 'Cancel', onPressed: null, expand: true, loading: true),
        const SizedBox(height: 12),
        const Skeleton(child: NewsCardSkeleton.compact()),
        const SizedBox(height: 12),
        const Skeleton(child: CarCardSkeleton()),
        const SizedBox(height: 12),
        const SizedBox(
          height: 520,
          child: EmptyState(icon: Icons.ev_station_outlined, title: 'No stations here'),
        ),
        SizedBox(
          height: 520,
          child: PermissionDeniedState(
            permission: AppPermission.location,
            onOpenSettings: () {},
            alternatives: [StateAction(label: 'Choose a city', onPressed: () {})],
          ),
        ),
      ],
    );
  },
);

void main() {
  group('kit renders without overflow', () {
    for (final config in kitMatrix) {
      testWidgets('gallery $config', (tester) async {
        await pumpKit(tester, _gallery(), config: config);
        expect(tester.takeException(), isNull);
        // Missing values are "Not available", never 0.
        expect(find.text(config.lang == 'ar' ? 'غير متوفر' : 'Not available'), findsWidgets);
        // Demo and sponsored labels are visible.
        expect(find.text(config.lang == 'ar' ? 'بيانات تجريبية' : 'Demo data'), findsWidgets);
        expect(find.text(config.lang == 'ar' ? 'برعاية Sponsor Co' : 'Sponsored by Sponsor Co'), findsWidgets);
      });
    }

    testWidgets('horizontal card list stretches cards at 200% text', (tester) async {
      await pumpKit(
        tester,
        HorizontalCardList(
          children: [
            for (var i = 0; i < 3; i++)
              CarCard(
                title: i == 1 ? 'A much longer model name that wraps onto two lines' : 'Short',
                powertrain: Powertrain.bev,
                stats: const [CarCardStat(icon: Icons.route_outlined, label: 'Range', value: '400 km')],
                price: null,
              ),
          ],
        ),
        config: const KitConfig('ar', textScale: 2.0),
      );
      expect(tester.takeException(), isNull);
      final heights = tester
          .widgetList<CarCard>(find.byType(CarCard))
          .map((w) => tester.getSize(find.byWidget(w)).height)
          .toSet();
      expect(heights, hasLength(1), reason: 'cards in a row share the tallest height');
    });

    testWidgets('adaptive grid uses columns on tablets', (tester) async {
      await pumpKit(
        tester,
        AdaptiveGrid(
          children: [for (var i = 0; i < 5; i++) NewsCard(title: 'Item $i', variant: NewsCardVariant.compact)],
        ),
        size: const Size(1024, 768),
      );
      expect(tester.takeException(), isNull);
      final first = tester.getTopLeft(find.text('Item 0'));
      final second = tester.getTopLeft(find.text('Item 1'));
      expect(first.dy, second.dy, reason: 'side by side');
    });
  });

  group('semantics & honesty', () {
    testWidgets('car card reads as one element with 360° and N/A values', (tester) async {
      final handle = tester.ensureSemantics();
      await pumpKit(
        tester,
        const CarCard(
          brandName: 'BYD',
          title: 'Atto 3',
          powertrain: Powertrain.bev,
          hasTour: true,
          stats: [CarCardStat(icon: Icons.route_outlined, label: 'Range', value: null)],
          price: null,
        ),
      );
      expect(
        find.bySemanticsLabel(
          RegExp(r'BYD Atto 3\. Electric\. Range: Not available\. Price not available\. Interior 360° tour available'),
        ),
        findsOneWidget,
      );
      handle.dispose();
    });

    testWidgets('converted price is always labelled', (tester) async {
      await pumpKit(tester, const PriceTag(price: '100,000 EGP', type: PriceType.officialMsrp, isConverted: true));
      expect(find.text('Estimate after conversion'), findsOneWidget);
      expect(find.text('Official price'), findsOneWidget);
    });

    testWidgets('missing price is not a zero', (tester) async {
      await pumpKit(tester, const PriceTag(price: null, type: PriceType.officialMsrp), config: const KitConfig('ar'));
      expect(find.text('السعر غير متوفر'), findsOneWidget);
      expect(find.textContaining('0'), findsNothing);
    });

    testWidgets('spec row hides reliability/source when the value is missing', (tester) async {
      await pumpKit(
        tester,
        const SpecRow(label: 'Range', value: null, qualifier: 'WLTP', reliability: Reliability.verified),
      );
      expect(find.text('Not available'), findsOneWidget);
      expect(find.byType(ReliabilityBadge), findsNothing);
      expect(find.text('WLTP'), findsNothing, reason: 'no cycle chip without a value');
    });

    testWidgets('last updated: unknown, relative, stale warning with text', (tester) async {
      await pumpKit(
        tester,
        Column(
          children: [
            const LastUpdatedText(time: null),
            LastUpdatedText(time: _now.subtract(const Duration(hours: 2)), now: _now),
            LastUpdatedText(
              time: _now.subtract(const Duration(days: 3)),
              staleAfter: const Duration(hours: 1),
              now: _now,
            ),
          ],
        ),
      );
      expect(find.text('Last update: not available'), findsOneWidget);
      expect(find.text('Last updated 2 hours ago'), findsOneWidget);
      expect(find.text('· May be out of date'), findsOneWidget);
      expect(find.byIcon(Icons.warning_amber_rounded), findsOneWidget);
    });

    testWidgets('skeleton announces loading once and stops animating when animations are off', (tester) async {
      final handle = tester.ensureSemantics();
      await pumpKit(
        tester,
        const Skeleton(child: SkeletonList(item: NewsCardSkeleton.compact(), count: 3)),
        disableAnimations: true,
      );
      expect(find.bySemanticsLabel('Loading…'), findsOneWidget);
      expect(find.byType(ShaderMask), findsNothing);
      expect(tester.hasRunningAnimations, isFalse);
      handle.dispose();
    });

    testWidgets('images: invalid url and load failure show the fallback; credit is announced', (tester) async {
      final handle = tester.ensureSemantics();
      await pumpKit(
        tester,
        const Column(
          children: [
            ImageWithFallback(url: 'javascript:alert(1)', aspectRatio: 16 / 9),
            ImageWithFallback(
              url: 'https://media.test/x.jpg',
              aspectRatio: 16 / 9,
              semanticLabel: 'Front view',
              credit: 'Studio',
            ),
          ],
        ),
      );
      expect(find.byIcon(Icons.image_outlined), findsNWidgets(2));
      expect(find.text('Image: Studio'), findsOneWidget);
      expect(find.bySemanticsLabel('Front view. Image: Studio'), findsOneWidget);
      handle.dispose();
    });

    test('only https (and http in debug) image urls load', () {
      expect(isLoadableImageUrl('https://a.b/c.jpg'), isTrue);
      expect(isLoadableImageUrl('ftp://a.b/c.jpg'), isFalse);
      expect(isLoadableImageUrl('data:image/png;base64,xx'), isFalse);
      expect(isLoadableImageUrl(null), isFalse);
      expect(isLoadableImageUrl('https:///nohost'), isFalse);
    });
  });

  group('states', () {
    testWidgets('error state maps offline / not configured / retry', (tester) async {
      var retried = 0;
      await pumpKit(
        tester,
        SizedBox(
          height: 600,
          child: ErrorState(
            error: const ApiException(kind: ApiErrorKind.network, code: 'NETWORK_ERROR'),
            onRetry: () => retried++,
          ),
        ),
      );
      expect(find.text("You're offline"), findsOneWidget);
      await tester.tap(find.text('Try again'));
      expect(retried, 1);

      await pumpKit(
        tester,
        const SizedBox(
          height: 600,
          child: ErrorState(
            error: ApiException(kind: ApiErrorKind.notConfigured, code: 'INTEGRATION_NOT_CONFIGURED'),
          ),
        ),
      );
      expect(find.text('Service not configured'), findsOneWidget);
      expect(find.text('Try again'), findsNothing);
    });

    testWidgets('permission denied offers settings and an alternative', (tester) async {
      var settings = 0;
      var manual = 0;
      await pumpKit(
        tester,
        SizedBox(
          height: 640,
          child: PermissionDeniedState(
            permission: AppPermission.location,
            onOpenSettings: () => settings++,
            alternatives: [StateAction(label: 'Choose a city manually', onPressed: () => manual++)],
          ),
        ),
        config: const KitConfig('ar'),
      );
      expect(find.text('إذن الموقع غير ممنوح'), findsOneWidget);
      await tester.tap(find.text('Choose a city manually'));
      await tester.tap(find.text('فتح إعدادات الجهاز'));
      expect((settings, manual), (1, 1));
    });

    testWidgets('web preview state', (tester) async {
      await pumpKit(tester, const SizedBox(height: 600, child: NotSupportedOnPlatformState()));
      expect(find.text('Not available in the web preview'), findsOneWidget);
    });

    testWidgets('error presentation keeps permission errors distinct', (tester) async {
      expect(classifyError(const PermissionDeniedException(permission: 'location')), ErrorStateKind.permissionDenied);
    });
  });

  group('sheets & feedback', () {
    testWidgets('confirm sheet resolves true only on confirm', (tester) async {
      bool? result;
      await pumpKit(
        tester,
        Builder(
          builder: (context) => ElevatedButton(
            onPressed: () async => result = await showConfirmSheet(
              context: context,
              title: 'Delete entry?',
              message: 'This cannot be undone.',
              confirmLabel: 'Delete',
              destructive: true,
            ),
            child: const Text('open'),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.text('Delete entry?'), findsOneWidget);
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();
      expect(result, isTrue);

      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(result, isFalse);
    });

    testWidgets('app bottom sheet has a title, close button and footer', (tester) async {
      await pumpKit(
        tester,
        Builder(
          builder: (context) => ElevatedButton(
            onPressed: () => showAppBottomSheet<void>(
              context: context,
              title: 'Filters',
              builder: (_) => const Text('body'),
              footer: (_) => PrimaryButton(label: 'Apply', onPressed: () {}, expand: true),
            ),
            child: const Text('open'),
          ),
        ),
        config: const KitConfig('en', textScale: 2.0),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.text('Filters'), findsOneWidget);
      expect(find.text('Apply'), findsOneWidget);
      await tester.tap(find.byTooltip('Close'));
      await tester.pumpAndSettle();
      expect(find.text('body'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('snackbar shows an icon with the message', (tester) async {
      await pumpKit(
        tester,
        Builder(
          builder: (context) => ElevatedButton(
            onPressed: () => showAppSnackBar(context, 'Saved', tone: AppTone.success),
            child: const Text('go'),
          ),
        ),
      );
      await tester.tap(find.text('go'));
      await tester.pump();
      expect(find.text('Saved'), findsOneWidget);
      expect(find.byIcon(Icons.check_circle_outline), findsOneWidget);
    });
  });
}
