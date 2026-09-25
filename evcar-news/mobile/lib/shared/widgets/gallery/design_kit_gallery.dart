import 'package:flutter/material.dart';

import '../kit.dart';

/// Living reference of the design kit (`/dev/kit`), registered only in debug
/// builds and the web design preview — never in release apps.
///
/// Every value on this page is a **design sample** ("Sample EV", "Brand"),
/// not information about a real car, and the page says so at the top.
class DesignKitGalleryScreen extends StatefulWidget {
  const DesignKitGalleryScreen({super.key});

  @override
  State<DesignKitGalleryScreen> createState() => _DesignKitGalleryScreenState();
}

class _DesignKitGalleryScreenState extends State<DesignKitGalleryScreen> {
  bool _chip = true;
  String _view = 'map';

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final now = DateTime.now();
    const stats = [
      CarCardStat(icon: Icons.route_outlined, label: 'Range', value: '480 km', qualifier: 'WLTP'),
      CarCardStat(icon: Icons.battery_charging_full_outlined, label: 'Battery', value: null),
      CarCardStat(icon: Icons.bolt, label: 'DC peak', value: '135 kW'),
    ];
    Widget pad(Widget child) => Padding(
      padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
      child: child,
    );

    return AppScaffold.slivers(
      title: 'Design kit',
      largeTitle: true,
      onRefresh: () => Future<void>.delayed(const Duration(milliseconds: 600)),
      bottomBar: const CompareTrayBar(),
      slivers: [
        SliverToBoxAdapter(
          child: pad(
            const Row(
              children: [
                DemoBadge(),
                SizedBox(width: 8),
                Expanded(child: Text('Design samples only — not real vehicle data.')),
              ],
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: SectionHeader(title: 'Top story', icon: Icons.bolt, onSeeAll: () {}),
        ),
        SliverToBoxAdapter(
          child: pad(
            NewsCard(
              variant: NewsCardVariant.hero,
              title: 'Sample headline: how charging curves shape real-world trip times',
              category: 'Charging',
              imageUrl: null,
              imageCredit: 'Sample credit',
              publishedAt: now.subtract(const Duration(hours: 2)),
              isDemo: true,
              onTap: () {},
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: SectionHeader(title: 'Latest news', onSeeAll: () {}),
        ),
        SliverToBoxAdapter(
          child: pad(
            Column(
              children: [
                for (var i = 0; i < 2; i++) ...[
                  NewsCard(
                    variant: NewsCardVariant.compact,
                    title: 'Sample article ${i + 1}: battery warranty explained for new owners',
                    category: 'Guides',
                    publishedAt: now.subtract(Duration(hours: 5 + i * 20)),
                    isSponsored: i == 1,
                    sponsorName: i == 1 ? 'Sample sponsor' : null,
                    onTap: () {},
                    trailingAction: FavoriteButton(
                      item: FavoriteItem(key: FavoriteKey(FavoriteType.article, 'sample-$i'), title: 'Sample $i'),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.cardGap),
                ],
              ],
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: SectionHeader(title: 'New cars', icon: Icons.directions_car_outlined, onSeeAll: () {}),
        ),
        SliverToBoxAdapter(
          child: HorizontalCardList(
            children: [
              for (var i = 0; i < 3; i++)
                CarCard(
                  brandName: 'Brand',
                  title: 'Sample EV ${i + 1}',
                  subtitle: 'Long Range · 2026 · EG',
                  powertrain: i == 2 ? Powertrain.phev : Powertrain.bev,
                  hasTour: i == 0,
                  isDemo: true,
                  stats: stats,
                  price: i == 1 ? null : '1,950,000 ج.م',
                  priceType: PriceType.officialMsrp,
                  priceConverted: i == 2,
                  onTap: () {},
                  trailingAction: FavoriteButton(
                    item: FavoriteItem(key: FavoriteKey(FavoriteType.model, 'sample-car-$i'), title: 'Sample EV'),
                  ),
                  footer: CompareToggleButton(
                    selection: CompareSelection(
                      variantId: 'sample-variant-$i',
                      modelYear: 2026,
                      marketCode: 'EG',
                      title: 'Sample EV ${i + 1}',
                    ),
                  ),
                ),
            ],
          ),
        ),
        SliverToBoxAdapter(child: SectionHeader(title: 'Key figures')),
        SliverToBoxAdapter(
          child: pad(
            const StatTileRow(
              tiles: [
                StatTile(label: 'Range', value: '480 km', icon: Icons.route_outlined, qualifier: 'WLTP'),
                StatTile(label: 'Usable battery', value: null, icon: Icons.battery_full),
                StatTile(label: '10–80%', value: '29 min', icon: Icons.timer_outlined, qualifier: '135 kW DC'),
              ],
            ),
          ),
        ),
        SliverToBoxAdapter(child: SectionHeader(title: 'Specifications')),
        SliverToBoxAdapter(
          child: pad(
            SpecGroup(
              title: 'Battery & charging',
              icon: Icons.battery_charging_full,
              collapsible: true,
              rows: [
                SpecRow(
                  label: 'Usable capacity',
                  value: '72 kWh',
                  reliability: Reliability.manufacturerClaim,
                  source: SpecSource(name: 'Sample source', verifiedAt: now),
                ),
                SpecRow(label: 'Range', value: '480 km', qualifier: RangeCycle.wltp.label(l10n)),
                const SpecRow(label: 'AC on-board charger', value: null),
                const SpecRow(
                  label: 'DC 10–80%',
                  value: '29 min',
                  note: 'On a 150 kW charger',
                  reliability: Reliability.estimated,
                ),
              ],
              footer: LastUpdatedText(
                time: now.subtract(const Duration(days: 40)),
                staleAfter: const Duration(days: 30),
              ),
            ),
          ),
        ),
        SliverToBoxAdapter(child: SectionHeader(title: 'Price')),
        SliverToBoxAdapter(
          child: pad(
            AppCard(
              child: PriceTag(
                price: '52,000 SAR',
                type: PriceType.dealer,
                isConverted: true,
                effectiveDate: now,
                sourceName: 'Sample dealer list',
              ),
            ),
          ),
        ),
        SliverToBoxAdapter(child: SectionHeader(title: 'Filters & controls')),
        SliverToBoxAdapter(
          child: FilterBar(
            activeCount: _chip ? 1 : 0,
            onOpenFilters: () => showAppBottomSheet<void>(
              context: context,
              title: l10n.commonFilters,
              builder: (_) => const Text('Filter form goes here.'),
              footer: (context) =>
                  PrimaryButton(label: l10n.commonApply, expand: true, onPressed: () => Navigator.of(context).pop()),
            ),
            chips: [
              AppFilterChip(label: 'CCS2', selected: _chip, onSelected: (v) => setState(() => _chip = v)),
              AppFilterChip(label: 'Type 2', selected: false, onSelected: (_) {}),
              AppFilterChip(label: 'Open now', selected: false, onSelected: (_) {}),
            ],
          ),
        ),
        SliverToBoxAdapter(
          child: pad(
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ChoicePills<String>(
                    options: const {'map': 'Map', 'list': 'List'},
                    selected: _view,
                    onSelected: (v) => setState(() => _view = v),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  const AppSearchField(hintText: 'Search cars, news, stations'),
                  const SizedBox(height: AppSpacing.md),
                  const Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      Tour360Badge(),
                      SponsoredLabel(kind: SponsoredKind.ad),
                      PowertrainPill(powertrain: Powertrain.erev),
                      Pill(label: 'CCS2 · 150 kW', icon: Icons.power, tone: AppTone.info),
                      Pill(label: 'Operational', icon: Icons.check_circle_outline, tone: AppTone.success),
                      Pill(label: 'Availability unknown', icon: Icons.help_outline, tone: AppTone.neutral),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  PrimaryButton(label: 'Primary action', icon: Icons.bolt, expand: true, onPressed: () {}),
                  const SizedBox(height: AppSpacing.sm),
                  SecondaryButton(
                    label: 'Confirm sheet',
                    expand: true,
                    onPressed: () => showConfirmSheet(
                      context: context,
                      title: 'Delete this entry?',
                      message: 'This cannot be undone.',
                      confirmLabel: 'Delete',
                      destructive: true,
                      icon: Icons.delete_outline,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        SliverToBoxAdapter(child: SectionHeader(title: 'Loading')),
        SliverToBoxAdapter(
          child: pad(
            const Skeleton(
              child: Column(
                children: [
                  NewsCardSkeleton.compact(),
                  SizedBox(height: AppSpacing.cardGap),
                  CarCardSkeleton(),
                ],
              ),
            ),
          ),
        ),
        SliverToBoxAdapter(child: SectionHeader(title: 'States')),
        SliverToBoxAdapter(
          child: pad(
            AppCard(
              padding: EdgeInsets.zero,
              child: EmptyState(
                icon: Icons.ev_station_outlined,
                title: 'No stations in this area',
                message: 'Zoom out or change the filters to see more stations.',
                actions: [
                  StateAction(
                    label: 'Reset filters',
                    icon: Icons.filter_alt_off_outlined,
                    onPressed: () {},
                    primary: true,
                  ),
                ],
              ),
            ),
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.cardGap)),
        SliverToBoxAdapter(
          child: pad(
            AppCard(
              padding: EdgeInsets.zero,
              child: PermissionDeniedState(
                permission: AppPermission.location,
                onOpenSettings: () {},
                alternatives: [StateAction(label: 'Choose a city', icon: Icons.location_city, onPressed: () {})],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
