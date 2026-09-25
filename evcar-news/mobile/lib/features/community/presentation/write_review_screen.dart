import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';
import '../../auth/presentation/auth_gate.dart';

/// Write an owner review (`/cars/:slug/reviews/new`); requires an account; moderated.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `community` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class WriteReviewScreen extends StatelessWidget {
  const WriteReviewScreen({super.key, required this.carSlug});

  /// Car (model) slug.
  final String carSlug;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.communityWriteReviewTitle)),
      body: AuthGate(
        returnTo: AppRoutes.writeCarReview(carSlug),
        builder: (context, user) => UnderConstructionView(requestedPath: AppRoutes.writeCarReview(carSlug)),
      ),
    );
  }
}
