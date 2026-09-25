import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Services directory (`/services`): service centres, dealers, charger installers, emergency services, with verification dates; sponsored entries labelled.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `services_directory` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class ServicesDirectoryScreen extends StatelessWidget {
  const ServicesDirectoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(title: context.l10n.servicesDirectoryTitle, requestedPath: AppRoutes.services);
  }
}
