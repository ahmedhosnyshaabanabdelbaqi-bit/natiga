import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/links/external_links.dart';
import '../../../shared/widgets/kit.dart';
import '../application/charging_providers.dart';
import '../domain/station_models.dart';
import 'widgets/charging_labels.dart';
import 'widgets/directions_sheet.dart';
import 'widgets/station_card.dart';
import 'widgets/station_detail_sections.dart';

/// Station page (`/charging/stations/:id`, id or slug).
///
/// Operational status, open now and live availability are shown as three
/// separate answers; community data is dated and marked as not live; the
/// data source, licence and last update are always visible; demo stations
/// carry a demo badge. An offline copy is labelled with its date and never
/// shows live availability. A merged station (404 STATION_MERGED) redirects
/// to the station it was merged into.
class StationDetailScreen extends ConsumerStatefulWidget {
  const StationDetailScreen({super.key, required this.stationId});

  /// Station id or slug.
  final String stationId;

  @override
  ConsumerState<StationDetailScreen> createState() => _StationDetailScreenState();
}

class _StationDetailScreenState extends ConsumerState<StationDetailScreen> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    // Re-evaluate expiry / open-now every minute while the page is open, so
    // a live reading that expires on screen turns "uncertain" by itself.
    _ticker = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  String? _mergedInto(Object? e) {
    if (e is ApiException && e.code == 'STATION_MERGED') {
      final d = e.details;
      if (d is Map && d['mergedIntoId'] is String) return d['mergedIntoId'] as String;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final value = ref.watch(stationDetailProvider(widget.stationId));
    final merged = _mergedInto(value.error);
    if (merged != null) {
      return AppScaffold(
        title: l10n.chargingStationTitle,
        body: EmptyState(
          icon: Icons.merge_type,
          title: l10n.chargingMergedTitle,
          message: l10n.chargingMergedMessage,
          actions: [
            StateAction(
              label: l10n.chargingOpenMerged,
              icon: Icons.arrow_forward,
              primary: true,
              onPressed: () => context.pushReplacement(AppRoutes.station(merged)),
            ),
          ],
        ),
      );
    }
    final station = value.value?.station;
    return AppScaffold.slivers(
      title: station?.name ?? l10n.chargingStationTitle,
      actions: [
        if (station != null)
          FavoriteButton(
            item: stationFavoriteItem(id: station.id, name: station.name, subtitle: station.operator?.name ?? station.address.city),
          ),
      ],
      onRefresh: () async {
        ref.invalidate(stationDetailProvider(widget.stationId));
        await ref.read(stationDetailProvider(widget.stationId).future).then((_) {}, onError: (Object _) {});
      },
      slivers: [
        SliverAsyncStateView<StationDetailView>(
          value: value,
          onRetry: () => ref.invalidate(stationDetailProvider(widget.stationId)),
          loading: const _DetailSkeleton(),
          builder: (context, view) => SliverResponsivePadding(
            maxWidth: kMaxReadableWidth,
            sliver: SliverPadding(
              padding: EdgeInsetsDirectional.fromSTEB(context.pageGutter, 0, context.pageGutter, AppSpacing.xxxl),
              sliver: SliverList.list(children: _sections(context, view)),
            ),
          ),
        ),
      ],
    );
  }

  List<Widget> _sections(BuildContext context, StationDetailView view) {
    final l10n = context.l10n;
    final s = view.station;
    final now = ref.read(chargingClockProvider)();
    final offline = view.fromCache;
    final vehicle = ref.watch(chargingFiltersProvider.select((f) => f.vehicle));
    void checkIn() => context.push(AppRoutes.stationCheckIn(s.id));
    void report() => context.push(AppRoutes.stationReport(s.id));

    return [
      if (offline)
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.cardGap),
          child: ClipRRect(
            borderRadius: const BorderRadius.all(Radius.circular(AppRadii.md)),
            child: CachedDataNotice(
              savedAt: view.fetchedAt,
              onRetry: () => ref.invalidate(stationDetailProvider(widget.stationId)),
            ),
          ),
        ),
      _HeaderCard(station: s, onCheckIn: checkIn, onReport: report),
      if (s.photos.isNotEmpty) _Photos(photos: s.photos),
      StationStatusSection(station: s, now: now, offlineCopy: offline),
      if (vehicle != null || view.compatibilityError != null)
        _CompatibilitySection(station: s, vehicleName: vehicle?.name, error: view.compatibilityError),
      ConnectorsSection(station: s, now: now, offlineCopy: offline),
      HoursSection(hours: s.hours, now: now),
      _AccessSection(station: s),
      TariffsSection(station: s),
      if (s.paymentMethods.isNotEmpty || s.startMethods.isNotEmpty || s.amenities.isNotEmpty) _ServicesSection(station: s),
      _ContactSection(station: s),
      CommunitySection(community: s.community, onCheckIn: checkIn, onReport: report),
      SourceSection(station: s, fetchedAt: view.fetchedAt),
      if (s.isDemo)
        Padding(
          padding: const EdgeInsets.only(top: AppSpacing.sm),
          child: HelpText(l10n.commonDemoDescription, icon: Icons.science_outlined),
        ),
    ];
  }
}

