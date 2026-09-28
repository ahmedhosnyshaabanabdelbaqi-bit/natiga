import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/di/providers.dart';
import '../../../app/router/app_routes.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../core/links/external_links.dart';
import '../../../shared/widgets/kit.dart';
import '../application/cars_providers.dart';
import '../domain/catalog_models.dart';
import 'widgets/car_list_slivers.dart';
import 'widgets/car_summary_card.dart';

/// Brand page (`/brands/:slug`): the brand's models listed in the selected
/// market, plus its models that are not sold there (marked, never mixed in).
class BrandScreen extends ConsumerWidget {
  const BrandScreen({super.key, required this.slug});

  /// Brand slug.
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final value = ref.watch(brandProvider(slug));
    final market = ref.watch(effectiveMarketProvider);
    final marketName = context.languageCode == 'ar' ? market.nameAr : market.nameEn;
    final detail = value.value?.data;
    return AppScaffold.slivers(
      title: detail?.brand.name ?? l10n.carsBrandTitle,
      onRefresh: () async {
        ref.invalidate(brandProvider(slug));
        try {
          await ref.read(brandProvider(slug).future);
        } on Object {
          // Rendered below.
        }
      },
      bottomBar: const CompareTrayBar(),
      slivers: [
        SliverAsyncStateView<CachedResult<BrandDetail>>(
          value: value,
          onRetry: () => ref.invalidate(brandProvider(slug)),
          loading: const CarListSkeleton(),
          builder: (context, res) {
            final d = res.data;
            return SliverMainAxisGroup(
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (res.fromCache) ...[
                          CachedDataNotice(savedAt: res.savedAt, onRetry: () => ref.invalidate(brandProvider(slug))),
                          const SizedBox(height: AppSpacing.md),
                        ],
                        _BrandHeader(brand: d.brand),
                        const SizedBox(height: AppSpacing.lg),
                        SectionHeader(
                          title: l10n.carsBrandModelsIn(marketName),
                          icon: Icons.directions_car_outlined,
                          padding: const EdgeInsetsDirectional.only(bottom: AppSpacing.sm),
                        ),
                      ],
                    ),
                  ),
                ),
                if (d.cars.isEmpty)
                  SliverToBoxAdapter(
                    child: EmptyState(
                      compact: true,
                      icon: Icons.public_off_outlined,
                      title: l10n.carsBrandNoCarsTitle(marketName),
                      message: l10n.carsBrandNoCarsMessage,
                      actions: [
                        StateAction(
                          label: l10n.carsChangeMarket,
                          icon: Icons.public,
                          onPressed: () => context.push(AppRoutes.settings),
                        ),
                      ],
                    ),
                  )
                else
                  SliverCarCards(cars: d.cars),
                if (d.notInMarket.isNotEmpty) ...[
                  SliverToBoxAdapter(
                    child: SectionHeader(
                      title: l10n.carsBrandNotInMarketTitle(marketName),
                      subtitle: l10n.carsBrandNotInMarketHint,
                      icon: Icons.public_off_outlined,
                      padding: EdgeInsetsDirectional.fromSTEB(
                        context.pageGutter,
                        AppSpacing.xl,
                        AppSpacing.xs,
                        AppSpacing.sm,
                      ),
                    ),
                  ),
                  SliverList.list(
                    children: [
                      for (final m in d.notInMarket)
                        ListTile(
                          contentPadding: EdgeInsets.symmetric(horizontal: context.pageGutter),
                          leading: ImageWithFallback(
                            url: m.image?.url,
                            width: 72,
                            height: 48,
                            borderRadius: AppRadii.image,
                            fallbackIcon: Icons.directions_car_outlined,
                            showFallbackText: false,
                          ),
                          title: Text(m.name),
                          subtitle: Text(
                            m.marketCodes.isEmpty
                                ? l10n.carsNotSoldAnywhere
                                : l10n.carsSoldIn(m.marketCodes.join('، ')),
                          ),
                          trailing: Icon(context.isRtl ? Icons.chevron_left : Icons.chevron_right),
                          onTap: () => context.push(AppRoutes.car(m.slug)),
                        ),
                    ],
                  ),
                ],
              ],
            );
          },
        ),
      ],
    );
  }
}

class _BrandHeader extends StatelessWidget {
  const _BrandHeader({required this.brand});

  final BrandSummary brand;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final website = brand.websiteUrl;
    final safeWebsite = website != null && Uri.tryParse(website)?.scheme == 'https' ? website : null;
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              BrandAvatar(name: brand.name, logoUrl: brand.ref.logo?.url, size: 64),
              const SizedBox(width: AppSpacing.lg),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      header: true,
                      child: Text(
                        brand.name,
                        style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Wrap(
                      spacing: AppSpacing.sm,
                      runSpacing: AppSpacing.xs,
                      children: [
                        if (brand.carCount != null)
                          Pill(
                            label: brand.carCount == 0
                                ? l10n.carsBrandNoCarsInMarket
                                : l10n.carsModelCount(brand.carCount!),
                            icon: Icons.directions_car_outlined,
                            tone: AppTone.brand,
                            dense: true,
                          ),
                        if (brand.countryCode != null)
                          Pill(
                            label: l10n.carsBrandCountry(brand.countryCode!),
                            icon: Icons.flag_outlined,
                            dense: true,
                          ),
                        if (brand.isDemo) const DemoBadge(dense: true),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (brand.description != null && brand.description!.trim().isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Text(brand.description!, style: theme.textTheme.bodyMedium),
          ],
          if (safeWebsite != null) ...[
            const SizedBox(height: AppSpacing.md),
            SecondaryButton(
              label: l10n.carsBrandWebsite,
              icon: Icons.open_in_new,
              onPressed: () => openExternalUrl(context, safeWebsite),
            ),
          ],
        ],
      ),
    );
  }
}
