import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../shared/widgets/kit.dart';
import '../../../services_directory/presentation/widgets/service_widgets.dart' show DirectorySponsoredLabel;
import '../../domain/search_models.dart';

IconData searchTypeIcon(String? type) => switch (type) {
  'article' || SearchGroupTypes.articles => Icons.newspaper_outlined,
  'brand' || SearchGroupTypes.brands => Icons.local_offer_outlined,
  'model' || SearchGroupTypes.models => Icons.directions_car_outlined,
  'variant' || SearchGroupTypes.variants => Icons.tune,
  'station' || SearchGroupTypes.stations => Icons.ev_station_outlined,
  'encyclopedia' || SearchGroupTypes.encyclopedia => Icons.menu_book_outlined,
  'service' || SearchGroupTypes.services => Icons.handyman_outlined,
  _ => Icons.search,
};

String searchGroupLabel(AppLocalizations l10n, String type) => switch (type) {
  SearchGroupTypes.articles => l10n.searchGroupArticles,
  SearchGroupTypes.brands => l10n.searchGroupBrands,
  SearchGroupTypes.models => l10n.searchGroupModels,
  SearchGroupTypes.variants => l10n.searchGroupVariants,
  SearchGroupTypes.stations => l10n.searchGroupStations,
  SearchGroupTypes.encyclopedia => l10n.searchGroupEncyclopedia,
  SearchGroupTypes.services => l10n.searchGroupServices,
  _ => type,
};

String searchHitTypeLabel(AppLocalizations l10n, String? type) => switch (type) {
  'article' => l10n.searchTypeArticle,
  'brand' => l10n.searchTypeBrand,
  'model' => l10n.searchTypeModel,
  'variant' => l10n.searchTypeVariant,
  'station' => l10n.searchTypeStation,
  'encyclopedia' => l10n.searchTypeEncyclopedia,
  'service' => l10n.searchTypeService,
  _ => l10n.searchTypeQuery,
};

/// [text] with the [ranges] in bold + primary colour (never HTML).
class HighlightedText extends StatelessWidget {
  const HighlightedText(this.text, {super.key, required this.ranges, this.style, this.maxLines});

  final String text;
  final List<HighlightRange> ranges;
  final TextStyle? style;
  final int? maxLines;

  @override
  Widget build(BuildContext context) {
    final base = style ?? DefaultTextStyle.of(context).style;
    final strong = base.copyWith(fontWeight: FontWeight.w800, color: Theme.of(context).colorScheme.primary);
    return Text.rich(
      TextSpan(
        children: [
          for (final (segment, hl) in highlightRuns(text, ranges)) TextSpan(text: segment, style: hl ? strong : base),
        ],
      ),
      maxLines: maxLines,
      overflow: maxLines == null ? null : TextOverflow.ellipsis,
    );
  }
}

/// Secondary line of a hit built from its type-specific details.
String? searchHitDetailLine(BuildContext context, SearchHit hit) {
  final l10n = context.l10n;
  final fmt = AppFormatters.of(context);
  final d = hit.details;
  String? s(String k) => d[k] is String && (d[k] as String).trim().isNotEmpty ? (d[k] as String).trim() : null;
  final String? typeDetail = switch (hit.type) {
    'model' => s('brandName'),
    // A model year is a label, never a grouped number ("2,026").
    'variant' => d['modelYear'] is num ? fmt.shapeDate('${(d['modelYear'] as num).toInt()}') : null,
    'station' => s('city'),
    'encyclopedia' => s('categoryName'),
    'service' => [?s('serviceTypeLabel'), ?s('city')].join(' · '),
    'article' => friendlyTime(context, DateTime.tryParse(s('publishedAt') ?? '')),
    _ => null,
  };
  final typeLabel = searchHitTypeLabel(l10n, hit.type);
  // The snippet (with its highlights) is shown under this line: a subtitle
  // that repeats it, or parts repeating each other ("مركز خدمة · مركز خدمة"),
  // would only add noise.
  final snippet = hit.snippet?.trim().toLowerCase();
  final seen = <String>{typeLabel.trim().toLowerCase()};
  final parts = [
    for (final p in [?typeDetail, ?hit.subtitle])
      if (p.trim().isNotEmpty && p.trim().toLowerCase() != snippet && seen.add(p.trim().toLowerCase())) p.trim(),
  ];
  if (parts.isEmpty) return typeLabel;
  return '$typeLabel · ${parts.join(' · ')}';
}

class SearchHitTile extends StatelessWidget {
  const SearchHitTile({super.key, required this.hit, this.onOpen});

  final SearchHit hit;

  /// Called before navigating (e.g. to remember the query).
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final route = hit.route;
    final detail = searchHitDetailLine(context, hit);
    final tone = context.palette.tone(AppTone.brand);
    final reviewed = hit.type == 'encyclopedia' && hit.details['reviewedAt'] != null;
    final pills = <Widget>[
      if (hit.isSponsored) DirectorySponsoredLabel(label: hit.sponsorLabel),
      if (hit.isDemo) const DemoBadge(dense: true),
      if (reviewed) Pill(icon: Icons.verified_outlined, tone: AppTone.success, dense: true, label: l10n.searchReviewed),
      if (hit.type == 'service' && hit.details['contactVerified'] == true)
        Pill(icon: Icons.verified_outlined, tone: AppTone.success, dense: true, label: l10n.searchContactVerified),
      if (hit.isFallback)
        Pill(
          icon: Icons.translate,
          dense: true,
          label: hit.language == 'en' ? l10n.searchShownInEnglish : l10n.searchShownInArabic,
        ),
      if (hit.matchedBy == 'alias' || hit.matchedBy == 'fuzzy')
        Pill(icon: Icons.spellcheck, dense: true, label: l10n.searchMatchedSpelling),
    ];
    final semantic = [
      searchHitTypeLabel(l10n, hit.type),
      hit.title,
      ?detail,
      if (hit.isSponsored) l10n.commonSponsoredLabel,
      if (hit.isDemo) l10n.commonDemoLabel,
    ].join('. ');

    return Semantics(
      button: route != null,
      label: semantic,
      excludeSemantics: true,
      child: InkWell(
        borderRadius: AppRadii.card,
        onTap: route == null
            ? null
            : () {
                onOpen?.call();
                context.push(route);
              },
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm, horizontal: AppSpacing.xs),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (hit.imageUrl != null)
                SizedBox(
                  width: 56,
                  child: ImageWithFallback(
                    url: hit.imageUrl,
                    aspectRatio: 1,
                    width: 56,
                    borderRadius: AppRadii.control,
                    fallbackIcon: searchTypeIcon(hit.type),
                    showFallbackText: false,
                  ),
                )
              else
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(color: tone.container, borderRadius: AppRadii.control),
                  child: Icon(searchTypeIcon(hit.type), color: tone.onContainer),
                ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    HighlightedText(
                      hit.title,
                      ranges: hit.titleHighlights,
                      style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                      maxLines: 2,
                    ),
                    if (detail != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        detail,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                      ),
                    ],
                    if (hit.snippet != null && hit.snippet!.trim().isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.xs),
                      HighlightedText(
                        hit.snippet!,
                        ranges: hit.snippetHighlights,
                        style: theme.textTheme.bodySmall,
                        maxLines: 2,
                      ),
                    ],
                    if (pills.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.xs),
                      Wrap(spacing: AppSpacing.xs, runSpacing: AppSpacing.xs, children: pills),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
