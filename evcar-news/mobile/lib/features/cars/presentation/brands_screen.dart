import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../shared/widgets/kit.dart';
import '../application/cars_providers.dart';
import '../domain/catalog_models.dart';
import 'widgets/car_summary_card.dart';

/// All brands (`/brands`) with logos and model counts; brands without models
/// in the selected market are marked ("not sold in this market"), not hidden.
class BrandsScreen extends ConsumerStatefulWidget {
  const BrandsScreen({super.key});

  @override
  ConsumerState<BrandsScreen> createState() => _BrandsScreenState();
}

class _BrandsScreenState extends ConsumerState<BrandsScreen> {
  String _filter = '';

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final value = ref.watch(brandsProvider);
    return AppScaffold.slivers(
      title: l10n.carsBrandsTitle,
      largeTitle: true,
      onRefresh: () async {
        ref.invalidate(brandsProvider);
        try {
          await ref.read(brandsProvider.future);
        } on Object {
          // Rendered below.
        }
      },
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.fromLTRB(context.pageGutter, 0, context.pageGutter, AppSpacing.md),
            child: AppSearchField(
              hintText: l10n.carsBrandsSearchHint,
              onChanged: (t) => setState(() => _filter = t.trim().toLowerCase()),
            ),
          ),
        ),
        if (value.value?.fromCache ?? false)
          SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(context.pageGutter, 0, context.pageGutter, AppSpacing.md),
              child: CachedDataNotice(savedAt: value.value!.savedAt, onRetry: () => ref.invalidate(brandsProvider)),
            ),
          ),
        SliverAsyncStateView<CachedResult<List<BrandSummary>>>(
          value: value,
          onRetry: () => ref.invalidate(brandsProvider),
          isEmpty: (r) => r.data.isEmpty,
          emptyIcon: Icons.workspace_premium_outlined,
          emptyTitle: l10n.carsBrandsEmptyTitle,
          emptyMessage: l10n.carsBrandsEmptyMessage,
          loading: const Skeleton(child: SkeletonList(item: ListTileSkeleton(leadingSize: 48), count: 8)),
          builder: (context, r) {
            final all = r.data.where((b) => _filter.isEmpty || b.name.toLowerCase().contains(_filter)).toList();
            final listed = all.where((b) => (b.carCount ?? 0) > 0).toList();
            final others = all.where((b) => (b.carCount ?? 0) == 0).toList();
            if (all.isEmpty) {
              return SliverToBoxAdapter(
                child: EmptyState(
                  icon: Icons.search_off,
                  title: l10n.carsBrandsNoMatchTitle,
                  message: l10n.carsBrandsNoMatchMessage,
                ),
              );
            }
            return SliverList.list(
              children: [
                for (final b in listed) _BrandRow(brand: b),
                if (others.isNotEmpty) ...[
                  SectionHeader(
                    title: l10n.carsBrandsNotInMarket,
                    subtitle: l10n.carsBrandsNotInMarketHint,
                    icon: Icons.public_off_outlined,
                    padding: EdgeInsetsDirectional.fromSTEB(
                      context.pageGutter,
                      AppSpacing.xl,
                      AppSpacing.xs,
                      AppSpacing.sm,
                    ),
                  ),
                  for (final b in others) _BrandRow(brand: b),
                ],
              ],
            );
          },
        ),
      ],
    );
  }
}

class _BrandRow extends StatelessWidget {
  const _BrandRow({required this.brand});

  final BrandSummary brand;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final count = brand.carCount;
    final subtitle = count == null
        ? l10n.commonNotAvailable
        : (count == 0 ? l10n.carsBrandNoCarsInMarket : l10n.carsModelCount(count));
    return ListTile(
      contentPadding: EdgeInsets.symmetric(horizontal: context.pageGutter, vertical: AppSpacing.xs),
      leading: Opacity(
        opacity: count == 0 ? 0.55 : 1,
        child: BrandAvatar(name: brand.name, logoUrl: brand.ref.logo?.url, size: 48),
      ),
      title: Text(brand.name, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Wrap(
        spacing: AppSpacing.sm,
        runSpacing: 2,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [Text(subtitle), if (brand.isDemo) const DemoBadge(dense: true)],
      ),
      trailing: Icon(context.isRtl ? Icons.chevron_left : Icons.chevron_right),
      onTap: () => context.push(AppRoutes.brand(brand.slug)),
    );
  }
}
