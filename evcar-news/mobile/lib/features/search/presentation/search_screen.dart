import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Unified search (`/search?q=`): news, cars, brands and stations with Arabic/English names and alternative spellings.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `search` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class SearchScreen extends StatelessWidget {
  const SearchScreen({super.key, this.initialQuery});

  /// Optional `q` query parameter.
  final String? initialQuery;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.searchTitle,
      requestedPath: AppRoutes.search(query: initialQuery),
    );
  }
}