class _HeaderCard extends ConsumerWidget {
  const _HeaderCard({required this.station, required this.onCheckIn, required this.onReport});

  final StationDetail station;
  final VoidCallback onCheckIn;
  final VoidCallback onReport;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final s = station;
    final distance = distanceText(fmt, l10n, s.distanceM);
    final power = fmt.powerKw(s.maxPowerKw);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.cardGap),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (s.isDemo) ...[
              const Align(alignment: AlignmentDirectional.centerStart, child: DemoBadge()),
              const SizedBox(height: AppSpacing.sm),
            ],
            Semantics(
              header: true,
              child: Text(s.name, style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
            ),
            if (s.operator != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xxs),
                child: Text(s.operator!.name, style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.primary)),
              ),
            const SizedBox(height: AppSpacing.sm),
            HelpText(s.address.display ?? l10n.chargingAddressUnknown, icon: Icons.place_outlined),
            if (s.isDemo)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xxs),
                child: HelpText(l10n.chargingDemoNotRealPlace, icon: Icons.science_outlined),
              ),
            const SizedBox(height: AppSpacing.md),
            StatTileRow(
              tiles: [
                StatTile(label: l10n.chargingMaxPower, value: power, icon: Icons.bolt, dense: true),
                StatTile(label: l10n.chargingDistance, value: distance, icon: Icons.straighten, dense: true),
                StatTile(
                  label: l10n.chargingCurrentTypes,
                  value: s.currentTypes.isEmpty ? null : s.currentTypes.map(currentLabel).join(' + '),
                  icon: Icons.electrical_services_outlined,
                  dense: true,
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            PrimaryButton(
              label: l10n.chargingDirections,
              icon: Icons.directions_outlined,
              expand: true,
              onPressed: () =>
                  showDirectionsSheet(context, ref, lat: s.latitude, lng: s.longitude, label: s.name, isDemo: s.isDemo),
            ),
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: SecondaryButton(
                    label: l10n.chargingCheckInShort,
                    icon: Icons.how_to_reg_outlined,
                    expand: true,
                    onPressed: onCheckIn,
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: SecondaryButton(
                    label: l10n.chargingReportShort,
                    icon: Icons.flag_outlined,
                    expand: true,
                    onPressed: onReport,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Photos extends StatelessWidget {
  const _Photos({required this.photos});

  final List<StationPhoto> photos;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.cardGap),
      child: SizedBox(
        height: 180,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: photos.length,
          separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
          itemBuilder: (context, i) {
            final p = photos[i];
            return SizedBox(
              width: 260,
              child: ImageWithFallback(
                url: p.url,
                credit: p.credit,
                semanticLabel: p.alt ?? context.l10n.chargingPhoto,
                width: 260,
                height: 180,
                borderRadius: const BorderRadius.all(Radius.circular(AppRadii.md)),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _CompatibilitySection extends StatelessWidget {
  const _CompatibilitySection({required this.station, this.vehicleName, this.error});

  final StationDetail station;
  final String? vehicleName;
  final ApiException? error;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final compat = station.compatibility;
    final compatible = station.allConnectors.where((c) => c.compatibility?.compatible ?? false).toList();
    double? best;
    for (final c in compatible) {
      final p = c.compatibility?.maxUsablePowerKw;
      if (p != null && (best == null || p > best)) best = p;
    }
    return DetailSection(
      title: l10n.chargingCompatSection,
      icon: Icons.directions_car_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (error != null) ...[
            Text(error!.message ?? l10n.chargingCompatUnknownTitle),
            const SizedBox(height: AppSpacing.xs),
            HelpText(l10n.chargingCompatNoGuess, icon: Icons.info_outline),
          ] else ...[
            Text(
              compatible.isEmpty
                  ? l10n.chargingCompatNone(compat?.vehicleName ?? vehicleName ?? '')
                  : l10n.chargingCompatSome(compat?.vehicleName ?? vehicleName ?? '', compatible.length),
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            if (best != null) HelpText(l10n.chargingCompatBestPower(fmt.powerKw(best)!)),
            if (compat != null)
              for (final i in compat.inlets)
                HelpText(
                  [i.connectorName, ?i.currentType?.apiValue, ?fmt.powerKw(i.maxPowerKw)].join(' · '),
                  icon: Icons.settings_input_component_outlined,
                ),
            if (compat?.note != null) HelpText(compat!.note!),
            const SizedBox(height: AppSpacing.xs),
            HelpText(l10n.chargingCompatNoAdapters, icon: Icons.info_outline),
          ],
        ],
      ),
    );
  }
}

class _AccessSection extends StatelessWidget {
  const _AccessSection({required this.station});

  final StationDetail station;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = station;
    final parking = [
      for (final p in s.points)
        if (p.parkingRestrictions != null) p.parkingRestrictions!,
    ];
    return DetailSection(
      title: l10n.chargingAccessSection,
      icon: Icons.lock_open_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InfoRow(label: l10n.chargingAccessType, value: s.accessTypeLabel),
          InfoRow(label: l10n.chargingAccessRestrictions, value: s.accessRestrictions ?? l10n.chargingNoneStated),
          if (s.accessEntranceNote != null) InfoRow(label: l10n.chargingEntrance, value: s.accessEntranceNote),
          if (parking.isNotEmpty) InfoRow(label: l10n.chargingParking, value: parking.toSet().join(' · ')),
        ],
      ),
    );
  }
}

class _ServicesSection extends StatelessWidget {
  const _ServicesSection({required this.station});

  final StationDetail station;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    Widget group(String title, List<CodeLabel> items, IconData icon) => Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: theme.textTheme.titleSmall),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: [for (final i in items) InfoChip(label: i.label, icon: icon)],
          ),
        ],
      ),
    );
    return DetailSection(
      title: l10n.chargingServicesSection,
      icon: Icons.room_service_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (station.startMethods.isNotEmpty) group(l10n.chargingStartMethods, station.startMethods, Icons.play_circle_outline),
          if (station.paymentMethods.isNotEmpty) group(l10n.chargingPaymentMethods, station.paymentMethods, Icons.credit_card),
          if (station.amenities.isNotEmpty) group(l10n.chargingAmenities, station.amenities, Icons.local_cafe_outlined),
        ],
      ),
    );
  }
}

