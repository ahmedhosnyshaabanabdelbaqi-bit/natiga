import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Encyclopedia entry (`/encyclopedia/:slug`).
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `encyclopedia` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class EncyclopediaEntryScreen extends StatelessWidget {
  const EncyclopediaEntryScreen({super.key, required this.slug});

  /// Entry slug.
  final String slug;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.encyclopediaEntryTitle,
      requestedPath: AppRoutes.encyclopediaEntry(slug),
    );
  }
}
