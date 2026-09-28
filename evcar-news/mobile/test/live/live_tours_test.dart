// Contract check of the 360° tours data layer against a REAL running backend.
// The viewer itself (WebView + Pannellum) cannot run in the web preview or in
// `flutter test`; this proves the data it is fed parses: scenes, panorama
// preview/renditions/multires tiles and hotspots.
//
// Skipped unless EVCAR_LIVE_API is set, so `flutter test` stays hermetic:
//
//   EVCAR_LIVE_API=http://localhost:3000/api/v1 flutter test test/live/live_tours_test.dart
//
// Read-only. Needs at least one published tour (e.g. `npm run db:seed:demo`).
import 'dart:io';

import 'package:evcar_news/core/api/api_client.dart';
import 'package:evcar_news/core/api/dio_factory.dart';
import 'package:evcar_news/core/api/interceptors/request_headers_interceptor.dart';
import 'package:evcar_news/core/cache/json_cache.dart';
import 'package:evcar_news/features/tours/data/tours_repository.dart';
import 'package:flutter_test/flutter_test.dart';

final _base = Platform.environment['EVCAR_LIVE_API'];

ToursRepository _repo(String lang) {
  RequestLocale locale() => RequestLocale(languageCode: lang, marketCode: 'EG');
  final factory = DioFactory(baseUrl: _base!, locale: locale, appVersion: () => 'live-test');
  return ToursRepository(api: ApiClient(factory.createBare()), cache: MemoryJsonCache(), locale: locale);
}

void main() {
  final skip = _base == null ? 'EVCAR_LIVE_API not set' : null;

  for (final lang in ['ar', 'en']) {
    test('featured → detail parse against the live API ($lang)', () async {
      final repo = _repo(lang);
      final featured = await repo.featured();
      expect(featured.data, isNotEmpty, reason: 'seed at least one published tour');
      for (final card in featured.data) {
        final detail = await repo.tour(card.id, maxWidth: 4096);
        final tour = detail.data;
        expect(tour.card.id, card.id);
        expect(tour.scenes, isNotEmpty);
        expect(tour.scenes.map((s) => s.id), contains(tour.initialSceneId));
        for (final scene in tour.scenes) {
          final p = scene.panorama;
          expect(p.isEquirectangular, isTrue);
          // Something the viewer can always show: a preview or a rendition.
          expect(p.preview != null || p.renditions.isNotEmpty, isTrue, reason: 'scene ${scene.id} has no image');
          for (final r in p.renditions) {
            expect(r.width, lessThanOrEqualTo(4096), reason: 'maxWidth is honoured');
          }
        }
      }
    }, skip: skip);
  }
}