class _ContactSection extends StatelessWidget {
  const _ContactSection({required this.station});

  final StationDetail station;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = station;
    final phone = s.contactPhone ?? s.operator?.phone;
    final email = s.contactEmail ?? s.operator?.email;
    final web = s.contactWebsite ?? s.operator?.websiteUrl;
    final webOk = web != null && web.startsWith('https://');
    return DetailSection(
      title: l10n.chargingContactSection,
      icon: Icons.contact_phone_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InfoRow(
            label: l10n.chargingPhone,
            value: phone,
            icon: Icons.phone_outlined,
            onTap: phone == null ? null : () => openExternalUrl(context, 'tel:${phone.replaceAll(RegExp(r'[^0-9+]'), '')}'),
          ),
          InfoRow(
            label: l10n.chargingEmail,
            value: email,
            icon: Icons.mail_outline,
            onTap: email == null ? null : () => openExternalUrl(context, 'mailto:$email'),
          ),
          InfoRow(
            label: l10n.chargingWebsite,
            value: web,
            icon: Icons.language,
            onTap: webOk ? () => openExternalUrl(context, web) : null,
          ),
        ],
      ),
    );
  }
}

class _DetailSkeleton extends StatelessWidget {
  const _DetailSkeleton();

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.all(context.pageGutter),
    child: const Column(
      children: [
      SkeletonCard(
        padding: EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SkeletonLine(widthFactor: 0.7, fontSize: 22),
            SizedBox(height: AppSpacing.sm),
            SkeletonLine(widthFactor: 0.4),
            SizedBox(height: AppSpacing.lg),
            SkeletonBox(height: 64),
            SizedBox(height: AppSpacing.lg),
            SkeletonBox(height: 48),
          ],
        ),
      ),
      SizedBox(height: AppSpacing.cardGap),
      SkeletonCard(
        padding: EdgeInsets.all(AppSpacing.lg),
        child: Column(
          children: [
            SkeletonLine(widthFactor: 0.5),
            SizedBox(height: AppSpacing.md),
            SkeletonBox(height: 40),
            SizedBox(height: AppSpacing.sm),
            SkeletonBox(height: 40),
            SizedBox(height: AppSpacing.sm),
            SkeletonBox(height: 40),
          ],
        ),
      ),
      ],
    ),
  );
}
