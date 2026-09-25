import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';
import '../../auth/presentation/auth_gate.dart';

/// Notification preferences (`/notifications/preferences`): brands, models, market, categories, quiet hours, unsubscribe.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `notifications` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class NotificationPreferencesScreen extends StatelessWidget {
  const NotificationPreferencesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.notificationsPreferencesTitle)),
      body: AuthGate(
        returnTo: AppRoutes.notificationPreferences,
        builder: (context, user) => const UnderConstructionView(requestedPath: AppRoutes.notificationPreferences),
      ),
    );
  }
}
