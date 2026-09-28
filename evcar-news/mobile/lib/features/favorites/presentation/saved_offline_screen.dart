import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/di/providers.dart';
import '../../../app/router/app_routes.dart';
import '../../../core/cache/saved_items_store.dart';
import '../../../shared/widgets/kit.dart';
import '../../news/application/news_providers.dart';
import '../../news/presentation/widgets/saved_articles_sliver.dart';

/// Spec sheets saved for offline reading (device only, newest first).
final savedSpecSheetsProvider = FutureProvider.autoDispose<List<SavedItem>>(
  (ref) => ref.watch(savedItemsStoreProvider).list(type: SavedItemType.carSpecs),
);

/// Saved for offline reading (`/saved`): articles and spec sheets the user
/// explicitly saved, each with its save date. Works without a connection.
class SavedOfflineScreen extends ConsumerWidget {
  const SavedOfflineScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final sheets = ref.watch(savedSpecSheetsProvider).value ?? const <SavedItem>[];

    Future<void> refresh() async {
      ref.invalidate(savedArticlesProvider);
      ref.invalidate(savedSpecSheetsProvider);
    }

    return AppScaffold.slivers(
      title: l10n.favoritesSavedOfflineTitle,
      largeTitle: true,
      onRefresh: refresh,
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.fromLTRB(context.pageGutter, 0, context.pageGutter, AppSpacing.sm),
            child: Text(
              l10n.favoritesSavedOfflineIntro,
              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ),
        ),
        if (sheets.isNotEmpty) ...[
          SliverToBoxAdapter(
            child: ResponsiveCenter(
              child: SectionHeader(
                title: l10n.favoritesSavedSpecsTitle,
                icon: Icons.list_alt_outlined,
                padding: const EdgeInsetsDirectional.only(top: AppSpacing.md, bottom: AppSpacing.sm),
              ),
            ),
          ),
          SliverResponsivePadding(
            maxWidth: kMaxReadableWidth,
            sliver: SliverList.builder(
              itemCount: sheets.length,
              itemBuilder: (context, i) => Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: _SavedSheetTile(item: sheets[i]),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: ResponsiveCenter(
              child: SectionHeader(
                title: l10n.favoritesSavedArticlesTitle,
                icon: Icons.newspaper_outlined,
                padding: const EdgeInsetsDirectional.only(top: AppSpacing.lg, bottom: AppSpacing.xs),
              ),
            ),
          ),
        ],
        const SavedArticlesSliver(),
      ],
    );
  }
}

class _SavedSheetTile extends ConsumerWidget {
  const _SavedSheetTile({required this.item});

  final SavedItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final slug = item.data['slug'] is String ? item.data['slug'] as String : item.id;
    final saved = AppFormatters.of(context).dateTime(item.savedAt);
    final tone = context.palette.tone(AppTone.brand);
    return AppCard(
      semanticLabel: '${item.title}. ${item.market}',
      onTap: () => context.push(AppRoutes.variant(slug)),
      padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.md, AppSpacing.md, AppSpacing.xs, AppSpacing.md),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(color: tone.container, borderRadius: AppRadii.control),
            child: Icon(Icons.offline_pin_outlined, color: tone.onContainer),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  [
                    if (item.market.isNotEmpty) item.market,
                    if (saved != null) l10n.favoritesSavedAt(saved),
                  ].join(' · '),
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: l10n.favoritesDeleteOffline,
            icon: const Icon(Icons.delete_outline),
            onPressed: () async {
              await ref
                  .read(savedItemsStoreProvider)
                  .delete(SavedItemType.carSpecs, item.id, lang: item.lang, market: item.market);
              ref.invalidate(savedSpecSheetsProvider);
            },
          ),
        ],
      ),
    );
  }
}
