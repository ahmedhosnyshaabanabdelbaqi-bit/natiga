import '../../../app/router/app_routes.dart';

/// Community locations with the optional query parameters the community
/// screens understand (the router passes only path parameters; the screens
/// read these from the current URI):
///
/// * `/cars/:slug/reviews?variant=<variant id or slug>` — preselects a trim.
/// * `/cars/:slug/reviews/new?variant=<id|slug>&review=<review id>` — trim
///   to review / edit my existing review.
/// * `/questions/ask?model=<car slug>` — question about a car.
abstract final class CommunityRoutes {
  static String carReviews(String carSlug, {String? variant}) =>
      _q(AppRoutes.carReviews(carSlug), {'variant': variant});

  static String writeReview(String carSlug, {String? variant, String? reviewId}) =>
      _q(AppRoutes.writeCarReview(carSlug), {'variant': variant, 'review': reviewId});

  static String ask({String? modelSlug}) => _q(AppRoutes.askQuestion, {'model': modelSlug});

  static String _q(String path, Map<String, String?> query) {
    final q = {
      for (final e in query.entries)
        if (e.value != null && e.value!.isNotEmpty) e.key: e.value!,
    };
    return q.isEmpty ? path : Uri(path: path, queryParameters: q).toString();
  }
}
