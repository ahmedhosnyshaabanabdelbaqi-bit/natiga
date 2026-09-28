import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/errors/app_errors.dart';
import '../../../shared/widgets/kit.dart';
import '../../garage/application/garage_providers.dart';
import '../../garage/common/personal_forms.dart';
import '../../garage/common/personal_widgets.dart';
import '../application/reminder_notifications.dart';
import '../application/reminders_providers.dart';
import '../data/reminders_repository.dart';
import '../domain/reminder.dart';

/// Localized texts for the reminder notifications scheduled on the device.
ReminderNotificationTexts reminderNotificationTexts(BuildContext context) {
  final l10n = context.l10n;
  final fmt = AppFormatters.of(context);
  return (
    title: (r) => r.displayTitle,
    body: (r) {
      final due = fmt.date(r.dueDay);
      final parts = [
        if (r.vehicleName != null) r.vehicleName!,
        if (due != null) l10n.remindersDueOn(due),
        if (r.dueOdometerKm != null) l10n.remindersDueAtKm(fmt.distanceKm(r.dueOdometerKm)!),
      ];
      return parts.join(' · ');
    },
    channelName: l10n.remindersChannelName,
    channelDescription: l10n.remindersChannelDescription,
  );
}

/// Reminders (`/reminders`): maintenance, insurance, licence, tyres, custom.
/// Stored on the server; the phone shows a local notification on each
/// reminder's `notifyOn` day when the user turned that on.
class RemindersScreen extends ConsumerStatefulWidget {
  const RemindersScreen({super.key});

  @override
  ConsumerState<RemindersScreen> createState() => _RemindersScreenState();
}

class _RemindersScreenState extends ConsumerState<RemindersScreen> {
  RemindersFilter _filter = RemindersFilter.open;

