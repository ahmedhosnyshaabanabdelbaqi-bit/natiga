import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/errors/app_errors.dart';
import '../../../core/notifications/local_notifications.dart';
import '../../../shared/widgets/kit.dart';
import '../../garage/application/garage_providers.dart';
import '../../garage/common/personal_forms.dart';
import '../../garage/common/personal_widgets.dart';
import '../../garage/domain/user_vehicle.dart';
import '../application/reminder_notifications.dart';
import '../application/reminders_providers.dart';
import '../data/reminders_repository.dart';
import '../domain/reminder.dart';
import 'reminders_screen.dart';

/// Add (`/reminders/new[?vehicle=]`) or edit (`/reminders/:id/edit`) a
/// reminder: by due date and/or odometer, optionally repeating.
class ReminderEditScreen extends ConsumerWidget {
  const ReminderEditScreen({super.key, this.reminderId});

  /// Reminder id; null when adding.
  final String? reminderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final title = reminderId == null ? l10n.remindersNewTitle : l10n.remindersEditTitle;
    return PersonalPage(
      title: title,
      returnTo: reminderId == null ? AppRoutes.reminderNew : AppRoutes.reminderEdit(reminderId!),
      guestMessage: l10n.remindersGuestMessage,
      builder: (context, user) {
        final vehicles = ref.watch(garageVehiclesProvider);
        final reminder = reminderId == null ? const AsyncData<Reminder?>(null) : ref.watch(reminderProvider(reminderId!));
        final AsyncValue<(List<UserVehicle>, Reminder?)> combined = switch ((vehicles, reminder)) {
          (AsyncData(value: final v), AsyncData(value: final r)) => AsyncData((v, r)),
          (AsyncError(:final error, :final stackTrace), _) || (_, AsyncError(:final error, :final stackTrace)) =>
            AsyncError(error, stackTrace),
          _ => const AsyncLoading(),
        };
        return Scaffold(
          appBar: AppBar(title: Text(title)),
          body: AsyncStateView<(List<UserVehicle>, Reminder?)>(
            value: combined,
            onRetry: () {
              ref.invalidate(garageVehiclesProvider);
              if (reminderId != null) ref.invalidate(reminderProvider(reminderId!));
            },
            builder: (context, d) => _ReminderForm(
              vehicles: d.$1,
              existing: d.$2,
              initialVehicle: GoRouterState.of(context).uri.queryParameters['vehicle'],
            ),
          ),
        );
      },
    );
  }
}

class _ReminderForm extends ConsumerStatefulWidget {
  const _ReminderForm({required this.vehicles, this.existing, this.initialVehicle});

  final List<UserVehicle> vehicles;
  final Reminder? existing;
  final String? initialVehicle;

  @override
  ConsumerState<_ReminderForm> createState() => _ReminderFormState();
}

class _ReminderFormState extends ConsumerState<_ReminderForm> {
  final _formKey = GlobalKey<FormState>();
  late final Reminder? e = widget.existing;
  late ReminderType _type = e?.type ?? ReminderType.maintenance;
  late final _title = TextEditingController(text: e?.type == ReminderType.custom ? (e?.title ?? '') : '');
  late final _dueKm = TextEditingController(text: numberToInput(e?.dueOdometerKm));
  late final _repeatMonths = TextEditingController(text: numberToInput(e?.repeatIntervalMonths));
  late final _repeatKm = TextEditingController(text: numberToInput(e?.repeatIntervalKm));
  late final _notifyDays = TextEditingController(text: numberToInput(e?.notifyDaysBefore ?? 7));
  late final _notifyKm = TextEditingController(text: numberToInput(e?.notifyKmBefore));
  late final _notes = TextEditingController(text: e?.notes ?? '');
  late DateTime? _dueDate = e?.dueDay;
  late String? _vehicleId = _initialVehicle();
  bool _saving = false;
  Map<String, String> _errors = const {};

  String? _initialVehicle() {
    final ids = widget.vehicles.map((v) => v.id).toSet();
    if (e != null) return ids.contains(e!.vehicleId) ? e!.vehicleId : null;
    if (ids.contains(widget.initialVehicle)) return widget.initialVehicle;
    return widget.vehicles.where((v) => v.isPrimary).firstOrNull?.id;
  }

