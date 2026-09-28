import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../shared/widgets/kit.dart';
import '../../charging/data/location_service.dart';
import '../../charging/domain/city_presets.dart';
import '../../search/application/paged_state.dart';
import '../../search/presentation/widgets/paged_footer.dart';
import '../application/services_providers.dart';
import '../data/services_repository.dart';
import '../domain/service_models.dart';
import 'widgets/service_widgets.dart';

/// Services directory (`/services`): service centres, dealers, charger
/// installers, emergency services, battery services. Editorial order is
/// "verified contacts first" (or nearest first); sponsored entries keep
/// their place, always carry a label, and are also offered in a separate,
/// clearly labelled slot — sponsorship never reorders results.
class ServicesDirectoryScreen extends ConsumerStatefulWidget {
  const ServicesDirectoryScreen({super.key});

  @override
  ConsumerState<ServicesDirectoryScreen> createState() => _ServicesDirectoryScreenState();
}

class _ServicesDirectoryScreenState extends ConsumerState<ServicesDirectoryScreen> {
  late final TextEditingController _search;
  Timer? _debounce;
  bool _locating = false;

  @override
  void initState() {
    super.initState();
    _search = TextEditingController(text: ref.read(serviceFiltersProvider).q ?? '');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onQuery(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) ref.read(serviceFiltersProvider.notifier).setQuery(v);
    });
  }

  Future<void> _toggleNearMe(bool on) async {
    final notifier = ref.read(serviceFiltersProvider.notifier);
    if (!on) {
      notifier.clearNearMe();
      return;
    }
    setState(() => _locating = true);
    final outcome = await notifier.nearMe();
    if (!mounted) return;
    setState(() => _locating = false);
    await _explainOutcome(outcome);
  }

  Future<void> _explainOutcome(NearMeOutcome outcome) async {
    final l10n = context.l10n;
    switch (outcome) {
      case NearMeOutcome.located:
        return;
      case NearMeOutcome.denied:
      case NearMeOutcome.unavailable:
        showAppSnackBar(
          context,
          outcome == NearMeOutcome.denied
              ? l10n.servicesDirectoryLocationDenied
              : l10n.servicesDirectoryLocationUnavailable,
          icon: Icons.location_off_outlined,
          actionLabel: l10n.servicesDirectoryChooseCity,
          onAction: _pickCity,
        );
      case NearMeOutcome.deniedForever:
      case NearMeOutcome.serviceDisabled:
        final service = ref.read(locationServiceProvider);
        final forever = outcome == NearMeOutcome.deniedForever;
        await showAppBottomSheet<void>(
          context: context,
          title: l10n.commonPermissionLocationTitle,
          builder: (sheet) => Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.lg),
            child: PermissionDeniedState(
              permission: AppPermission.location,
              compact: true,
              message: forever ? l10n.servicesDirectoryLocationDeniedForever : l10n.servicesDirectoryLocationServiceOff,
              onOpenSettings: () {
                Navigator.of(sheet).pop();
                forever ? service.openAppSettings() : service.openLocationSettings();
              },
              alternatives: [
                StateAction(
                  label: l10n.servicesDirectoryChooseCity,
                  icon: Icons.location_city_outlined,
                  primary: true,
                  onPressed: () {
                    Navigator.of(sheet).pop();
                    _pickCity();
                  },
                ),
              ],
            ),
          ),
        );
    }
  }

  Future<void> _pickCity() async {
    final picked = await showCityPickerSheet(context, ref);
    if (picked == null || !mounted) return;
    final notifier = ref.read(serviceFiltersProvider.notifier);
    notifier.clearNearMe();
    notifier.setCity(picked.isEmpty ? null : picked);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final filters = ref.watch(serviceFiltersProvider);
    final provider = servicesListProvider(filters);
    final value = ref.watch(provider);
    final state = value.value;
    final page = state?.extra is ServicesPage ? state!.extra! as ServicesPage : null;
    final types = ref.watch(serviceTypesProvider).value?.data ?? const <ServiceTypeCount>[];
    final notifier = ref.read(serviceFiltersProvider.notifier);
    final filtered = filters.activeCount > 0 || (filters.q?.isNotEmpty ?? false);

    Future<void> refresh() async {
      ref.invalidate(serviceTypesProvider);
      ref.invalidate(provider);
      try {
        await ref.read(provider.future);
      } on Object {
        // Rendered below.
      }
    }

    return AppScaffold.slivers(
      title: l10n.servicesDirectoryTitle,
      largeTitle: true,
      onRefresh: refresh,
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.fromLTRB(context.pageGutter, 0, context.pageGutter, AppSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  l10n.servicesDirectoryIntro,
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: AppSpacing.md),
                AppSearchField(
                  controller: _search,
                  hintText: l10n.servicesDirectorySearchHint,
                  onChanged: _onQuery,
                  onSubmitted: (v) {
                    _debounce?.cancel();
                    notifier.setQuery(v);
                  },
                ),
              ],
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: EdgeInsets.fromLTRB(context.pageGutter, 0, context.pageGutter, AppSpacing.sm),
            child: Row(
              children: [
                AppFilterChip(
                  label: l10n.servicesDirectoryAllTypes,
                  selected: filters.type == null,
                  onSelected: (_) => notifier.setType(null),
                ),
                for (final t
                    in types.isEmpty
                        ? [
                            for (final k in ServiceTypes.all)
                              ServiceTypeCount(type: k, label: serviceTypeLabel(l10n, k)),
                          ]
                        : types) ...[
                  const SizedBox(width: AppSpacing.sm),
                  AppFilterChip(
                    icon: serviceTypeIcon(t.type),
                    label: t.count == null ? t.label : '${t.label} (${AppFormatters.of(context).number(t.count)})',
                    selected: filters.type == t.type,
                    onSelected: (on) => notifier.setType(on ? t.type : null),
                  ),
                ],
              ],
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: EdgeInsets.fromLTRB(context.pageGutter, 0, context.pageGutter, AppSpacing.md),
            child: Row(
              children: [
                AppFilterChip(
                  icon: _locating ? Icons.more_horiz : Icons.near_me_outlined,
                  label: l10n.servicesDirectoryNearMe,
                  selected: filters.nearMe,
                  onSelected: _locating ? null : _toggleNearMe,
                ),
                const SizedBox(width: AppSpacing.sm),
                AppFilterChip(
                  icon: Icons.location_city_outlined,
                  label: filters.city ?? l10n.servicesDirectoryCity,
                  selected: filters.city != null,
                  onSelected: (on) => on ? _pickCity() : notifier.setCity(null),
                ),
                const SizedBox(width: AppSpacing.sm),
                AppFilterChip(
                  icon: Icons.schedule,
                  label: l10n.servicesDirectoryOpenNow,
                  selected: filters.openNow,
                  onSelected: notifier.setOpenNow,
                ),
                if (filters.activeCount > 0) ...[
                  const SizedBox(width: AppSpacing.sm),
                  TextButton.icon(
                    onPressed: notifier.clear,
                    icon: const Icon(Icons.filter_alt_off_outlined),
                    label: Text(l10n.commonReset),
                  ),
                ],
              ],
            ),
          ),
        ),
        if (state?.fromCache ?? false)
          SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(context.pageGutter, 0, context.pageGutter, AppSpacing.md),
              child: CachedDataNotice(savedAt: state!.savedAt!, onRetry: () => ref.invalidate(provider)),
            ),
          ),
        if (page != null && page.sponsored.isNotEmpty)
          SliverToBoxAdapter(
            child: ResponsiveCenter(child: _SponsoredSlot(items: page.sponsored)),
          ),
        if (state != null && state.items.isNotEmpty)
          SliverToBoxAdapter(
            child: ResponsiveCenter(
              child: Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SectionHeader(
                      title: l10n.servicesDirectoryResults,
                      icon: Icons.list_alt_outlined,
                      padding: EdgeInsets.zero,
                    ),
                    Text(
                      filters.nearMe ? l10n.servicesDirectoryOrderDistance : l10n.servicesDirectoryOrderVerified,
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                    if (page?.truncated ?? false)
                      Text(
                        l10n.servicesDirectoryTruncated,
                        style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                      ),
                  ],
                ),
              ),
            ),
          ),
        SliverAsyncStateView<PagedState<ServiceProvider>>(
          value: value,
          onRetry: () => ref.invalidate(provider),
          isEmpty: (s) => s.items.isEmpty,
          emptyIcon: filtered ? Icons.search_off : Icons.handyman_outlined,
          emptyTitle: filtered ? l10n.servicesDirectoryNoMatchesTitle : l10n.servicesDirectoryEmptyTitle,
          emptyMessage: filtered ? l10n.servicesDirectoryNoMatchesMessage : l10n.servicesDirectoryEmptyMessage,
          emptyActions: [
            if (filtered)
              StateAction(
                label: l10n.commonReset,
                icon: Icons.filter_alt_off_outlined,
                primary: true,
                onPressed: () {
                  _search.clear();
                  notifier.set(const ServiceFilters());
                },
              ),
          ],
          loading: const ServicesListSkeleton(),
          builder: (context, s) => SliverResponsivePadding(
            maxWidth: kMaxReadableWidth,
            sliver: SliverList.builder(
              itemCount: s.items.length + 1,
              itemBuilder: (context, i) {
                final list = ref.read(provider.notifier);
                if (i == s.items.length) return PagedListFooter(state: s, onRetry: list.loadMore);
                prefetchNearEnd(context, i, s.items.length, list.loadMore);
                return Padding(
                  padding: EdgeInsets.fromLTRB(context.pageGutter, 0, context.pageGutter, AppSpacing.cardGap),
                  child: ServiceProviderCard(provider: s.items[i]),
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

/// Localized fallback label of a provider type (before `/services/types`
/// has loaded).
String serviceTypeLabel(AppLocalizations l10n, String type) => switch (type) {
  ServiceTypes.serviceCenter => l10n.servicesDirectoryTypeServiceCenter,
  ServiceTypes.dealer => l10n.servicesDirectoryTypeDealer,
  ServiceTypes.chargerInstaller => l10n.servicesDirectoryTypeChargerInstaller,
  ServiceTypes.emergency => l10n.servicesDirectoryTypeEmergency,
  ServiceTypes.batteryService => l10n.servicesDirectoryTypeBattery,
  _ => l10n.servicesDirectoryTypeOther,
};

/// The paid slot, visually separate from editorial results.
class _SponsoredSlot extends StatelessWidget {
  const _SponsoredSlot({required this.items});

  final List<ServiceProvider> items;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final tone = context.palette.tone(AppTone.sponsored);
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.lg),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: tone.container.withValues(alpha: 0.5),
        borderRadius: AppRadii.card,
        border: Border.all(color: tone.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const SponsoredLabel(),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  l10n.servicesDirectorySponsoredSlotTitle,
                  style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(l10n.servicesDirectorySponsoredSlotNote, style: theme.textTheme.bodySmall),
          const SizedBox(height: AppSpacing.md),
          for (final p in items)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: ServiceProviderCard(provider: p, showActions: false),
            ),
        ],
      ),
    );
  }
}

