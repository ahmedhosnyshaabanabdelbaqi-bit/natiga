import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/di/providers.dart';
import '../../../../shared/widgets/kit.dart';
import '../../domain/article.dart';
import '../../domain/news_query.dart';
import 'news_labels.dart';

/// Opens the news filter sheet; returns the new query or null (dismissed).
Future<NewsQuery?> showNewsFilterSheet(BuildContext context, NewsQuery initial) {
  final l10n = context.l10n;
  final draft = ValueNotifier(initial);
  return showAppBottomSheet<NewsQuery>(
    context: context,
    title: l10n.newsFiltersTitle,
    builder: (context) => _NewsFilterForm(draft: draft),
    footer: (context) => Row(
      children: [
        Expanded(
          child: SecondaryButton(
            label: l10n.commonReset,
            onPressed: () => draft.value = NewsQuery(category: initial.category, tag: initial.tag),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: PrimaryButton(label: l10n.commonApply, onPressed: () => Navigator.of(context).pop(draft.value)),
        ),
      ],
    ),
  ).whenComplete(draft.dispose);
}

class _NewsFilterForm extends ConsumerWidget {
  const _NewsFilterForm({required this.draft});

  final ValueNotifier<NewsQuery> draft;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final market = ref.watch(effectiveMarketProvider);
    final marketName = context.languageCode == 'ar' ? market.nameAr : market.nameEn;
    return ValueListenableBuilder<NewsQuery>(
      valueListenable: draft,
      builder: (context, q, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(header: true, child: Text(l10n.commonSortBy, style: theme.textTheme.titleSmall)),
          const SizedBox(height: AppSpacing.sm),
          ChoicePills<NewsSort>(
            options: {for (final s in NewsSort.values) s: newsSortLabel(l10n, s)},
            selected: q.sort,
            onSelected: (s) => draft.value = q.copyWith(sort: s),
          ),
          const SizedBox(height: AppSpacing.xl),
          Semantics(header: true, child: Text(l10n.newsTypeLabel, style: theme.textTheme.titleSmall)),
          const SizedBox(height: AppSpacing.sm),
          ChoicePills<String>(
            options: {'': l10n.newsTypeAny, for (final t in ArticleTypes.all) t: newsTypeLabel(l10n, t)!},
            selected: q.type ?? '',
            onSelected: (t) => draft.value = q.copyWith(type: () => t.isEmpty ? null : t),
          ),
          const SizedBox(height: AppSpacing.lg),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: q.allMarkets,
            onChanged: (v) => draft.value = q.copyWith(allMarkets: v),
            title: Text(l10n.newsAllMarkets),
            subtitle: Text(l10n.newsAllMarketsHint(marketName)),
            secondary: const Icon(Icons.public),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: q.onlyMyLanguage,
            onChanged: (v) => draft.value = q.copyWith(onlyMyLanguage: v),
            title: Text(l10n.newsOnlyMyLanguage),
            subtitle: Text(l10n.newsOnlyMyLanguageHint),
            secondary: const Icon(Icons.translate),
          ),
        ],
      ),
    );
  }
}
