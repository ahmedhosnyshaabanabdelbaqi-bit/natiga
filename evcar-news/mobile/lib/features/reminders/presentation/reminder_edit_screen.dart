import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';
import '../../auth/presentation/auth_gate.dart';

/// New (`/reminders/new`) or edit (`/reminders/:id/edit`) a maintenance/insurance/licence reminder (local notification).
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `reminders` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class ReminderEditScreen extends StatelessWidget {
  const ReminderEditScreen({super.key, this.reminderId});

  /// Reminder id; null for a new one.
  final String? reminderId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.remindersNewTitle)),
      body: AuthGate(
        returnTo: reminderId == null ? AppRoutes.reminderNew : AppRoutes.reminderEdit(reminderId!),
        builder: (context, user) => UnderConstructionView(
          requestedPath: reminderId == null ? AppRoutes.reminderNew : AppRoutes.reminderEdit(reminderId!),
        ),
      ),
    );
  }
}
