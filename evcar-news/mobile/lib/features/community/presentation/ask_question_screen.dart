import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';
import '../../auth/presentation/auth_gate.dart';

/// Ask a question (`/questions/ask`); requires an account; moderated.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `community` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class AskQuestionScreen extends StatelessWidget {
  const AskQuestionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.communityAskTitle)),
      body: AuthGate(
        returnTo: AppRoutes.askQuestion,
        builder: (context, user) => const UnderConstructionView(requestedPath: AppRoutes.askQuestion),
      ),
    );
  }
}
