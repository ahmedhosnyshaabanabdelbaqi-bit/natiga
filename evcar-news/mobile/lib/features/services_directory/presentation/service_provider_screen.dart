import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// One service provider (`/services/:id`): verified contact data with verification date; sponsorship clearly labelled.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `services_directory` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class ServiceProviderScreen extends StatelessWidget {
  const ServiceProviderScreen({super.key, required this.providerId});

  /// Provider id.
  final String providerId;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.servicesDirectoryProviderTitle,
      requestedPath: AppRoutes.serviceProvider(providerId),
    );
  }
}
