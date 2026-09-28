import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../garage/application/garage_providers.dart';
import '../data/charging_logs_repository.dart';
import '../domain/charging_log.dart';

@immutable
class ChargingLogsState {
  const ChargingLogsState({
    required this.items,
    required this.page,
    required this.hasMore,
    this.total,
    this.loadingMore = false,
    this.loadMoreError,
  });

  final List<ChargingLog> items;
  final int page;
  final bool hasMore;
  final int? total;
  final bool loadingMore;
  final Object? loadMoreError;

  ChargingLogsState copyWith({
    List<ChargingLog>? items,
    int? page,
    bool? hasMore,
    bool? loadingMore,
    Object? Function()? loadMoreError,
  }) => ChargingLogsState(
    items: items ?? this.items,
    page: page ?? this.page,
    hasMore: hasMore ?? this.hasMore,
    total: total,
    loadingMore: loadingMore ?? this.loadingMore,
    loadMoreError: loadMoreError != null ? loadMoreError() : this.loadMoreError,
  );
}

/// Paginated charging log, newest first; family arg = vehicle filter (null = all cars).
class ChargingLogsController extends AsyncNotifier<ChargingLogsState> {
  ChargingLogsController(this.vehicleId);

  final String? vehicleId;
  static const pageSize = 30;

  @override
  Future<ChargingLogsState> build() async {
    final userId = ref.watch(personalUserIdProvider);
    if (userId == null) return const ChargingLogsState(items: [], page: 1, hasMore: false);
    final res = await ref.watch(chargingLogsRepositoryProvider).list(vehicleId: vehicleId, pageSize: pageSize);
    return ChargingLogsState(items: res.items, page: 1, hasMore: res.meta.hasMore, total: res.meta.total);
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || current.loadingMore || !current.hasMore || state.isLoading) return;
    state = AsyncData(current.copyWith(loadingMore: true, loadMoreError: () => null));
    try {
      final res = await ref
          .read(chargingLogsRepositoryProvider)
          .list(vehicleId: vehicleId, page: current.page + 1, pageSize: pageSize);
      if (!ref.mounted) return;
      final seen = {for (final l in current.items) l.id};
      state = AsyncData(
        current.copyWith(
          items: [...current.items, ...res.items.where((l) => seen.add(l.id))],
          page: current.page + 1,
          hasMore: res.meta.hasMore && res.items.isNotEmpty,
          loadingMore: false,
        ),
      );
    } on Object catch (e) {
      if (!ref.mounted) return;
      state = AsyncData(current.copyWith(loadingMore: false, loadMoreError: () => e));
    }
  }
}

final chargingLogsProvider = AsyncNotifierProvider.autoDispose.family<ChargingLogsController, ChargingLogsState, String?>(
  ChargingLogsController.new,
);

final chargingLogProvider = FutureProvider.autoDispose.family<ChargingLog, String>((ref, id) {
  ref.watch(personalUserIdProvider);
  return ref.watch(chargingLogsRepositoryProvider).get(id);
});

/// Report period presets (inclusive calendar dates; null = all time).
enum ReportPeriod { last3Months, last6Months, last12Months, allTime }

@immutable
class ReportQuery {
  const ReportQuery({this.period = ReportPeriod.last12Months, this.vehicleId});

  final ReportPeriod period;
  final String? vehicleId;

  ({DateTime? from, DateTime? to}) range(DateTime today) {
    final months = switch (period) {
      ReportPeriod.last3Months => 3,
      ReportPeriod.last6Months => 6,
      ReportPeriod.last12Months => 12,
      ReportPeriod.allTime => null,
    };
    if (months == null) return (from: null, to: null);
    // First day of the month (months − 1) ago → whole months in the chart.
    return (from: DateTime(today.year, today.month - (months - 1)), to: DateTime(today.year, today.month, today.day));
  }

  @override
  bool operator ==(Object other) => other is ReportQuery && other.period == period && other.vehicleId == vehicleId;

  @override
  int get hashCode => Object.hash(period, vehicleId);
}

final chargingReportProvider = FutureProvider.autoDispose.family<ChargingReport, ReportQuery>((ref, q) {
  final userId = ref.watch(personalUserIdProvider);
  if (userId == null) throw StateError('signed out');
  final r = q.range(DateTime.now());
  return ref.watch(chargingLogsRepositoryProvider).report(from: r.from, to: r.to, vehicleId: q.vehicleId);
});
