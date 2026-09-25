import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// EV encyclopedia (`/encyclopedia`).
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `encyclopedia` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class EncyclopediaScreen extends StatelessWidget {
  const EncyclopediaScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(title: context.l10n.encyclopediaTitle, requestedPath: AppRoutes.encyclopedia);
  }
}
