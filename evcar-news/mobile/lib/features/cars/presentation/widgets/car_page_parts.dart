import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/app_config/app_config.dart';
import '../../../../core/app_config/app_config_controller.dart';
import '../../../../core/errors/app_errors.dart';
import '../../../../shared/widgets/kit.dart';
import '../../application/cars_providers.dart';
import '../../data/cars_repository.dart';
import '../../domain/catalog_models.dart';
import '../../domain/variant_sheet.dart';
import 'car_labels.dart';

/// Shares text through the OS sheet; overridable in tests.
final carShareProvider = Provider<Future<void> Function({required String text, required String subject})>(
  (ref) =>
      ({required text, required subject}) => SharePlus.instance.share(ShareParams(text: text, subject: subject)),
);

/// Explicit selection of market → model year → trim. Nothing is mixed
/// silently: the chosen combination is always visible, and a market where
/// the car is not sold says so instead of borrowing another market's data.
class VersionSelector extends StatelessWidget {
  const VersionSelector({
    super.key,
    required this.car,
    required this.markets,
    required this.marketCode,
    required this.selectedVariantId,
    required this.onMarket,
    required this.onVariant,
  });

  final CarDetail car;

  /// Markets enabled in the app.
  final List<MarketConfig> markets;
  final String marketCode;
  final String? selectedVariantId;
  final ValueChanged<String> onMarket;
  final ValueChanged<VariantSummary> onVariant;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final lang = context.languageCode;
    final theme = Theme.of(context);
    final years = car.yearOptions;
    final fmt = AppFormatters.of(context);
    final selected = car.variantById(selectedVariantId);
    final yearOpt = selected == null ? (years.isEmpty ? null : years.first) : car.yearOptionOf(selected.id);
    final yearCounts = <int, int>{};
    for (final y in years) {
      yearCounts[y.year.year] = (yearCounts[y.year.year] ?? 0) + 1;
    }
    String marketLabel(MarketConfig m) {
      final name = lang == 'ar' ? m.nameAr : m.nameEn;
      final listed = car.availableMarkets.any((a) => a.code == m.code);
      return listed ? name : '$name (${l10n.carsNotSoldShort})';
    }

