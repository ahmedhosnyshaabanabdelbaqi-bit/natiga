import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Saved for offline reading (`/saved`): articles and spec sheets from SavedItemsStore, with their saved date.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `favorites` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class SavedOfflineScreen extends StatelessWidget {
  const SavedOfflineScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.favoritesSavedOfflineTitle,
      requestedPath: AppRoutes.savedOffline,
    );
  }
}