  @override
  void dispose() {
    for (final c in [_title, _dueKm, _repeatMonths, _repeatKm, _notifyDays, _notifyKm, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  String _typeLabel(AppLocalizations l10n, ReminderType t) => switch (t) {
    ReminderType.maintenance => l10n.remindersTypeMaintenance,
    ReminderType.insurance => l10n.remindersTypeInsurance,
    ReminderType.licence => l10n.remindersTypeLicence,
    ReminderType.tyres => l10n.remindersTypeTyres,
    ReminderType.custom => l10n.remindersTypeCustom,
  };

  FormFieldValidator<String> _int({int? min, int? max}) => (raw) {
    final l10n = context.l10n;
    num? v;
    try {
      v = parseNumberInput(raw ?? '');
    } on FormatException {
      return l10n.garageErrorNumber;
    }
    if (v == null) return null;
    if (v != v.roundToDouble()) return l10n.remindersErrorWhole;
    if ((min != null && v < min) || (max != null && v > max)) {
      return l10n.remindersErrorRange(min ?? 0, max ?? 0);
    }
    return null;
  };

  FormFieldValidator<String> _positive() => (raw) {
    final l10n = context.l10n;
    try {
      final v = parseNumberInput(raw ?? '');
      if (v != null && v < 0) return l10n.garageErrorNegative;
    } on FormatException {
      return l10n.garageErrorNumber;
    }
    return null;
  };

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: _dueDate ?? now.add(const Duration(days: 30)),
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year + 20),
    );
    if (d != null) setState(() => _dueDate = d);
  }

