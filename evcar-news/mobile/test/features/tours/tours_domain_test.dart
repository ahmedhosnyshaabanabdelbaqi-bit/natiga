import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:evcar_news/features/tours/application/motion_look.dart';
import 'package:evcar_news/features/tours/data/panorama_cache.dart';
import 'package:evcar_news/features/tours/data/tours_repository.dart';
import 'package:evcar_news/features/tours/domain/rendition_policy.dart';
import 'package:evcar_news/features/tours/domain/tour_models.dart';
import 'package:evcar_news/features/tours/domain/viewer_protocol.dart';
import 'package:evcar_news/features/tours/presentation/widgets/tour_sheets.dart';
import 'package:evcar_news/features/tours/presentation/widgets/webview_panorama_surface.dart';
import 'package:flutter_test/flutter_test.dart';

import 'tours_fixtures.dart';

void main() {
  group('models (captured API responses)', () {
    test('tour detail parses every field of the contract', () {
      final t = demoTour('en');
      expect(t.id, demoTourId);
      expect(t.card.carName, 'Demo Motors Demo EV One Standard (demo)');
      expect(t.card.modelSlug, 'demo-motors-ev-one');
      expect(t.card.modelYear, 2025);
      expect(t.card.marketCode, 'EG');
      expect(t.card.driveSide, DriveSide.lhd);
      expect(t.card.interiorColorName, 'Demo grey (fictional)');
      expect(t.card.interiorColorHex, '#8A8F98');
      expect(t.card.isDemo, isTrue);
      expect(t.card.demoLabel, 'Demo — not a real car interior');
      expect(t.card.seatScenes.map((s) => s.position), [ScenePosition.driver, ScenePosition.rear]);
      expect(t.mediaOrigin, 'http://localhost:3108');
      expect(t.initialSceneId, driverSceneId);
      expect(t.isReference, isFalse);
      expect(t.scenes, hasLength(2));
      final s = t.initialScene;
      expect(s.view.hfov, 100);
      expect(s.view.minPitch, isNull, reason: 'missing stays null');
      expect(s.panorama.preview!.width, 1024);
      expect(s.panorama.renditions.single.width, 2048);
      expect(s.panorama.multires, isNull);
      expect(s.attribution.licenseType, 'owned');
      expect(s.hotspots.map((h) => h.type), [HotspotType.info, HotspotType.specLink, HotspotType.sceneLink]);
      final spec = s.hotspot(specHotspotId)!.spec!;
      expect(spec.value, 60);
      expect(spec.unit, 'kWh');
      expect(s.hotspot(sceneLinkHotspotId)!.targetSceneId, rearSceneId);
      expect(t.attributions.single.licenseType, 'owned');
    });

    test('Arabic response keeps Arabic texts', () {
      final t = demoTour('ar');
      expect(t.card.demoLabel, contains('تجريبي'));
      expect(t.scenes.first.title, contains('السائق'));
    });

    test('list and featured parse', () {
      final page = parseToursPage(tourFixture('tours_list_ar'));
      expect(page.items.single.id, demoTourId);
      expect(page.hasMore, isFalse);
      final featured = parseToursPage(tourFixture('tours_featured_ar'));
      expect(featured.items.single.isDemo, isTrue);
    });

    test('broken hotspots and unviewable scenes are dropped; nothing viewable throws', () {
      final json = copyJson(tourFixture('tour_detail_en'))['data'] as Map<String, dynamic>;
      final scenes = json['scenes'] as List;
      final hs = (scenes[0] as Map)['hotspots'] as List;
      hs.add({'id': 'x1', 'type': 'scene_link', 'yaw': 0, 'pitch': 0, 'title': 'no target'});
      hs.add({'id': 'x2', 'type': 'hologram', 'yaw': 0, 'pitch': 0, 'title': 'unknown'});
      hs.add({'id': 'x3', 'type': 'info', 'yaw': 'NaN', 'pitch': 0, 'title': 'bad yaw'});
      ((scenes[1] as Map)['panorama'] as Map)
        ..['preview'] = null
        ..['renditions'] = []
        ..['multires'] = null;
      final t = TourDetail.parse(json);
      expect(t.scenes, hasLength(1));
      expect(t.scenes.first.hotspots, hasLength(3));

      ((scenes[0] as Map)['panorama'] as Map)
        ..['preview'] = null
        ..['renditions'] = [];
      expect(() => TourDetail.parse(json), throwsFormatException);
    });

    test('spec value null stays null (shown as Not available)', () {
      final spec = HotspotSpec.tryParse({'key': 'k', 'label': 'L', 'value': null})!;
      expect(spec.value, isNull);
      expect(HotspotSpec.tryParse({'key': 'k', 'label': 'L', 'value': double.nan})!.value, isNull);
    });

    test('multires config is validated', () {
      final ok = {
        'basePath': 'https://media.example/public/media/a/tiles',
        'path': '/%l/%s%y_%x',
        'fallbackPath': '/fallback/%s',
        'extension': 'jpg',
        'tileResolution': 512,
        'maxLevel': 3,
        'cubeResolution': 1296,
      };
      expect(MultiresConfig.tryParse(ok), isNotNull);
      expect(MultiresConfig.tryParse({...ok, 'path': '"><script>'}), isNull);
      expect(MultiresConfig.tryParse({...ok, 'extension': 'svg'}), isNull);
      expect(MultiresConfig.tryParse({...ok, 'maxLevel': 99}), isNull);
    });
  });

  group('rendition policy', () {
    PanoramaSource source({bool tiles = false, List<int> widths = const [2048, 4096, 8192]}) => PanoramaSource(
      assetId: 'a',
      preview: const PanoramaImage(url: 'https://m/p.jpg', width: 1024, height: 512),
      renditions: [for (final w in widths) PanoramaImage(url: 'https://m/w$w.jpg', width: w, height: w ~/ 2)],
      multires: tiles
          ? const MultiresConfig(
              basePath: 'https://m/tiles',
              path: '/%l/%s%y_%x',
              fallbackPath: '/fallback/%s',
              extension: 'jpg',
              tileResolution: 512,
              maxLevel: 3,
              cubeResolution: 1296,
            )
          : null,
    );

    DeviceDisplayProfile phone(double w, double h, double dpr, {int? tex}) =>
        DeviceDisplayProfile.fromWindow(logicalWidth: w, logicalHeight: h, devicePixelRatio: dpr, maxTextureSize: tex);

    test('never loads the largest (8192) image as one equirectangular file', () {
      final flagship = phone(412, 915, 3.5); // 3202 px long side
      final plan = chooseRendition(source(), flagship);
      expect(plan.rendition!.width, 4096);
      expect(plan.preview!.width, 1024);
      expect(flagship.apiMaxWidth, 4096);
    });

    test('low-end screens get 2048', () {
      final small = phone(360, 640, 1.5); // 960 px
      expect(small.lowMemory, isTrue);
      expect(chooseRendition(source(), small).rendition!.width, 2048);
      expect(small.apiMaxWidth, 2048);
    });

    test('WebGL texture limit caps the width (Pannellum: width ≤ 2 × MAX_TEXTURE_SIZE)', () {
      final p = phone(412, 915, 3, tex: 1024);
      expect(p.equirectCap, 2048);
      expect(chooseRendition(source(), p).rendition!.width, 2048);
    });

    test('multires only when available, device not low-end, and more detail is wanted', () {
      final flagship = phone(412, 915, 3.5);
      expect(chooseRendition(source(tiles: true), flagship).multires, isNotNull);
      expect(chooseRendition(source(tiles: true), flagship).rendition!.width, 4096, reason: 'fallback kept');
      expect(chooseRendition(source(tiles: true), phone(360, 640, 1.5)).multires, isNull);
      expect(chooseRendition(source(), flagship).multires, isNull);
    });

    test('all renditions too big → no rendition (preview stays)', () {
      final plan = chooseRendition(source(widths: [8192]), phone(360, 640, 1.5));
      expect(plan.rendition, isNull);
      expect(plan.preview, isNotNull);
    });

    test('without a preview the smallest small rendition is shown first', () {
      const src = PanoramaSource(
        assetId: 'a',
        renditions: [
          PanoramaImage(url: 'https://m/2048.jpg', width: 2048),
          PanoramaImage(url: 'https://m/4096.jpg', width: 4096),
        ],
      );
      final plan = chooseRendition(src, phone(412, 915, 3.5));
      expect(plan.preview!.width, 2048);
      expect(plan.rendition!.width, 4096);
    });

    test('demo fixture on a phone: preview 1024 then rendition 2048', () {
      final plan = chooseRendition(demoTour().initialScene.panorama, phone(412, 915, 2.6));
      expect(plan.preview!.url, endsWith('preview-1024.jpg'));
      expect(plan.rendition!.url, endsWith('rendition-2048.jpg'));
    });
  });

  group('viewer protocol', () {
    final tour = demoTour();

    test('valid events parse', () {
      expect(parseViewerEvent('{"type":"ready","v":2,"webgl":true,"maxTextureSize":8192}'), isA<ViewerReady>());
      final shown = parseViewerEvent('{"type":"sceneShown","sceneId":"$driverSceneId","quality":"full"}', tour: tour);
      expect((shown! as ViewerSceneShown).quality, PanoramaQuality.full);
      final tap = parseViewerEvent(
        '{"type":"hotspot","sceneId":"$driverSceneId","hotspotId":"$infoHotspotId"}',
        tour: tour,
      );
      expect((tap! as ViewerHotspotTapped).hotspotId, infoHotspotId);
      expect(parseViewerEvent('{"type":"needImages","sceneId":"$rearSceneId"}', tour: tour), isA<ViewerNeedsImages>());
      expect(
        parseViewerEvent('{"type":"error","code":"LOAD_FAILED","sceneId":null,"message":"x"}', tour: tour),
        isA<ViewerError>(),
      );
    });

    test('anything unexpected is ignored', () {
      final bad = [
        '',
        'not json',
        '[]',
        '"ready"',
        '{"type":"eval","code":"alert(1)"}',
        '{"type":"ready","v":1,"webgl":true}',
        '{"type":"ready","v":2,"webgl":"yes"}',
        '{"type":"ready","v":2,"webgl":true,"maxTextureSize":-1}',
        '{"type":"ready","v":2,"webgl":true,"extra":1}',
        '{"type":"sceneShown","sceneId":"$driverSceneId","quality":"ultra"}',
        '{"type":"sceneShown","sceneId":"../../etc","quality":"full"}',
        '{"type":"sceneShown","sceneId":"unknown-scene","quality":"full"}',
        '{"type":"hotspot","sceneId":"$driverSceneId","hotspotId":"not-in-scene"}',
        '{"type":"hotspot","sceneId":"$rearSceneId","hotspotId":"$infoHotspotId"}',
        '{"type":"error","code":"PWNED"}',
        '{"type":"error","code":"LOAD_FAILED","message":"${'x' * 400}"}',
        '{"type":"needImages","sceneId":"$driverSceneId","url":"https://evil"}',
        '{"type":"hotspot","sceneId":"$driverSceneId","hotspotId":"$infoHotspotId","padding":"${'a' * 3000}"}',
      ];
      for (final raw in bad) {
        expect(parseViewerEvent(raw, tour: tour), isNull, reason: raw);
      }
    });

    test('init carries plain-text labels, kinds and views; no URLs of single images', () {
      final c = ViewerCommand.init(
        tour: tour,
        locale: 'ar',
        strings: const ViewerStrings(loading: 'l', loadFailed: 'f', webglUnsupported: 'w'),
        firstSceneId: driverSceneId,
        allowInsecureMedia: false,
      );
      final j = jsonDecode(c.encode()) as Map<String, dynamic>;
      expect(j['v'], kViewerProtocolVersion);
      expect(j['mediaOrigin'], 'http://localhost:3108');
      expect(j['allowInsecure'], isFalse);
      final scenes = j['scenes'] as List;
      expect(scenes, hasLength(2));
      final hs = (scenes[0] as Map)['hotspots'] as List;
      expect(hs.map((h) => (h as Map)['kind']), ['info', 'info', 'scene']);
      expect(hs.map((h) => (h as Map)['icon']), ['info', 'spec', 'scene']);
      expect(c.encode(), isNot(contains('rendition-2048')), reason: 'images travel as bytes');
    });

    test('jsReceiveCall embeds the JSON as one string literal', () {
      final c = ViewerCommand.show(driverSceneId);
      final js = jsReceiveCall(c);
      expect(js, startsWith('window.evcarViewer&&window.evcarViewer.receive("'));
      expect(js, endsWith('");'));
      // Line/paragraph separators are escaped (older JS engines).
      final tricky = ViewerCommand.init(
        tour: TourDetail.parse({
          ...(copyJson(tourFixture('tour_detail_en'))['data'] as Map<String, dynamic>),
          'scenes': [
            {
              ...((tourFixture('tour_detail_en')['data'] as Map)['scenes'] as List).first as Map<String, dynamic>,
              'title': 'a\u2028b\u2029c"</script><script>alert(1)</script>',
            },
          ],
        }),
        locale: 'en',
        strings: const ViewerStrings(loading: '', loadFailed: '', webglUnsupported: ''),
        firstSceneId: driverSceneId,
        allowInsecureMedia: false,
      );
      final js2 = jsReceiveCall(tricky);
      expect(js2, isNot(contains('\u2028')));
      expect(js2, isNot(contains('\u2029')));
      // Decoding the literal gives back exactly the JSON.
      final literal = js2.substring('window.evcarViewer&&window.evcarViewer.receive('.length, js2.length - 2);
      expect(jsonDecode(literal), tricky.encode());
    });

    test('image chunks: signature check, size limit, lossless reassembly', () {
      final bytes = Uint8List.fromList([...fakeJpeg(10), ...List.generate(500000, (i) => i % 256)]);
      final chunks = imageChunkCommands(sceneId: driverSceneId, quality: PanoramaQuality.full, bytes: bytes);
      expect(chunks.length, (bytes.length / kImageChunkBytes).ceil());
      final back = <int>[];
      for (final (i, c) in chunks.indexed) {
        expect(c.json['seq'], i);
        expect(c.json['total'], chunks.length);
        expect(c.json['mime'], 'image/jpeg');
        back.addAll(base64Decode(c.json['data']! as String));
      }
      expect(back, bytes);

      expect(
        () => imageChunkCommands(
          sceneId: driverSceneId,
          quality: PanoramaQuality.full,
          bytes: Uint8List.fromList(utf8.encode('<html>')),
        ),
        throwsFormatException,
      );
      expect(
        () => imageChunkCommands(sceneId: driverSceneId, quality: PanoramaQuality.full, bytes: Uint8List(0)),
        throwsFormatException,
      );
      expect(sniffImageMime(Uint8List.fromList([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])), 'image/png');
      expect(sniffImageMime(Uint8List.fromList([...ascii.encode('RIFF'), 0, 0, 0, 0, ...ascii.encode('WEBP')])), 'image/webp');
      expect(sniffImageMime(Uint8List.fromList(ascii.encode('GIF89a'))), isNull);
    });

    test('WebView navigation allows only the bundled viewer page', () {
      expect(isAllowedViewerNavigation('file:///android_asset/flutter_assets/assets/panorama/viewer.html'), isTrue);
      expect(
        isAllowedViewerNavigation('file:///var/containers/Bundle/App.app/Frameworks/App.framework/flutter_assets/assets/panorama/viewer.html'),
        isTrue,
      );
      for (final url in [
        'https://evil.example/viewer.html',
        'http://localhost:3000/',
        'file:///android_asset/flutter_assets/assets/panorama/viewer.html?x=1',
        'file:///android_asset/flutter_assets/assets/panorama/viewer.html#x',
        'file:///etc/passwd',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'about:blank',
        'intent://scan/#Intent;scheme=zxing;end',
      ]) {
        expect(isAllowedViewerNavigation(url), isFalse, reason: url);
      }
    });

    test('hotspot videos: allow-listed embeds or files on the media origin only', () {
      HotspotVideo v(String kind, String url) => HotspotVideo(kind: kind, url: url, provider: 'youtube');
      expect(isAllowedVideoUrl(v('embed', 'https://www.youtube-nocookie.com/embed/abc')), isTrue);
      expect(isAllowedVideoUrl(v('embed', 'https://player.vimeo.com/video/1')), isTrue);
      expect(isAllowedVideoUrl(v('embed', 'https://www.youtube.com/watch?v=abc')), isFalse);
      expect(isAllowedVideoUrl(v('embed', 'http://player.vimeo.com/video/1')), isFalse);
      expect(isAllowedVideoUrl(v('file', 'https://media.x/v.mp4'), mediaOrigin: 'https://media.x'), isTrue);
      expect(isAllowedVideoUrl(v('file', 'https://other.x/v.mp4'), mediaOrigin: 'https://media.x'), isFalse);
    });
  });

  group('panorama cache & loader', () {
    test('memory cache evicts least recently used by bytes', () async {
      final c = MemoryPanoramaCache(maxBytes: 250);
      await c.write('a', fakeJpeg(100));
      await c.write('b', fakeJpeg(100));
      await c.read('a'); // a is now most recent
      await c.write('c', fakeJpeg(100));
      expect(c.keys, ['a', 'c']);
      expect(await c.sizeBytes(), 200);
    });

    test('file cache respects its byte limit, oldest viewed first', () async {
      final dir = await Directory.systemTemp.createTemp('pano_cache_test');
      addTearDown(() async {
        if (dir.existsSync()) await dir.delete(recursive: true);
      });
      final c = FilePanoramaCache(directory: dir, maxBytes: 250);
      await c.write('https://m/a', fakeJpeg(100));
      await Future<void>.delayed(const Duration(milliseconds: 20));
      await c.write('https://m/b', fakeJpeg(100));
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(await c.read('https://m/a'), isNotNull); // touch a
      await Future<void>.delayed(const Duration(milliseconds: 20));
      await c.write('https://m/c', fakeJpeg(100));
      expect(await c.sizeBytes(), lessThanOrEqualTo(250));
      expect(await c.read('https://m/b'), isNull, reason: 'least recently viewed evicted');
      expect(await c.read('https://m/a'), isNotNull);
      expect(await c.read('https://m/c'), isNotNull);
      await c.clear();
      expect(await c.sizeBytes(), 0);
    });

    test('loader: origin, scheme, signature; cache hit skips the network', () async {
      final d = ScriptedDownloader();
      final strict = scriptedLoader(d, allowInsecure: false);
      await expectLater(
        strict.load('http://localhost:3108/x.jpg', mediaOrigin: 'http://localhost:3108'),
        throwsA(isA<PanoramaLoadException>().having((e) => e.reason, 'reason', 'origin')),
      );
      await expectLater(
        strict.load('https://evil.example/x.jpg', mediaOrigin: 'https://media.example'),
        throwsA(isA<PanoramaLoadException>()),
      );
      expect(d.requested, isEmpty);

      final loader = scriptedLoader(d);
      await loader.load('https://media.example/a.jpg', mediaOrigin: 'https://media.example');
      await loader.load('https://media.example/a.jpg', mediaOrigin: 'https://media.example');
      expect(d.requested, ['https://media.example/a.jpg']);

      final html = PanoramaLoader(
        cache: MemoryPanoramaCache(),
        download: (url, {onProgress, cancel}) async => Uint8List.fromList(utf8.encode('<html></html>')),
      );
      await expectLater(
        html.load('https://media.example/a.jpg', mediaOrigin: 'https://media.example'),
        throwsA(isA<PanoramaLoadException>().having((e) => e.reason, 'reason', 'format')),
      );
    });

    test('cache file names are stable and opaque', () {
      expect(panoramaCacheFileName('https://m/a.jpg'), panoramaCacheFileName('https://m/a.jpg'));
      expect(panoramaCacheFileName('https://m/a.jpg'), isNot(panoramaCacheFileName('https://m/b.jpg')));
      expect(panoramaCacheFileName('https://m/../../x'), matches(RegExp(r'^[0-9a-f]{16}\.pano$')));
    });
  });

  group('motion look filter', () {
    final t0 = DateTime(2026);
    Vec3Sample s(double x, double y, double z, int ms) => Vec3Sample(x, y, z, t0.add(Duration(milliseconds: ms)));

    test('pitch comes from gravity', () {
      final f = MotionLookFilter(smoothing: 1);
      expect(f.pitch, isNull);
      f.addAccelerometer(s(0, 9.81, 0, 0)); // upright portrait
      expect(f.pitch, closeTo(0, 0.01));
      f.addAccelerometer(s(0, 0, -9.81, 10)); // screen facing the floor
      expect(f.pitch, closeTo(90, 0.01));
      f.addAccelerometer(s(0, 0, 9.81, 20)); // lying screen up
      expect(f.pitch, closeTo(-90, 0.01));
    });

    test('turning left (positive rotation about up) lowers the yaw, in any orientation', () {
      final portrait = MotionLookFilter(smoothing: 1)..addAccelerometer(s(0, 9.81, 0, 0));
      portrait
        ..addGyroscope(s(0, 1, 0, 0))
        ..addGyroscope(s(0, 1, 0, 100));
      expect(portrait.takeYawDelta(), closeTo(-5.73, 0.05)); // 0.1 rad
      expect(portrait.takeYawDelta(), 0);

      // Landscape: "up" is the device x axis.
      final landscape = MotionLookFilter(smoothing: 1)..addAccelerometer(s(9.81, 0, 0, 0));
      landscape
        ..addGyroscope(s(-1, 0, 0, 0))
        ..addGyroscope(s(-1, 0, 0, 100));
      expect(landscape.takeYawDelta(), closeTo(5.73, 0.05));
    });

    test('noise and gaps are ignored', () {
      final f = MotionLookFilter(smoothing: 1)..addAccelerometer(s(0, 9.81, 0, 0));
      f
        ..addGyroscope(s(0, 0.005, 0, 0))
        ..addGyroscope(s(0, 0.005, 0, 100));
      expect(f.takeYawDelta(), 0);
      f.addGyroscope(s(0, 2, 0, 2000)); // 1.9 s gap (paused)
      expect(f.takeYawDelta(), 0);
    });
  });
}
