import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Notification center and preferences (`/notifications`).
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `notifications` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(title: context.l10n.notificationsTitle, requestedPath: AppRoutes.notifications);
  }
}