  Future<void> _save() async {
    final l10n = context.l10n;
    setState(() => _errors = const {});
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final dueKm = parseNumberInput(_dueKm.text);
    final repeatKm = parseNumberInput(_repeatKm.text);
    final errors = <String, String>{};
    if (_type == ReminderType.custom && _title.text.trim().isEmpty) errors['title'] = l10n.remindersErrorTitle;
    if (_dueDate == null && dueKm == null) errors['dueDate'] = l10n.remindersErrorDue;
    if ((dueKm != null || repeatKm != null) && _vehicleId == null) errors['userVehicleId'] = l10n.remindersErrorVehicleForKm;
    if (errors.isNotEmpty) {
      setState(() => _errors = errors);
      return;
    }
    final draft = ReminderDraft(
      type: _type,
      title: _type == ReminderType.custom ? _title.text : null,
      userVehicleId: _vehicleId,
      notes: _notes.text,
      dueDate: _dueDate == null ? null : isoDate(_dueDate!),
      dueOdometerKm: dueKm,
      repeatIntervalMonths: parseNumberInput(_repeatMonths.text)?.toInt(),
      repeatIntervalKm: repeatKm,
      notifyDaysBefore: parseNumberInput(_notifyDays.text)?.toInt(),
      notifyKmBefore: parseNumberInput(_notifyKm.text),
    );
    setState(() => _saving = true);
    try {
      final repo = ref.read(remindersRepositoryProvider);
      if (e == null) {
        await repo.create(draft);
      } else {
        await repo.update(e!.id, draft);
      }
      _afterChange();
      if (!mounted) return;
      showAppSnackBar(context, l10n.remindersSaved, tone: AppTone.success);
      final notifications = ref.read(reminderNotificationsProvider);
      if (notifications.supported && !notifications.enabled) {
        showAppSnackBar(
          context,
          l10n.remindersEnableHint,
          icon: Icons.notifications_none,
          actionLabel: l10n.remindersEnableAction,
          onAction: () => ref.read(reminderNotificationsProvider.notifier).setEnabled(true),
        );
      }
      context.pop();
    } on ApiException catch (err) {
      if (!mounted) return;
      setState(() => _errors = fieldErrorsOf(err));
      showAppSnackBar(context, errorMessage(l10n, err), tone: AppTone.danger);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _afterChange() {
    ref.invalidate(remindersProvider);
    ref.invalidate(garageVehiclesProvider);
    if (e != null) ref.invalidate(reminderProvider(e!.id));
  }

  Future<void> _delete() async {
    final l10n = context.l10n;
    final ok = await showConfirmSheet(
      context: context,
      title: l10n.remindersDeleteConfirm,
      message: l10n.remindersDeleteMessage,
      confirmLabel: l10n.remindersDelete,
      destructive: true,
      icon: Icons.delete_outline,
    );
    if (!ok || !mounted) return;
    try {
      await ref.read(remindersRepositoryProvider).delete(e!.id);
      await ref.read(localNotificationsProvider).cancel(localNotificationIdFor('reminder:${e!.id}'));
      _afterChange();
      if (!mounted) return;
      showAppSnackBar(context, l10n.remindersDeleted, tone: AppTone.success);
      context.pop();
    } on Object catch (err) {
      if (mounted) showAppSnackBar(context, errorMessage(l10n, err), tone: AppTone.danger);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final km = fmt.unitLabel(Unit.km);
    return Form(
      key: _formKey,
      child: ListView(
        padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.md, context.pageGutter, AppSpacing.xxl),
        children: [
          ResponsiveCenter(
            padding: EdgeInsets.zero,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (e != null && e!.isCompleted) ...[
                  InlineNotice(message: l10n.remindersAlreadyCompleted, tone: AppTone.success, icon: Icons.task_alt),
                  const SizedBox(height: AppSpacing.lg),
                ],
                SectionCard(
                  title: l10n.remindersWhatSection,
                  icon: Icons.label_outline,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ChoicePills<ReminderType>(
                        options: {for (final t in ReminderType.values) t: _typeLabel(l10n, t)},
                        selected: _type,
                        onSelected: (t) => setState(() => _type = t),
                      ),
                      if (_type == ReminderType.custom) ...[
                        const SizedBox(height: AppSpacing.md),
                        TextFormField(
                          controller: _title,
                          maxLength: 200,
                          decoration: InputDecoration(labelText: l10n.remindersTitleField, errorText: _errors['title']),
                        ),
                      ],
                      const SizedBox(height: AppSpacing.md),
                      DropdownButtonFormField<String?>(
                        initialValue: _vehicleId,
                        isExpanded: true,
                        decoration: InputDecoration(
                          labelText: l10n.remindersCar,
                          helperText: l10n.remindersCarHint,
                          helperMaxLines: 3,
                          errorText: _errors['userVehicleId'],
                        ),
                        items: [
                          DropdownMenuItem<String?>(child: Text(l10n.remindersNoCar)),
                          for (final v in widget.vehicles) DropdownMenuItem<String?>(value: v.id, child: Text(v.displayName)),
                        ],
                        onChanged: (v) => setState(() => _vehicleId = v),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                SectionCard(
                  title: l10n.remindersWhenSection,
                  icon: Icons.event_outlined,
                  subtitle: l10n.remindersWhenHint,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      InkWell(
                        onTap: _pickDate,
                        borderRadius: AppRadii.control,
                        child: InputDecorator(
                          decoration: InputDecoration(
                            labelText: l10n.remindersDueDate,
                            errorText: _errors['dueDate'],
                            suffixIcon: _dueDate == null
                                ? const Icon(Icons.calendar_today_outlined)
                                : IconButton(
                                    tooltip: l10n.garageClear,
                                    icon: const Icon(Icons.clear),
                                    onPressed: () => setState(() => _dueDate = null),
                                  ),
                          ),
                          child: Text(fmt.date(_dueDate) ?? l10n.garageOptional),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      NumberField(
                        controller: _dueKm,
                        label: l10n.remindersDueKm,
                        unit: km,
                        allowDecimal: false,
                        validator: _positive(),
                        errorText: _errors['dueOdometerKm'],
                        enabled: _vehicleId != null,
                        helper: _vehicleId == null ? l10n.remindersDueKmNeedsCar : null,
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: NumberField(
                              controller: _repeatMonths,
                              label: l10n.remindersRepeatMonths,
                              allowDecimal: false,
                              validator: _int(min: 1, max: 120),
                              errorText: _errors['repeatIntervalMonths'],
                            ),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: NumberField(
                              controller: _repeatKm,
                              label: l10n.remindersRepeatKm,
                              unit: km,
                              allowDecimal: false,
                              validator: _positive(),
                              errorText: _errors['repeatIntervalKm'],
                              enabled: _vehicleId != null,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                SectionCard(
                  title: l10n.remindersAlertSection,
                  icon: Icons.notifications_none,
                  subtitle: l10n.remindersAlertHint,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: NumberField(
                          controller: _notifyDays,
                          label: l10n.remindersNotifyDays,
                          allowDecimal: false,
                          validator: _int(min: 0, max: 365),
                          errorText: _errors['notifyDaysBefore'],
                        ),
                      ),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(
                        child: NumberField(
                          controller: _notifyKm,
                          label: l10n.remindersNotifyKm,
                          unit: km,
                          allowDecimal: false,
                          validator: _positive(),
                          errorText: _errors['notifyKmBefore'],
                          enabled: _vehicleId != null,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                TextFormField(
                  controller: _notes,
                  maxLength: 2000,
                  minLines: 2,
                  maxLines: 5,
                  decoration: InputDecoration(labelText: l10n.remindersNotes, errorText: _errors['notes']),
                ),
                const SizedBox(height: AppSpacing.xl),
                PrimaryButton(
                  label: l10n.commonSave,
                  icon: Icons.check,
                  expand: true,
                  loading: _saving,
                  onPressed: _saving ? null : _save,
                ),
                if (e != null && !e!.isCompleted) ...[
                  const SizedBox(height: AppSpacing.sm),
                  SecondaryButton(
                    label: l10n.remindersMarkDone,
                    icon: Icons.task_alt,
                    expand: true,
                    onPressed: () async {
                      final done = await completeReminder(context, ref, e!);
                      if (done && context.mounted) context.pop();
                    },
                  ),
                ],
                if (e != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  SecondaryButton(label: l10n.remindersDelete, icon: Icons.delete_outline, expand: true, onPressed: _delete),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