    Widget label(String text, IconData icon) => Padding(
      padding: const EdgeInsets.only(top: AppSpacing.md, bottom: AppSpacing.xs),
      child: Row(
        children: [
          Icon(icon, size: 18, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: AppSpacing.xs),
          Flexible(
            child: Text(text, style: theme.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text(
              l10n.carsChooseVersion,
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
          Text(
            l10n.carsChooseVersionHint,
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          if (markets.length > 1) ...[
            label(l10n.carsMarket, Icons.public),
            ChoicePills<String>(
              options: {for (final m in markets) m.code: marketLabel(m)},
              selected: marketCode,
              onSelected: onMarket,
            ),
          ],
          if (years.isNotEmpty) ...[
            label(l10n.carsModelYear, Icons.event_outlined),
            ChoicePills<String>(
              options: {
                for (final y in years)
                  y.id: (yearCounts[y.year.year] ?? 0) > 1
                      ? '${CarLabels.year(fmt, y.year.year)} · ${y.generation.name}'
                      : CarLabels.year(fmt, y.year.year),
              },
              selected: yearOpt?.id ?? '',
              onSelected: (id) {
                final opt = years.firstWhere((y) => y.id == id);
                if (opt.year.variants.isNotEmpty) onVariant(opt.year.variants.first);
              },
            ),
          ],
          if (yearOpt != null) ...[
            label(l10n.carsTrim, Icons.tune),
            ChoicePills<String>(
              options: {
                for (final v in yearOpt.year.variants) v.id: '${v.displayName} · ${v.powertrainType.toUpperCase()}',
              },
              selected: selected?.id ?? '',
              onSelected: (id) => onVariant(yearOpt.year.variants.firstWhere((v) => v.id == id)),
            ),
          ],
        ],
      ),
    );
  }
}

/// Compare / favorite / share / save-offline actions of a trim.
class CarActionsBar extends ConsumerStatefulWidget {
  const CarActionsBar({super.key, required this.view, this.imageUrl});

  final VariantView view;
  final String? imageUrl;

  @override
  ConsumerState<CarActionsBar> createState() => _CarActionsBarState();
}

class _CarActionsBarState extends ConsumerState<CarActionsBar> {
  bool _saving = false;

  VariantSheet get sheet => widget.view.sheet;

  Future<void> _share() async {
    final url = ref.read(appConfigProvider).share.carUrl(sheet.modelSlug);
    try {
      await ref.read(carShareProvider)(text: '${sheet.title}\n$url', subject: sheet.title);
    } on Object {
      if (mounted) showAppSnackBar(context, context.l10n.carsShareFailed, tone: AppTone.danger);
    }
  }

  Future<void> _toggleSaved(DateTime? savedAt) async {
    final l10n = context.l10n;
    final key = MarketKey(sheet.id, sheet.market.code);
    setState(() => _saving = true);
    try {
      final ctrl = ref.read(savedSheetProvider(key).notifier);
      if (savedAt != null) {
        await ctrl.remove();
        if (mounted) showAppSnackBar(context, l10n.carsSpecsRemovedOffline, icon: Icons.delete_outline);
      } else {
        await ctrl.save(widget.view);
        if (mounted) showAppSnackBar(context, l10n.carsSpecsSavedOffline, tone: AppTone.success);
      }
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorMessage(l10n, e), tone: AppTone.danger);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final market = sheet.market;
    final savedAt = ref.watch(savedSheetProvider(MarketKey(sheet.id, market.code))).value;
    final selection = CompareSelection(
      variantId: sheet.id,
      modelYear: sheet.modelYear,
      marketCode: market.code,
      title: '${sheet.brand.name} ${sheet.modelName}',
      variantSlug: sheet.slug,
      modelSlug: sheet.modelSlug,
      subtitle: '${sheet.name} · ${sheet.modelYear} · ${market.code}',
      imageUrl: widget.imageUrl,
      addedAt: DateTime.now().toUtc(),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (market.offered)
          CompareToggleButton(selection: selection)
        else
          Semantics(
            label: l10n.carsCompareNeedsMarket(market.name),
            child: OutlinedButton.icon(
              onPressed: null,
              icon: const Icon(Icons.compare_arrows),
              label: Text(l10n.carsCompareNeedsMarket(market.name)),
            ),
          ),
        const SizedBox(height: AppSpacing.sm),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
              ),
              child: FavoriteButton(
                item: FavoriteItem(
                  key: FavoriteKey(FavoriteType.variant, sheet.id),
                  title: sheet.title,
                  subtitle: market.name,
                  imageUrl: widget.imageUrl,
                  route: AppRoutes.variant(sheet.slug),
                ),
              ),
            ),
            OutlinedButton.icon(
              onPressed: _share,
              icon: const Icon(Icons.share_outlined),
              label: Text(l10n.commonShare),
            ),
            if (widget.view.origin != SheetOrigin.saved || savedAt != null)
              OutlinedButton.icon(
                onPressed: _saving || widget.view.origin == SheetOrigin.cache ? null : () => _toggleSaved(savedAt),
                icon: Icon(savedAt != null ? Icons.download_done : Icons.download_outlined),
                label: Text(savedAt != null ? l10n.carsSpecsRemoveOffline : l10n.carsSpecsSaveOffline),
              ),
          ],
        ),
        if (savedAt != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xs),
            child: Text(
              l10n.carsSpecsSavedOn(fmt.dateTime(savedAt)!),
              style: Theme.of(context).textTheme.bodySmall
                  ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
          ),
      ],
    );
  }
}

/// Offline copy banner for a spec sheet (automatic cache or saved copy).
class SheetOriginNotice extends StatelessWidget {
  const SheetOriginNotice({super.key, required this.view, this.onRetry});

  final VariantView view;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    if (!view.isOfflineCopy || view.savedAt == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: CachedDataNotice(savedAt: view.savedAt!, onRetry: onRetry),
    );
  }
}

/// Short "availability in market" pill for a variant.
class AvailabilityPill extends StatelessWidget {
  const AvailabilityPill({super.key, required this.code, this.dense = true});

  final String? code;
  final bool dense;

  @override
  Widget build(BuildContext context) => Pill(
    label: CarLabels.availability(context.l10n, code),
    icon: CarLabels.availabilityIcon(code),
    tone: CarLabels.availabilityTone(code),
    dense: dense,
  );
}
