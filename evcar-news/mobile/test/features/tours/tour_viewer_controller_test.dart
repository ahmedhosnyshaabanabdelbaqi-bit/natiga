import 'package:evcar_news/features/tours/application/motion_look.dart';
import 'package:evcar_news/features/tours/application/tour_viewer_controller.dart';
import 'package:evcar_news/features/tours/domain/rendition_policy.dart';
import 'package:evcar_news/features/tours/domain/tour_models.dart';
import 'package:evcar_news/features/tours/domain/viewer_protocol.dart';
import 'package:flutter_test/flutter_test.dart';

import 'tours_fixtures.dart';

void main() {
  late ScriptedDownloader downloader;
  late FakeMotionSource motion;
  final hotspots = <Hotspot>[];
  var motionUnavailable = 0;

  TourViewerController make({TourDetail? tour, DeviceDisplayProfile? device}) {
    downloader = ScriptedDownloader();
    motion = FakeMotionSource();
    hotspots.clear();
    motionUnavailable = 0;
    return TourViewerController(
      tour: tour ?? demoTour(),
      device: device ?? const DeviceDisplayProfile(physicalLongSide: 2400),
      loader: scriptedLoader(downloader),
      surfaceFactory: fakeSurfaceFactory,
      motion: motion,
      locale: 'ar',
      strings: const ViewerStrings(loading: 'l', loadFailed: 'f', webglUnsupported: 'w'),
      allowInsecureMedia: true,
      onHotspot: (_, h) => hotspots.add(h),
      onMotionUnavailable: () => motionUnavailable++,
    );
  }

  FakePanoramaSurface surface() => FakePanoramaSurface.last!;

  Future<void> settle() async {
    for (var i = 0; i < 20; i++) {
      await Future<void>.delayed(Duration.zero);
    }
  }

  test('ready → init with the tour; images stream preview first, then the rendition', () async {
    final c = make();
    addTearDown(c.dispose);
    expect(c.phase, ViewerPhase.starting);
    surface().emitRaw('{"type":"ready","v":2,"webgl":true,"maxTextureSize":8192}');
    await settle();
    expect(c.phase, ViewerPhase.loading);
    final init = surface().ofType('init').single;
    expect(init.json['firstSceneId'], driverSceneId);
    expect(init.json['locale'], 'ar');

    surface().emitRaw('{"type":"needImages","sceneId":"$driverSceneId"}');
    await settle();
    expect(downloader.requested, [
      'http://localhost:3108/media/demo/panoramas/d0000000-0000-4000-8000-000000000051/preview-1024.jpg',
      'http://localhost:3108/media/demo/panoramas/d0000000-0000-4000-8000-000000000051/rendition-2048.jpg',
    ]);
    final images = surface().ofType('image');
    expect(images.map((i) => i.json['quality']), ['preview', 'full']);

    surface().emitRaw('{"type":"sceneShown","sceneId":"$driverSceneId","quality":"preview"}');
    expect(c.phase, ViewerPhase.showing);
    expect(c.shownQuality, PanoramaQuality.preview);
    surface().emitRaw('{"type":"sceneShown","sceneId":"$driverSceneId","quality":"full"}');
    expect(c.shownQuality, PanoramaQuality.full);
    expect(c.loadingFull, isFalse);
  });

  test('seat switch = another panorama; scene-link hotspot jumps with its direction', () async {
    final c = make();
    addTearDown(c.dispose);
    surface().emit(const ViewerReady(webgl: true, maxTextureSize: 4096));
    await settle();
    c.selectScene(rearSceneId);
    await settle();
    expect(c.currentSceneId, rearSceneId);
    expect(c.shownQuality, isNull);
    expect(surface().ofType('show').last.json['sceneId'], rearSceneId);

    c.selectScene(driverSceneId);
    surface().emitRaw('{"type":"hotspot","sceneId":"$driverSceneId","hotspotId":"$sceneLinkHotspotId"}');
    await settle();
    final show = surface().ofType('show').last;
    expect(show.json['sceneId'], rearSceneId);
    expect(show.json['yaw'], 0);
    expect(hotspots, isEmpty, reason: 'scene links do not open a sheet');
  });

  test('other hotspots go to the UI; forged ids are ignored', () async {
    final c = make();
    addTearDown(c.dispose);
    surface().emitRaw('{"type":"hotspot","sceneId":"$driverSceneId","hotspotId":"$infoHotspotId"}');
    surface().emitRaw('{"type":"hotspot","sceneId":"$driverSceneId","hotspotId":"$specHotspotId"}');
    surface().emitRaw('{"type":"hotspot","sceneId":"$driverSceneId","hotspotId":"forged"}');
    surface().emitRaw('{"type":"hotspot","sceneId":"$rearSceneId","hotspotId":"$infoHotspotId"}');
    expect(hotspots.map((h) => h.type), [HotspotType.info, HotspotType.specLink]);
  });

  test('no WebGL → failed state', () async {
    final c = make();
    addTearDown(c.dispose);
    surface().emit(const ViewerReady(webgl: false));
    expect(c.phase, ViewerPhase.failed);
    expect(c.failure, ViewerFailure.webglUnsupported);
    expect(surface().ofType('init'), isEmpty);
  });

  test('preview and rendition both fail → load failed; retry reloads the page', () async {
    final c = make();
    addTearDown(c.dispose);
    downloader.failing.add('localhost');
    surface().emit(const ViewerReady(webgl: true));
    await settle();
    surface().emit(const ViewerNeedsImages(driverSceneId));
    await settle();
    expect(c.phase, ViewerPhase.failed);
    expect(c.failure, ViewerFailure.loadFailed);
    await c.retry();
    expect(c.phase, ViewerPhase.starting);
    expect(surface().reloads, 1);
  });

  test('rendition fails after the preview → preview stays, HD can be retried', () async {
    final c = make();
    addTearDown(c.dispose);
    downloader.failing.add('rendition-2048');
    surface().emit(const ViewerReady(webgl: true));
    await settle();
    surface().emit(const ViewerNeedsImages(driverSceneId));
    await settle();
    surface().emit(const ViewerSceneShown(driverSceneId, PanoramaQuality.preview));
    expect(c.phase, ViewerPhase.showing);
    expect(c.fullFailed, isTrue);
    downloader.failing.clear();
    await c.retryFull();
    await settle();
    expect(surface().ofType('image').where((i) => i.json['quality'] == 'full'), isNotEmpty);
  });

  test('tiles: preview, then useMultires; tile failure falls back to the rendition', () async {
    final json = copyJson(tourFixture('tour_detail_en'))['data'] as Map<String, dynamic>;
    ((json['scenes'] as List)[0] as Map)['panorama'] = {
      ...((json['scenes'] as List)[0] as Map)['panorama'] as Map<String, dynamic>,
      'multires': {
        'basePath': 'http://localhost:3108/media/x/tiles',
        'path': '/%l/%s%y_%x',
        'fallbackPath': '/fallback/%s',
        'extension': 'jpg',
        'tileResolution': 512,
        'maxLevel': 3,
        'cubeResolution': 1296,
      },
    };
    final c = make(tour: TourDetail.parse(json), device: const DeviceDisplayProfile(physicalLongSide: 3200));
    addTearDown(c.dispose);
    surface().emit(const ViewerReady(webgl: true, maxTextureSize: 8192));
    await settle();
    final initScenes = surface().ofType('init').single.json['scenes']! as List;
    expect((initScenes[0] as Map)['multires'], isNotNull);
    surface().emit(const ViewerNeedsImages(driverSceneId));
    await settle();
    expect(surface().types.where((t) => t == 'useMultires'), hasLength(1));
    expect(downloader.requested.where((u) => u.contains('rendition')), isEmpty, reason: 'tiles instead');
    surface().emitRaw('{"type":"multiresFailed","sceneId":"$driverSceneId"}');
    await settle();
    expect(downloader.requested.where((u) => u.contains('rendition')), hasLength(1));
  });

  testWidgets('motion control: sensors only while on and visible; unavailable without events', (tester) async {
    {
      final c = make();
      surface().emit(const ViewerReady(webgl: true));
      c.toggleMotion();
      expect(c.motionState, MotionState.on);
      expect(motion.listening, isTrue);

      c.pause();
      await tester.pump();
      expect(motion.listening, isFalse, reason: 'stopped when hidden / backgrounded');
      expect(surface().types.last, 'pause');
      c.resume();
      expect(motion.listening, isTrue);

      await tester.pump(const Duration(seconds: 3));
      expect(c.motionState, MotionState.unavailable);
      expect(motionUnavailable, 1);
      expect(motion.listening, isFalse);

      c.dispose();
      expect(surface().disposed, isTrue);
    }
  });

  testWidgets('motion samples become look commands once a scene is shown', (tester) async {
    {
      final c = make();
      surface().emit(const ViewerReady(webgl: true));
      surface().emit(const ViewerSceneShown(driverSceneId, PanoramaQuality.preview));
      c.toggleMotion();
      final t0 = DateTime(2026);
      motion.accel.add(Vec3Sample(0, 9.81, 0, t0));
      motion.gyro.add(Vec3Sample(0, 1, 0, t0));
      motion.gyro.add(Vec3Sample(0, 1, 0, t0.add(const Duration(milliseconds: 100))));
      await tester.pump(const Duration(milliseconds: 40));
      final look = surface().ofType('look');
      expect(look, isNotEmpty);
      expect(look.first.json['yawDelta'] as double, lessThan(0));
      expect(look.first.json['pitch'], closeTo(0, 0.01));
      c.toggleMotion();
      expect(motion.listening, isFalse);
      c.dispose();
    }
  });
}
