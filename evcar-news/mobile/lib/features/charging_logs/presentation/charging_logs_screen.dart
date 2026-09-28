import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../app/router/app_routes.dart';
import '../../../shared/widgets/kit.dart';
import '../../garage/application/garage_providers.dart';
import '../../garage/common/personal_widgets.dart';
import '../../garage/domain/user_vehicle.dart';
import '../application/charging_logs_providers.dart';
import '../domain/charging_log.dart';
import 'widgets/log_labels.dart';

/// Charging log (`/charging-logs[?vehicle=<id>]`): the sessions the user
/// entered, newest first, filterable by car. Reports are built only from
/// these entries.
class ChargingLogsScreen extends ConsumerStatefulWidget {
  const ChargingLogsScreen({super.key});

  @override
  ConsumerState<ChargingLogsScreen> createState() => _ChargingLogsScreenState();
}

class _ChargingLogsScreenState extends ConsumerState<ChargingLogsScreen> {
  String? _vehicle;
  bool _initialized = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_initialized) {
      _initialized = true;
      _vehicle = GoRouterState.of(context).uri.queryParameters['vehicle'];
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return PersonalPage(
      title: l10n.chargingLogsTitle,
      returnTo: AppRoutes.chargingLogs,
      guestMessage: l10n.chargingLogsGuestMessage,
      builder: (context, user) {
        final vehicles = ref.watch(garageVehiclesProvider);
        final provider = chargingLogsProvider(_vehicle);
        final logs = ref.watch(provider);
        final hasCars = (vehicles.value?.isNotEmpty ?? false);
        return AppScaffold.slivers(
          title: l10n.chargingLogsTitle,
          largeTitle: true,
          onRefresh: () async {
            ref.invalidate(garageVehiclesProvider);
            await ref.refresh(provider.future).then((_) {}, onError: (_) {});
          },
          actions: [
            IconButton(
              tooltip: l10n.chargingLogsReportsTitle,
              icon: const Icon(Icons.insights_outlined),
              onPressed: () => context.push(AppRoutes.chargingLogReports),
            ),
          ],
          floatingActionButton: hasCars
              ? AddFab(
                  label: l10n.chargingLogsAdd,
                  onPressed: () => context.push(
                    _vehicle == null
                        ? AppRoutes.chargingLogNew
                        : Uri(path: AppRoutes.chargingLogNew, queryParameters: {'vehicle': _vehicle}).toString(),
                  ),
                )
              : null,
          slivers: [
            if (vehicles.value case final cars? when cars.length > 1)
              SliverToBoxAdapter(
                child: FilterBar(
                  chips: [
                    AppFilterChip(
                      label: l10n.chargingLogsAllCars,
                      selected: _vehicle == null,
                      onSelected: (_) => setState(() => _vehicle = null),
                    ),
                    for (final v in cars)
                      AppFilterChip(
                        label: v.displayName,
                        selected: _vehicle == v.id,
                        onSelected: (_) => setState(() => _vehicle = v.id),
                      ),
                  ],
                ),
              ),
            if (vehicles.hasValue && !hasCars)
              SliverFillRemaining(
                hasScrollBody: false,
                child: EmptyState(
                  icon: Icons.garage_outlined,
                  title: l10n.chargingLogsNoCarTitle,
                  message: l10n.chargingLogsNoCarMessage,
                  actions: [
                    StateAction(
                      label: l10n.garageAddTitle,
                      icon: Icons.add,
                      primary: true,
                      onPressed: () => context.push(AppRoutes.garageAdd),
                    ),
                  ],
                ),
              )
            else
              SliverAsyncStateView<ChargingLogsState>(
                value: logs,
                onRetry: () => ref.invalidate(provider),
                isEmpty: (s) => s.items.isEmpty,
                emptyIcon: Icons.receipt_long_outlined,
                emptyTitle: l10n.chargingLogsEmptyTitle,
                emptyMessage: l10n.chargingLogsEmptyMessage,
                emptyActions: [
                  StateAction(
                    label: l10n.chargingLogsAdd,
                    icon: Icons.add,
                    primary: true,
                    onPressed: () => context.push(AppRoutes.chargingLogNew),
                  ),
                ],
                loading: Padding(
                  padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
                  child: const Skeleton(child: SkeletonList(item: ListTileSkeleton(), count: 6)),
                ),
                builder: (context, s) => _LogList(state: s, vehicleId: _vehicle, vehicles: vehicles.value ?? const []),
              ),
          ],
        );
      },
    );
  }
}

