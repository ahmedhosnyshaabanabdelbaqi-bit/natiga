import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Every car/trim with a published 360° interior tour (`/tours`); demo panoramas are labelled as demo.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `tours` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class ToursScreen extends StatelessWidget {
  const ToursScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(title: context.l10n.toursListTitle, requestedPath: AppRoutes.tours);
  }
}
