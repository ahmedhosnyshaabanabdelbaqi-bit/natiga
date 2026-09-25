import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// One question with its answers (`/questions/:id`).
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `community` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class QuestionDetailScreen extends StatelessWidget {
  const QuestionDetailScreen({super.key, required this.questionId});

  /// Question id.
  final String questionId;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.communityQuestionTitle,
      requestedPath: AppRoutes.question(questionId),
    );
  }
}