  void _sync(List<Reminder> open) {
    ref.read(reminderNotificationsProvider.notifier).sync(open, reminderNotificationTexts(context));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    // Re-sync the device notifications every time the open list loads.
    ref.listen<AsyncValue<List<Reminder>>>(remindersProvider(RemindersFilter.open), (_, next) {
      if (next case AsyncData(:final value)) _sync(value);
    });
    return PersonalPage(
      title: l10n.remindersTitle,
      returnTo: AppRoutes.reminders,
      guestMessage: l10n.remindersGuestMessage,
      builder: (context, user) {
        final provider = remindersProvider(_filter);
        final value = ref.watch(provider);
        // Keep the open list alive for syncing even on the "completed" tab.
        ref.watch(remindersProvider(RemindersFilter.open));
        return AppScaffold.slivers(
          title: l10n.remindersTitle,
          largeTitle: true,
          onRefresh: () async {
            ref.invalidate(remindersProvider(RemindersFilter.open));
            await ref.refresh(provider.future).then((_) {}, onError: (_) {});
          },
          floatingActionButton: AddFab(label: l10n.remindersNewTitle, onPressed: () => context.push(AppRoutes.reminderNew)),
          slivers: [
            const SliverToBoxAdapter(child: _DeviceNotificationsCard()),
            SliverToBoxAdapter(
              child: FilterBar(
                chips: [
                  AppFilterChip(
                    label: l10n.remindersFilterOpen,
                    selected: _filter == RemindersFilter.open,
                    onSelected: (_) => setState(() => _filter = RemindersFilter.open),
                  ),
                  AppFilterChip(
                    label: l10n.remindersFilterCompleted,
                    selected: _filter == RemindersFilter.completed,
                    onSelected: (_) => setState(() => _filter = RemindersFilter.completed),
                  ),
                ],
              ),
            ),
            SliverAsyncStateView<List<Reminder>>(
              value: value,
              onRetry: () => ref.invalidate(provider),
              isEmpty: (items) => items.isEmpty,
              emptyIcon: _filter == RemindersFilter.open ? Icons.alarm_add_outlined : Icons.task_alt,
              emptyTitle: _filter == RemindersFilter.open ? l10n.remindersEmptyTitle : l10n.remindersEmptyCompletedTitle,
              emptyMessage: _filter == RemindersFilter.open ? l10n.remindersEmptyMessage : null,
              emptyActions: [
                if (_filter == RemindersFilter.open)
                  StateAction(
                    label: l10n.remindersNewTitle,
                    icon: Icons.add,
                    primary: true,
                    onPressed: () => context.push(AppRoutes.reminderNew),
                  ),
              ],
              loading: Padding(
                padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
                child: const Skeleton(child: SkeletonList(item: ListTileSkeleton(), count: 5)),
              ),
              builder: (context, items) => SliverResponsivePadding(
                maxWidth: kMaxReadableWidth,
                sliver: SliverPadding(
                  padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.sm, context.pageGutter, 96),
                  sliver: SliverList.separated(
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.sm),
                    itemBuilder: (context, i) => ReminderCard(reminder: items[i]),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _DeviceNotificationsCard extends ConsumerWidget {
  const _DeviceNotificationsCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final state = ref.watch(reminderNotificationsProvider);
    final gutter = context.pageGutter;
    if (!state.supported) {
      return Padding(
        padding: EdgeInsets.fromLTRB(gutter, AppSpacing.sm, gutter, 0),
        child: InlineNotice(message: l10n.remindersNotificationsUnsupported, icon: Icons.notifications_off_outlined),
      );
    }
    return Padding(
      padding: EdgeInsets.fromLTRB(gutter, AppSpacing.sm, gutter, 0),
      child: ResponsiveCenter(
        padding: EdgeInsets.zero,
        child: AppCard(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SwitchListTile.adaptive(
                contentPadding: EdgeInsets.zero,
                secondary: Icon(state.enabled ? Icons.notifications_active_outlined : Icons.notifications_off_outlined),
                title: Text(l10n.remindersDeviceNotifications),
                subtitle: Text(state.enabled ? l10n.remindersDeviceNotificationsOn : l10n.remindersDeviceNotificationsOff),
                value: state.enabled,
                onChanged: (on) async {
                  final result = await ref.read(reminderNotificationsProvider.notifier).setEnabled(on);
                  if (result.enabled) {
                    final open = ref.read(remindersProvider(RemindersFilter.open)).value;
                    if (open != null && context.mounted) {
                      await ref.read(reminderNotificationsProvider.notifier).sync(open, reminderNotificationTexts(context));
                    }
                  }
                },
              ),
              if (state.permissionDenied)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: InlineNotice(
                    tone: AppTone.warning,
                    icon: Icons.lock_outline,
                    message: l10n.remindersPermissionDenied,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One reminder with its status (icon + text, never colour alone).
class ReminderCard extends ConsumerWidget {
  const ReminderCard({super.key, required this.reminder});

  final Reminder reminder;

  static (AppTone, IconData, String) statusOf(AppLocalizations l10n, ReminderStatus s) => switch (s) {
    ReminderStatus.overdue => (AppTone.danger, Icons.error_outline, l10n.remindersStatusOverdue),
    ReminderStatus.dueSoon => (AppTone.warning, Icons.schedule, l10n.remindersStatusDueSoon),
    ReminderStatus.upcoming => (AppTone.info, Icons.event_available_outlined, l10n.remindersStatusUpcoming),
    ReminderStatus.completed => (AppTone.success, Icons.task_alt, l10n.remindersStatusCompleted),
  };

  static IconData typeIcon(ReminderType t) => switch (t) {
    ReminderType.maintenance => Icons.build_outlined,
    ReminderType.insurance => Icons.shield_outlined,
    ReminderType.licence => Icons.badge_outlined,
    ReminderType.tyres => Icons.tire_repair_outlined,
    ReminderType.custom => Icons.push_pin_outlined,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final r = reminder;
    final (tone, icon, statusLabel) = statusOf(l10n, r.status);
    final due = [
      if (fmt.date(r.dueDay) case final d?) l10n.remindersDueOn(d),
      if (r.dueOdometerKm != null) l10n.remindersDueAtKm(fmt.distanceKm(r.dueOdometerKm)!),
    ].join(' · ');
    final relative = [
      if (!r.isCompleted && r.dueInDays != null)
        r.dueInDays! < 0 ? l10n.remindersDaysLate(-r.dueInDays!) : l10n.remindersInDays(r.dueInDays!),
      if (!r.isCompleted && r.dueInKm != null)
        r.dueInKm! < 0 ? l10n.remindersKmLate(fmt.distanceKm(-r.dueInKm!)!) : l10n.remindersInKm(fmt.distanceKm(r.dueInKm)!),
    ].join(' · ');
    return AppCard(
      onTap: () => context.push(AppRoutes.reminderEdit(r.id)),
      semanticLabel: [r.displayTitle, statusLabel, due, relative, ?r.vehicleName].where((s) => s.isNotEmpty).join(', '),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: context.palette.tone(tone).container,
                child: Icon(typeIcon(r.type), color: context.palette.tone(tone).onContainer),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r.displayTitle, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    if (r.vehicleName != null)
                      Text(r.vehicleName!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                  ],
                ),
              ),
              Pill(label: statusLabel, icon: icon, tone: tone, dense: true),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          if (due.isNotEmpty) Text(due, style: theme.textTheme.bodyMedium),
          if (relative.isNotEmpty) Text(relative, style: theme.textTheme.bodySmall),
          if (r.repeats)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Row(
                children: [
                  Icon(Icons.repeat, size: 16, color: theme.colorScheme.onSurfaceVariant),
                  const SizedBox(width: AppSpacing.xs),
                  Expanded(
                    child: Text(
                      [
                        if (r.repeatIntervalMonths != null) l10n.remindersEveryMonths(r.repeatIntervalMonths!),
                        if (r.repeatIntervalKm != null) l10n.remindersEveryKm(fmt.distanceKm(r.repeatIntervalKm)!),
                      ].join(' · '),
                      style: theme.textTheme.bodySmall,
                    ),
                  ),
                ],
              ),
            ),
          if (!r.isCompleted) ...[
            const SizedBox(height: AppSpacing.sm),
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: TextButton.icon(
                icon: const Icon(Icons.check),
                label: Text(l10n.remindersMarkDone),
                onPressed: () => completeReminder(context, ref, r),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Asks for the odometer when useful, completes the reminder and reports
/// the next occurrence of a repeating one.
Future<bool> completeReminder(BuildContext context, WidgetRef ref, Reminder r) async {
  final l10n = context.l10n;
  num? odometer;
  if (r.vehicleId != null) {
    final controller = TextEditingController(text: numberToInput(r.vehicleOdometerKm));
    final ok = await showConfirmSheetWithField(context, r, controller);
    if (ok == null) {
      controller.dispose();
      return false;
    }
    try {
      odometer = parseNumberInput(controller.text);
    } on FormatException {
      odometer = null;
    }
    controller.dispose();
  } else {
    final ok = await showConfirmSheet(
      context: context,
      title: l10n.remindersCompleteTitle,
      message: r.repeats ? l10n.remindersCompleteRepeats : l10n.remindersCompleteMessage,
      confirmLabel: l10n.remindersMarkDone,
      icon: Icons.task_alt,
    );
    if (!ok) return false;
  }
  try {
    final res = await ref.read(remindersRepositoryProvider).complete(r.id, odometerKm: odometer);
    ref.invalidate(remindersProvider);
    ref.invalidate(garageVehiclesProvider);
    if (!context.mounted) return true;
    final next = res.next;
    final fmt = AppFormatters.of(context);
    showAppSnackBar(
      context,
      next == null
          ? l10n.remindersCompleted
          : l10n.remindersCompletedNext(
              [
                ?fmt.date(next.dueDay),
                if (next.dueOdometerKm != null) fmt.distanceKm(next.dueOdometerKm)!,
              ].join(' · '),
            ),
      tone: AppTone.success,
    );
    return true;
  } on Object catch (e) {
    if (context.mounted) showAppSnackBar(context, errorMessage(l10n, e), tone: AppTone.danger);
    return false;
  }
}

/// Completion sheet with an optional odometer reading. Returns null when cancelled.
Future<bool?> showConfirmSheetWithField(BuildContext context, Reminder r, TextEditingController controller) {
  final l10n = context.l10n;
  return showAppBottomSheet<bool>(
    context: context,
    title: l10n.remindersCompleteTitle,
    builder: (context) => Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(r.repeats ? l10n.remindersCompleteRepeats : l10n.remindersCompleteMessage),
          const SizedBox(height: AppSpacing.md),
          NumberField(
            controller: controller,
            label: l10n.remindersOdometerNow,
            unit: AppFormatters.of(context).unitLabel(Unit.km),
            helper: l10n.remindersOdometerNowHint,
            allowDecimal: false,
          ),
          const SizedBox(height: AppSpacing.md),
        ],
      ),
    ),
    footer: (context) => PrimaryButton(
      label: l10n.remindersMarkDone,
      icon: Icons.check,
      expand: true,
      onPressed: () => Navigator.of(context).pop(true),
    ),
  );
}
