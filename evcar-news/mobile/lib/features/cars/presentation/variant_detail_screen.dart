import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/di/providers.dart';
import '../../../app/router/app_routes.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../core/app_config/features.dart';
import '../../../shared/widgets/kit.dart';
import '../application/cars_providers.dart';
import '../data/cars_repository.dart';
import '../domain/catalog_models.dart';
import 'widgets/car_labels.dart';
import 'widgets/car_page_parts.dart';
import 'widgets/charging_section.dart';
import 'widgets/content_sections.dart';
import 'widgets/price_section.dart';
import 'widgets/spec_sections.dart';
import 'widgets/tours_section.dart';

/// Full spec sheet of one trim (`/variants/:slug`): specs grouped with
/// source/reliability, price in the chosen market with type, date and
/// history, ranges with their cycle, charging (inlets, times with SoC
/// window, curve). Can be saved for offline reading; a saved or cached copy
/// always says when it was stored.
class VariantDetailScreen extends ConsumerStatefulWidget {
  const VariantDetailScreen({super.key, required this.slug});

  /// Variant (trim) slug.
  final String slug;

  @override
  ConsumerState<VariantDetailScreen> createState() => _VariantDetailScreenState();
}

class _VariantDetailScreenState extends ConsumerState<VariantDetailScreen> {
  String? _market;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final marketCode = _market ?? ref.watch(effectiveMarketProvider).code;
    final key = MarketKey(widget.slug, marketCode);
    final value = ref.watch(variantSheetProvider(key));
    final sheet = value.value?.sheet;
    final toursEnabled = ref.watch(featureFlagProvider(Features.interiorTours));
    final markets = ref.watch(appConfigProvider).enabledMarkets;

    return AppScaffold.slivers(
      title: sheet == null ? l10n.carsVariantTitle : '${sheet.modelName} · ${sheet.name}',
      onRefresh: () async {
        ref.invalidate(variantSheetProvider(key));
        try {
          await ref.read(variantSheetProvider(key).future);
        } on Object {
          // Rendered below.
        }
      },
      bottomBar: const CompareTrayBar(),
      slivers: [
        SliverAsyncStateView<VariantView>(
          value: value,
          onRetry: () => ref.invalidate(variantSheetProvider(key)),
          loading: const Skeleton(child: SkeletonList(item: SkeletonBox(height: 140), count: 4)),
          builder: (context, v) {
            final s = v.sheet;
            final lang = context.languageCode;
            return SliverPadding(
              padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.sm, context.pageGutter, 0),
              sliver: SliverToBoxAdapter(
                child: ResponsiveCenter(
                  maxWidth: kMaxContentWidth,
                  padding: EdgeInsets.zero,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SheetOriginNotice(view: v, onRetry: () => ref.invalidate(variantSheetProvider(key))),
                      _Header(view: v),
                      if (markets.length > 1) ...[
                        const SizedBox(height: AppSpacing.md),
                        ChoicePills<String>(
                          options: {
                            for (final m in markets)
                              m.code: s.availableMarkets.any((a) => a.code == m.code)
                                  ? (lang == 'ar' ? m.nameAr : m.nameEn)
                                  : '${lang == 'ar' ? m.nameAr : m.nameEn} (${l10n.carsNotSoldShort})',
                          },
                          selected: marketCode,
                          onSelected: (c) => setState(() => _market = c),
                        ),
                      ],
                      const SizedBox(height: AppSpacing.lg),
                      KeyFactsGrid(sheet: s),
                      const SizedBox(height: AppSpacing.lg),
                      PriceSection(sheet: s),
                      const SizedBox(height: AppSpacing.lg),
                      CarActionsBar(view: v, imageUrl: s.images.firstOrNull?.url),
                      _section(context, l10n.carsTabTours, Icons.threesixty),
                      ToursSection(
                        carSlug: s.modelSlug,
                        tours: s.tours.tours,
                        images: s.images,
                        toursEnabled: toursEnabled,
                      ),
                      _section(context, l10n.carsRangeAndConsumption, Icons.route_outlined),
                      RangesCard(sheet: s),
                      _section(context, l10n.carsChargingTitle, Icons.ev_station_outlined),
                      ChargingSection(sheet: s),
                      _section(context, l10n.carsTabSpecs, Icons.list_alt),
                      SpecGroupsView(groups: s.specGroups),
                      if (s.relatedArticles.isNotEmpty) ...[
                        _section(context, l10n.carsTabNews, Icons.article_outlined),
                        RelatedArticlesList(articles: s.relatedArticles),
                      ],
                      if (s.sources.isNotEmpty) ...[
                        _section(context, l10n.carsSourcesTitle, Icons.fact_check_outlined),
                        AppCard(
                          padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                          child: Column(
                            children: [
                              for (final src in s.sources)
                                ListTile(
                                  leading: const Icon(Icons.description_outlined),
                                  title: Text(src.displayName),
                                  subtitle: src.documentDate == null
                                      ? null
                                      : Text(AppFormatters.of(context).date(src.documentDate)!),
                                  onTap: () => showSourceSheet(context, src, const Provenance()),
                                ),
                            ],
                          ),
                        ),
                      ],
                      const SizedBox(height: AppSpacing.xl),
                      SecondaryButton(
                        label: l10n.carsOpenModelPage(s.modelName),
                        icon: Icons.directions_car_outlined,
                        expand: true,
                        onPressed: () => context.push(AppRoutes.car(s.modelSlug)),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _section(BuildContext context, String title, IconData icon) => SectionHeader(
    title: title,
    icon: icon,
    padding: const EdgeInsetsDirectional.only(top: AppSpacing.xl, bottom: AppSpacing.sm),
  );
}

class _Header extends StatelessWidget {
  const _Header({required this.view});

  final VariantView view;

  @override
  Widget build(BuildContext context) {
    final s = view.sheet;
    final theme = Theme.of(context);
    final l10n = context.l10n;
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            s.brand.name,
            style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary, fontWeight: FontWeight.w700),
          ),
          Semantics(
            header: true,
            child: Text(
              '${s.modelName} · ${s.name}',
              style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
            ),
          ),
          if (s.generationName != null || s.trimCode != null)
            Text(
              [?s.generationName, if (s.trimCode != null) l10n.carsTrimCode(s.trimCode!)].join(' · '),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          const SizedBox(height: AppSpacing.md),
          SelectionSummary(sheet: s),
          if (s.bodyType != null || s.doors != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              [
                if (s.bodyType != null) CarLabels.bodyType(l10n, s.bodyType!),
                if (s.doors != null) l10n.carsDoors(s.doors!),
              ].join(' · '),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ],
      ),
    );
  }
}
