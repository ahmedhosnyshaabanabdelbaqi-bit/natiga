import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Questions & answers (`/questions`, optional `?model=` filter).
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `community` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class QuestionsScreen extends StatelessWidget {
  const QuestionsScreen({super.key, this.modelSlug});

  /// Optional model filter.
  final String? modelSlug;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.communityQuestionsTitle,
      requestedPath: AppRoutes.questions(model: modelSlug),
    );
  }
}
