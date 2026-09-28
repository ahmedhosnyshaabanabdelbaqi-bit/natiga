import 'package:evcar_news/app/router/app_router.dart';
import 'package:evcar_news/app/router/app_routes.dart';
import 'package:evcar_news/core/platform/platform_capabilities.dart';
import 'package:evcar_news/features/cars/presentation/car_gallery_screen.dart';
import 'package:evcar_news/features/tours/application/motion_look.dart';
import 'package:evcar_news/features/tours/data/panorama_cache.dart';
import 'package:evcar_news/features/tours/domain/viewer_protocol.dart';
import 'package:evcar_news/features/tours/presentation/tour_viewer_screen.dart';
import 'package:evcar_news/features/tours/presentation/widgets/webview_panorama_surface.dart';
import 'package:evcar_news/shared/widgets/image_with_fallback.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/kit_harness.dart' show FailingImage;
import '../../helpers/test_app.dart';
import 'tours_fixtures.dart';

const _carSlug = 'demo-motors-ev-one';

class _ToursServer {
  _ToursServer({this.tours = true, this.detail = true}) {
    adapter.on('GET /tours', (r) => FakeResponse.json(200, tours ? tourFixture('tours_list_$lang') : _empty));
    adapter.on('GET /tours/featured', (r) => FakeResponse.json(200, tourFixture('tours_featured_$lang')));
    adapter.on('GET /tours/$demoTourId', (r) {
      maxWidths.add(r.queryParameters['maxWidth']);
      return detail
          ? FakeResponse.json(200, tourFixture('tour_detail_$lang'))
          : FakeResponse.error(404, 'NOT_FOUND', message: 'not found');
    });
  }

  static const _empty = {
    'data': <Object>[],
    'meta': {'page': 1, 'pageSize': 20, 'total': 0, 'totalPages': 0},
  };

  final adapter = FakeHttpAdapter();
  final bool tours;
  final bool detail;
  String lang = 'en';
  final List<Object?> maxWidths = [];
}

Future<_ToursServer> _pump(
  WidgetTester tester, {
  required String location,
  String language = 'en',
  _ToursServer? server,
  bool webPreview = false,
  bool bigText = false,
  bool online = true,
}) async {
  VisibilityDetectorController.instance.updateInterval = Duration.zero;
  tester.view.physicalSize = const Size(360, 780) * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  if (bigText) {
    tester.platformDispatcher.textScaleFactorTestValue = 1.25;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  }
  final s = server ?? _ToursServer();
  s.lang = language;
  final downloader = ScriptedDownloader();
  await pumpTestApp(
    tester,
    language: language,
    adapter: s.adapter,
    features: allFeaturesOn,
    online: online,
    prefs: bigText ? {'settings.textScale': 1.6} : const {},
    extraOverrides: [
      networkImageProviderFactory.overrideWithValue((_) => const FailingImage()),
      panoramaSurfaceFactoryProvider.overrideWithValue(fakeSurfaceFactory),
      panoramaLoaderProvider.overrideWithValue(scriptedLoader(downloader)),
      motionSourceProvider.overrideWithValue(FakeMotionSource()),
      platformCapabilitiesProvider.overrideWithValue(PlatformCapabilities(isWebPreview: webPreview)),
    ],
  );
  tester.container().read(routerProvider).go(location);
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
  return s;
}

FakePanoramaSurface get _surface => FakePanoramaSurface.last!;

/// Brings the fake viewer to "showing" with the preview.
Future<void> _showScene(WidgetTester tester) async {
  _surface.emitRaw('{"type":"ready","v":2,"webgl":true,"maxTextureSize":8192}');
  await tester.pump();
  _surface.emitRaw('{"type":"needImages","sceneId":"$driverSceneId"}');
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 20));
  }
  _surface.emitRaw('{"type":"sceneShown","sceneId":"$driverSceneId","quality":"preview"}');
  await tester.pump();
}