class _LogList extends ConsumerWidget {
  const _LogList({required this.state, required this.vehicleId, required this.vehicles});

  final ChargingLogsState state;
  final String? vehicleId;
  final List<UserVehicle> vehicles;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final lang = context.languageCode;
    final fmt = AppFormatters.of(context);
    // Group by month of the local date.
    final rows = <Object>[];
    String? lastMonth;
    for (final log in state.items) {
      final local = log.chargedAt.toLocal();
      final key = fmt.shapeDate(DateFormat.yMMMM(lang).format(local));
      if (key != lastMonth) {
        rows.add(key);
        lastMonth = key;
      }
      rows.add(log);
    }
    return SliverResponsivePadding(
      maxWidth: kMaxReadableWidth,
      sliver: SliverPadding(
        padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.sm, context.pageGutter, 96),
        sliver: SliverList.builder(
          itemCount: rows.length + 1,
          itemBuilder: (context, i) {
            if (i == rows.length) {
              if (state.loadMoreError != null) {
                return ErrorState(
                  error: state.loadMoreError!,
                  compact: true,
                  onRetry: () => ref.read(chargingLogsProvider(vehicleId).notifier).loadMore(),
                );
              }
              if (state.hasMore) {
                return Padding(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  child: Center(
                    child: state.loadingMore
                        ? const CircularProgressIndicator()
                        : SecondaryButton(
                            label: l10n.chargingLogsLoadMore,
                            onPressed: () => ref.read(chargingLogsProvider(vehicleId).notifier).loadMore(),
                          ),
                  ),
                );
              }
              return const SizedBox.shrink();
            }
            final row = rows[i];
            if (row is String) {
              return Padding(
                padding: const EdgeInsets.only(top: AppSpacing.lg, bottom: AppSpacing.sm),
                child: Semantics(
                  header: true,
                  child: Text(
                    row,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
              );
            }
            return Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: ChargingLogTile(log: row as ChargingLog, showVehicle: vehicleId == null && vehicles.length > 1),
            );
          },
        ),
      ),
    );
  }
}

/// One session as a card.
class ChargingLogTile extends StatelessWidget {
  const ChargingLogTile({super.key, required this.log, this.showVehicle = false});

  final ChargingLog log;
  final bool showVehicle;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final energy = fmt.energyKwh(log.energyKwh)!;
    final cost = log.cost == null ? null : fmt.money(log.cost!.amount, log.cost!.currency);
    final perKwh = log.costPerKwh == null ? null : fmt.rate(log.costPerKwh!.amount, log.costPerKwh!.currency);
    final soc = log.socStart != null && log.socEnd != null
        ? fmt.range(fmt.percent(log.socStart)!, fmt.percent(log.socEnd)!)
        : null;
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    return AppCard(
      onTap: () => context.push(AppRoutes.chargingLogEdit(log.id)),
      semanticLabel: [
        fmt.dateTime(log.chargedAt),
        energy,
        cost ?? l10n.chargingLogsNoCost,
        LogLabels.location(l10n, log.locationType),
        if (showVehicle) log.vehicleName,
      ].join(', '),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IconBadge(icon: LogLabels.locationIcon(log.locationType), size: 44),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Energy (+ AC/DC) and the amount paid share the first line
                // and wrap under each other at large text sizes instead of
                // squeezing the text column.
                Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: AppSpacing.md,
                  runSpacing: AppSpacing.xxs,
                  children: [
                    Wrap(
                      spacing: AppSpacing.sm,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(energy, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                        if (log.currentType != null) Pill(label: log.currentType!, dense: true, outlined: true),
                      ],
                    ),
                    Text(
                      cost ?? l10n.chargingLogsNoCost,
                      style: cost != null ? theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700) : muted,
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  [
                    fmt.dateTime(log.chargedAt),
                    LogLabels.location(l10n, log.locationType),
                    ?log.stationName,
                    if (showVehicle) log.vehicleName,
                  ].whereType<String>().join(' · '),
                  style: muted,
                ),
                if (soc != null || log.odometerKm != null || perKwh != null) ...[
                  const SizedBox(height: AppSpacing.xxs),
                  Text(
                    [
                      ?soc,
                      if (log.odometerKm != null) fmt.distanceKm(log.odometerKm)!,
                      if (perKwh != null) l10n.chargingLogsPerKwh(perKwh),
                    ].join(' · '),
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