/// City chooser: the market's main cities (reference geography) or free
/// text. Returns the city name, '' to clear, or null when dismissed.
Future<String?> showCityPickerSheet(BuildContext context, WidgetRef ref) {
  final l10n = context.l10n;
  final lang = ref.read(effectiveLanguageProvider);
  final market = ref.read(effectiveMarketProvider).code;
  final cities = [
    for (final c in citiesFor(market))
      if (c.marketCode == market) c.name(lang),
  ];
  final controller = TextEditingController(text: ref.read(serviceFiltersProvider).city ?? '');
  return showAppBottomSheet<String>(
    context: context,
    title: l10n.servicesDirectoryChooseCity,
    builder: (sheet) => Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: controller,
            textInputAction: TextInputAction.done,
            decoration: InputDecoration(
              labelText: l10n.servicesDirectoryCityField,
              prefixIcon: const Icon(Icons.location_city_outlined),
            ),
            onSubmitted: (v) => Navigator.of(sheet).pop(v.trim()),
          ),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [for (final c in cities) ActionChip(label: Text(c), onPressed: () => Navigator.of(sheet).pop(c))],
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(
                child: SecondaryButton(
                  label: l10n.servicesDirectoryAnyCity,
                  onPressed: () => Navigator.of(sheet).pop(''),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: PrimaryButton(
                  label: l10n.commonApply,
                  onPressed: () => Navigator.of(sheet).pop(controller.text.trim()),
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}
