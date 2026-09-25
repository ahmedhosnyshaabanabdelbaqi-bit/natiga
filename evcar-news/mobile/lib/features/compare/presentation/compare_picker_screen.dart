import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Pick a car for comparison (`/compare/pick`): brand → model → model year → trim → market (all mandatory), then adds it to the compare tray.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `compare` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class ComparePickerScreen extends StatelessWidget {
  const ComparePickerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(title: context.l10n.comparePickerTitle, requestedPath: AppRoutes.comparePicker);
  }
}
