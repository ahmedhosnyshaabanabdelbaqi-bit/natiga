import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:evcar_news/features/tours/application/motion_look.dart';
import 'package:evcar_news/features/tours/application/panorama_surface.dart';
import 'package:evcar_news/features/tours/data/panorama_cache.dart';
import 'package:evcar_news/features/tours/domain/tour_models.dart';
import 'package:evcar_news/features/tours/domain/viewer_protocol.dart';
import 'package:flutter/widgets.dart';

/// Real responses of the public tours API captured from a local backend
/// running the DEMO seed (fictional records flagged `isDemo`; the demo
/// panoramas are synthetic grids labelled "DEMO — not a real car interior").
/// Captured 2026-09-25 with `curl http://localhost:3108/api/v1/tours...`.
Map<String, dynamic> tourFixture(String name) =>
    jsonDecode(File('test/features/tours/fixtures/$name.json').readAsStringSync()) as Map<String, dynamic>;

Map<String, dynamic> copyJson(Map<String, dynamic> json) => jsonDecode(jsonEncode(json)) as Map<String, dynamic>;

const demoTourId = 'd0000000-0000-4000-8000-000000000053';
const driverSceneId = 'd0000000-0000-4000-8000-000000000054';
const rearSceneId = 'd0000000-0000-4000-8000-000000000055';
const infoHotspotId = 'd0000000-0000-4000-8000-000000000056';
const specHotspotId = 'd0000000-0000-4000-8000-000000000057';
const sceneLinkHotspotId = 'd0000000-0000-4000-8000-000000000058';

TourDetail demoTour([String lang = 'en']) => TourDetail.parse(tourFixture('tour_detail_$lang')['data']);

/// Bytes that pass the JPEG signature check (not a decodable image — the
/// viewer is faked in unit tests).
Uint8List fakeJpeg([int size = 64]) {
  final b = Uint8List(size);
  b[0] = 0xFF;
  b[1] = 0xD8;
  b[2] = 0xFF;
  for (var i = 3; i < size; i++) {
    b[i] = i % 251;
  }
  return b;
}

/// Records every command; tests push events with [emit].
class FakePanoramaSurface implements PanoramaSurface {
  FakePanoramaSurface({required this.tour, required this.onEvent});

  final TourDetail tour;
  final void Function(ViewerEvent event) onEvent;
  final List<ViewerCommand> sent = [];
  int reloads = 0;
  bool disposed = false;

  static FakePanoramaSurface? last;

  void emit(ViewerEvent e) => onEvent(e);

  /// Simulates the page answering with raw JSON (goes through validation).
  void emitRaw(String raw) {
    final e = parseViewerEvent(raw, tour: tour);
    if (e != null) onEvent(e);
  }

  List<String> get types => sent.map((c) => c.type).toList();

  List<ViewerCommand> ofType(String t) => sent.where((c) => c.type == t).toList();

  @override
  Widget build(BuildContext context) => const ColoredBox(color: Color(0xFF000000), child: SizedBox.expand());

  @override
  Future<void> send(ViewerCommand command) async => sent.add(command);

  @override
  Future<void> reload() async => reloads++;

  @override
  void dispose() => disposed = true;
}

PanoramaSurface fakeSurfaceFactory({required TourDetail tour, required void Function(ViewerEvent event) onEvent}) =>
    FakePanoramaSurface.last = FakePanoramaSurface(tour: tour, onEvent: onEvent);

/// Loader over an in-memory cache with a scripted downloader.
class ScriptedDownloader {
  final List<String> requested = [];
  final Set<String> failing = {};
  Completer<void>? gate;

  Future<Uint8List> call(String url, {void Function(int received, int? total)? onProgress, dynamic cancel}) async {
    requested.add(url);
    if (gate != null) await gate!.future;
    if (failing.any(url.contains)) throw const PanoramaLoadException('network');
    final bytes = fakeJpeg(1000);
    onProgress?.call(500, 1000);
    onProgress?.call(1000, 1000);
    return bytes;
  }
}

PanoramaLoader scriptedLoader(ScriptedDownloader d, {bool allowInsecure = true}) => PanoramaLoader(
  cache: MemoryPanoramaCache(),
  download: (url, {onProgress, cancel}) => d(url, onProgress: onProgress, cancel: cancel),
  allowInsecure: allowInsecure,
);

class FakeMotionSource implements MotionSource {
  final gyro = StreamController<Vec3Sample>.broadcast();
  final accel = StreamController<Vec3Sample>.broadcast();

  @override
  Stream<Vec3Sample> gyroscope() => gyro.stream;

  @override
  Stream<Vec3Sample> accelerometer() => accel.stream;

  bool get listening => gyro.hasListener || accel.hasListener;

  Future<void> close() async {
    await gyro.close();
    await accel.close();
  }
}