Future<void> _pumpFor(WidgetTester tester, [int ms = 400]) async {
  for (var i = 0; i < ms ~/ 50; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  final tourLocation = AppRoutes.tour(_carSlug, demoTourId);

  group('tours list', () {
    testWidgets('lists published tours with demo label and binding', (tester) async {
      await _pump(tester, location: AppRoutes.tours);
      await tester.pumpAndSettle();
      expect(find.text('360° interior tours'), findsWidgets);
      expect(find.text('Demo Motors Demo EV One Standard (demo)'), findsOneWidget);
      expect(find.text('Demo — not a real car interior'), findsOneWidget);
      expect(find.text('Model year 2025'), findsOneWidget);
      expect(find.text('Interior: Demo grey (fictional)'), findsOneWidget);
      expect(find.text('Left-hand drive'), findsOneWidget);
      expect(find.text('Driver seat (demo)'), findsOneWidget);
      await tester.tap(find.text('Demo Motors Demo EV One Standard (demo)'));
      await _pumpFor(tester);
      expect(find.byType(TourViewerScreen), findsOneWidget);
    });

    testWidgets('empty list explains why and offers the catalog', (tester) async {
      await _pump(tester, location: AppRoutes.tours, server: _ToursServer(tours: false), language: 'ar');
      await tester.pumpAndSettle();
      expect(find.text('لا توجد جولات 360° بعد'), findsOneWidget);
      expect(find.text('تصفّح السيارات'), findsOneWidget);
    });

    testWidgets('200% text does not overflow', (tester) async {
      await _pump(tester, location: AppRoutes.tours, bigText: true, language: 'ar');
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('تجريبي — ليست مقصورة سيارة حقيقية'), findsOneWidget);
    });
  });

  group('viewer', () {
    testWidgets('unknown tour → "tour not available for this trim" + photo gallery', (tester) async {
      await _pump(tester, location: tourLocation, server: _ToursServer(detail: false), language: 'ar');
      await tester.pumpAndSettle();
      expect(find.text('الجولة غير متاحة لهذه الفئة'), findsOneWidget);
      await tester.tap(find.text('افتح معرض الصور'));
      await tester.pumpAndSettle();
      expect(find.byType(CarGalleryScreen), findsOneWidget);
    });

    testWidgets('asks the API for a device-appropriate maxWidth', (tester) async {
      final s = await _pump(tester, location: tourLocation);
      // 360×780 dp at 3× → 2340 px long side → 4096 cap.
      expect(s.maxWidths, [4096]);
    });

    testWidgets('loading → preview with controls, binding, demo label and seats', (tester) async {
      final semantics = tester.ensureSemantics();
      await _pump(tester, location: tourLocation);
      expect(find.text('Loading the 360° view…'), findsOneWidget);
      await _showScene(tester);
      expect(find.text('Loading the 360° view…'), findsNothing);
      expect(find.text('Demo Motors Demo EV One Standard (demo)'), findsOneWidget);
      expect(find.text('Demo — not a real car interior'), findsOneWidget);
      expect(find.text('Model year 2025'), findsOneWidget);
      expect(find.text('Market: Egypt'), findsOneWidget);
      expect(find.text('Left-hand drive'), findsOneWidget);
      expect(find.byTooltip('Reset view'), findsOneWidget);
      expect(find.byTooltip('Zoom in'), findsOneWidget);
      expect(find.byTooltip('Look around by moving the phone'), findsOneWidget);
      expect(find.byTooltip('Full screen'), findsOneWidget);
      expect(find.text('© EV Car News — synthetic demo image generated by the demo seed'), findsOneWidget);
      // Preview on screen while the HD file is being delivered.
      expect(find.textContaining('Loading high quality…'), findsOneWidget);
      expect(find.bySemanticsLabel(RegExp('Loading high quality')), findsOneWidget);
      _surface.emitRaw('{"type":"sceneShown","sceneId":"$driverSceneId","quality":"full"}');
      await tester.pump();
      expect(find.bySemanticsLabel('Showing high quality'), findsOneWidget);
      expect(find.text('HD'), findsOneWidget);

      await tester.tap(find.byTooltip('Reset view'));
      await tester.pump();
      expect(_surface.types, contains('resetView'));

      // Seat switcher → a separate panorama.
      await tester.ensureVisible(find.text('Rear seats (demo)'));
      await tester.pump();
      await tester.tap(find.text('Rear seats (demo)'));
      await tester.pump();
      await tester.pump();
      expect(_surface.ofType('show').last.json['sceneId'], rearSceneId);
      await _pumpFor(tester, 5200);
      semantics.dispose();
    });

    testWidgets('hotspots open native sheets with plain text', (tester) async {
      await _pump(tester, location: tourLocation);
      await _showScene(tester);
      _surface.emitRaw('{"type":"hotspot","sceneId":"$driverSceneId","hotspotId":"$infoHotspotId"}');
      await _pumpFor(tester);
      expect(find.text('[DEMO] Info hotspot'), findsOneWidget);
      expect(find.text('Demo text for testing info hotspots only.'), findsOneWidget);
      await tester.tap(find.byTooltip('Close'));
      await _pumpFor(tester);

      _surface.emitRaw('{"type":"hotspot","sceneId":"$driverSceneId","hotspotId":"$specHotspotId"}');
      await _pumpFor(tester);
      expect(find.text('Battery capacity (usable)'), findsOneWidget);
      expect(find.text('60 kWh'), findsOneWidget);
      expect(find.text('See all specifications'), findsOneWidget);
      await tester.tap(find.byTooltip('Close'));
      await _pumpFor(tester);

      // Accessible list of points of interest.
      await tester.tap(find.byTooltip('Points of interest'));
      await _pumpFor(tester);
      expect(find.text('Go to the rear seats'), findsOneWidget);
      await tester.tap(find.text('Go to the rear seats'));
      await _pumpFor(tester);
      expect(_surface.ofType('show').last.json['sceneId'], rearSceneId);
      await _pumpFor(tester, 5200);
    });

    testWidgets('about sheet shows credits and licence', (tester) async {
      await _pump(tester, location: tourLocation);
      await _showScene(tester);
      await tester.tap(find.byTooltip('About this tour'));
      await _pumpFor(tester);
      expect(find.text('Photo credits & licence'), findsOneWidget);
      expect(find.text('Licence: Owned'), findsOneWidget);
      expect(find.textContaining('FICTIONAL demo data'), findsOneWidget);
      await _pumpFor(tester, 5200);
    });

    testWidgets('no WebGL → explained, with the photo gallery', (tester) async {
      await _pump(tester, location: tourLocation);
      _surface.emit(const ViewerReady(webgl: false));
      await _pumpFor(tester);
      expect(find.text("This device can't display 360° views"), findsOneWidget);
      expect(find.text('Open photo gallery'), findsOneWidget);
      expect(find.text('Try again'), findsNothing);
    });

    testWidgets('web preview shows an honest message and a labelled still image', (tester) async {
      await _pump(tester, location: tourLocation, webPreview: true);
      await tester.pumpAndSettle();
      expect(FakePanoramaSurface.last, isNull);
      expect(find.textContaining('The 360° viewer runs in the Android and iOS apps'), findsOneWidget);
      expect(find.text('Still preview (not the 360° tour)'), findsWidgets);
      await _pumpFor(tester, 200);
    });

    for (final lang in ['ar', 'en']) {
      testWidgets('200% text ($lang): chrome and sheets do not overflow', (tester) async {
        await _pump(tester, location: tourLocation, language: lang, bigText: true);
        await _showScene(tester);
        expect(tester.takeException(), isNull);
        await tester.tap(find.byTooltip(lang == 'ar' ? 'عن هذه الجولة' : 'About this tour'));
        await _pumpFor(tester);
        expect(tester.takeException(), isNull);
        await _pumpFor(tester, 5200);
      });
    }

    testWidgets('leaving the screen disposes the viewer', (tester) async {
      await _pump(tester, location: tourLocation);
      await _showScene(tester);
      final surface = _surface;
      await tester.tap(find.byTooltip('Back').first);
      await _pumpFor(tester, 5400);
      expect(surface.disposed, isTrue);
      expect(find.byType(TourViewerScreen), findsNothing);
    });
  });

  setUp(() => FakePanoramaSurface.last = null);
}
