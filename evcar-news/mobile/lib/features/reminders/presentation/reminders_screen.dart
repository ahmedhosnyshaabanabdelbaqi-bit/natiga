import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';
import '../../auth/presentation/auth_gate.dart';

/// Reminders (`/reminders`): maintenance, insurance, licence. Requires an account.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `reminders` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class RemindersScreen extends StatelessWidget {
  const RemindersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.remindersTitle)),
      body: AuthGate(
        returnTo: AppRoutes.reminders,
        builder: (context, user) => const UnderConstructionView(requestedPath: AppRoutes.reminders),
      ),
    );
  }
}
