import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_timezone/flutter_timezone.dart';

import '../../../app/di/providers.dart';
import '../../../app/router/app_routes.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../core/errors/app_errors.dart';
import '../../../shared/widgets/kit.dart';
import '../../compare/application/compare_providers.dart';
import '../../compare/domain/picker_models.dart';
import '../../garage/common/personal_widgets.dart';
import '../../news/application/news_providers.dart';
import '../../news/domain/article.dart';
import '../application/notifications_providers.dart';
import '../data/notifications_repository.dart';
import '../domain/notification_models.dart';

/// Notification preferences (`/notifications/preferences`): what to be told
/// about (types), topics followed (brands, models, categories, markets),
/// channels, quiet hours and unsubscribe from everything.
class NotificationPreferencesScreen extends ConsumerWidget {
  const NotificationPreferencesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return PersonalPage(
      title: l10n.notificationsPreferencesTitle,
      returnTo: AppRoutes.notificationPreferences,
      guestMessage: l10n.notificationsGuestMessage,
      builder: (context, user) {
        final prefs = ref.watch(notificationPreferencesProvider);
        return AppScaffold(
          title: l10n.notificationsPreferencesTitle,
          onRefresh: () async {
            ref.invalidate(notificationSubscriptionsProvider);
            await ref.refresh(notificationPreferencesProvider.future).then((_) {}, onError: (_) {});
          },
          body: AsyncStateView<NotificationPreferences>(
            value: prefs,
            onRetry: () => ref.invalidate(notificationPreferencesProvider),
            loading: Padding(
              padding: EdgeInsets.all(context.pageGutter),
              child: const Skeleton(child: SkeletonList(item: ListTileSkeleton(), count: 8)),
            ),
            builder: (context, p) => _PreferencesBody(prefs: p),
          ),
        );
      },
    );
  }
}

class _PreferencesBody extends ConsumerStatefulWidget {
  const _PreferencesBody({required this.prefs});

  final NotificationPreferences prefs;

  @override
  ConsumerState<_PreferencesBody> createState() => _PreferencesBodyState();
}

class _PreferencesBodyState extends ConsumerState<_PreferencesBody> {
  late NotificationPreferences _p = widget.prefs;
  bool _busy = false;

  @override
  void didUpdateWidget(covariant _PreferencesBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.prefs != widget.prefs) _p = widget.prefs;
  }

  Future<void> _patch(Map<String, Object?> patch) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final next = await ref.read(notificationsRepositoryProvider).updatePreferences(patch);
      if (mounted) setState(() => _p = next);
      ref.invalidate(notificationPreferencesProvider);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorMessage(context.l10n, e), tone: AppTone.danger);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _typeLabel(AppLocalizations l10n, String key) => switch (key) {
    NotificationTypes.news => l10n.notificationsTypeNews,
    NotificationTypes.priceAlerts => l10n.notificationsTypePriceAlerts,
    NotificationTypes.reminders => l10n.notificationsTypeReminders,
    NotificationTypes.community => l10n.notificationsTypeCommunity,
    NotificationTypes.stationAlerts => l10n.notificationsTypeStations,
    NotificationTypes.campaigns => l10n.notificationsTypeCampaigns,
    _ => key,
  };

  String _pushStatus(AppLocalizations l10n) => switch (_p.pushStatus) {
    'active' => l10n.notificationsPushActive,
    'disabled_by_user' => l10n.notificationsPushDisabled,
    'no_device' => l10n.notificationsPushNoDevice,
    _ => l10n.notificationsPushNotConfigured,
  };

  Future<void> _editQuietHours() async {
    final l10n = context.l10n;
    final current = _p.quietHours;
    TimeOfDay parse(String? s, TimeOfDay fallback) {
      final parts = s?.split(':');
      if (parts == null || parts.length != 2) return fallback;
      final h = int.tryParse(parts[0]);
      final m = int.tryParse(parts[1]);
      return h == null || m == null ? fallback : TimeOfDay(hour: h % 24, minute: m % 60);
    }

    final start = await showTimePicker(
      context: context,
      helpText: l10n.notificationsQuietStart,
      initialTime: parse(current?.start, const TimeOfDay(hour: 22, minute: 0)),
    );
    if (start == null || !mounted) return;
    final end = await showTimePicker(
      context: context,
      helpText: l10n.notificationsQuietEnd,
      initialTime: parse(current?.end, const TimeOfDay(hour: 7, minute: 0)),
    );
    if (end == null || !mounted) return;
    String hhmm(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
    var zone = current?.timezone;
    if (zone == null || zone.isEmpty) {
      try {
        zone = (await FlutterTimezone.getLocalTimezone()).identifier;
      } on Object {
        zone = ref.read(effectiveMarketProvider).timezone;
      }
    }
    await _patch({
      'quietHours': QuietHours(start: hhmm(start), end: hhmm(end), timezone: zone).toJson(),
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final quiet = _p.quietHours;
    return ListView(
      padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.md, context.pageGutter, AppSpacing.xxl),
      children: [
        ResponsiveCenter(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_busy) const LinearProgressIndicator(),
              if (_p.unsubscribedAll) ...[
                InlineNotice(
                  tone: AppTone.warning,
                  icon: Icons.notifications_off_outlined,
                  message: l10n.notificationsUnsubscribedAll,
                  action: TextButton(
                    onPressed: () => _patch({'unsubscribeAll': false}),
                    child: Text(l10n.notificationsResume),
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
              ],
              SectionCard(
                title: l10n.notificationsTypesSection,
                icon: Icons.category_outlined,
                subtitle: l10n.notificationsTypesHint,
                child: Column(
                  children: [
                    for (final key in NotificationTypes.all)
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        title: Text(_typeLabel(l10n, key)),
                        value: _p.typeOn(key) && !_p.unsubscribedAll,
                        onChanged: _busy
                            ? null
                            : (v) => _patch({
                                'types': {key: v},
                              }),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              const _TopicsSection(),
              const SizedBox(height: AppSpacing.lg),
              SectionCard(
                title: l10n.notificationsChannelsSection,
                icon: Icons.send_outlined,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      title: Text(l10n.notificationsChannelInApp),
                      subtitle: Text(l10n.notificationsChannelInAppHint),
                      value: true,
                      onChanged: null,
                    ),
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      title: Text(l10n.notificationsChannelPush),
                      subtitle: Text(_pushStatus(l10n)),
                      value: _p.pushEnabled && _p.pushConfigured,
                      onChanged: !_p.pushConfigured || _busy
                          ? null
                          : (v) => _patch({
                              'channels': {'push': v},
                            }),
                    ),
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      title: Text(l10n.notificationsChannelEmail),
                      subtitle: Text(l10n.notificationsChannelEmailUnavailable),
                      value: false,
                      onChanged: null,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              SectionCard(
                title: l10n.notificationsQuietSection,
                icon: Icons.bedtime_outlined,
                subtitle: l10n.notificationsQuietHint,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      title: Text(l10n.notificationsQuietEnabled),
                      subtitle: quiet == null
                          ? Text(l10n.notificationsQuietOff)
                          : Text(l10n.notificationsQuietRange(quiet.start, quiet.end, quiet.timezone)),
                      value: quiet != null,
                      onChanged: _busy
                          ? null
                          : (v) => v ? _editQuietHours() : _patch({'quietHours': null}),
                    ),
                    if (quiet != null)
                      Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: TextButton.icon(
                          icon: const Icon(Icons.schedule),
                          label: Text(l10n.notificationsQuietChange),
                          onPressed: _busy ? null : _editQuietHours,
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              if (!_p.unsubscribedAll)
                SecondaryButton(
                  label: l10n.notificationsUnsubscribeAll,
                  icon: Icons.notifications_off_outlined,
                  expand: true,
                  onPressed: _busy
                      ? null
                      : () async {
                          final ok = await showConfirmSheet(
                            context: context,
                            title: l10n.notificationsUnsubscribeAllConfirm,
                            message: l10n.notificationsUnsubscribeAllMessage,
                            confirmLabel: l10n.notificationsUnsubscribeAll,
                            destructive: true,
                            icon: Icons.notifications_off_outlined,
                          );
                          if (ok) await _patch({'unsubscribeAll': true});
                        },
                ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                l10n.notificationsReminderNote,
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Followed topics (`/me/notification-subscriptions`).
class _TopicsSection extends ConsumerWidget {
  const _TopicsSection();

  String _typeLabel(AppLocalizations l10n, String t) => switch (t) {
    TopicTypes.brand => l10n.notificationsTopicBrand,
    TopicTypes.model => l10n.notificationsTopicModel,
    TopicTypes.variant => l10n.notificationsTopicVariant,
    TopicTypes.category => l10n.notificationsTopicCategory,
    TopicTypes.market => l10n.notificationsTopicMarket,
    TopicTypes.station => l10n.notificationsTopicStation,
    TopicTypes.priceAlert => l10n.notificationsTopicPriceAlert,
    _ => t,
  };

  IconData _icon(String t) => switch (t) {
    TopicTypes.brand => Icons.verified_outlined,
    TopicTypes.model || TopicTypes.variant => Icons.directions_car_outlined,
    TopicTypes.category => Icons.label_outline,
    TopicTypes.market => Icons.public,
    TopicTypes.station => Icons.ev_station_outlined,
    TopicTypes.priceAlert => Icons.sell_outlined,
    _ => Icons.notifications_none,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final subs = ref.watch(notificationSubscriptionsProvider);
    return SectionCard(
      title: l10n.notificationsTopicsSection,
      icon: Icons.bookmark_add_outlined,
      subtitle: l10n.notificationsTopicsHint,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AsyncStateView<List<NotificationSubscription>>(
            value: subs,
            compact: true,
            onRetry: () => ref.invalidate(notificationSubscriptionsProvider),
            isEmpty: (s) => s.isEmpty,
            emptyIcon: Icons.bookmark_border,
            emptyTitle: l10n.notificationsTopicsEmpty,
            builder: (context, items) => Column(
              children: [
                for (final s in items)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(_icon(s.topicType)),
                    title: Text(s.targetName),
                    subtitle: Text(
                      [
                        _typeLabel(l10n, s.topicType),
                        if (s.marketCode != null) l10n.notificationsTopicInMarket(s.marketCode!),
                      ].join(' · '),
                    ),
                    trailing: IconButton(
                      tooltip: l10n.notificationsUnfollow(s.targetName),
                      icon: const Icon(Icons.close),
                      onPressed: () async {
                        try {
                          await ref.read(notificationsRepositoryProvider).unsubscribe(s.id);
                          ref.invalidate(notificationSubscriptionsProvider);
                        } on Object catch (e) {
                          if (context.mounted) showAppSnackBar(context, errorMessage(l10n, e), tone: AppTone.danger);
                        }
                      },
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              ActionChip(
                avatar: const Icon(Icons.add, size: 18),
                label: Text(l10n.notificationsFollowBrand),
                onPressed: () => _follow(context, ref, TopicTypes.brand),
              ),
              ActionChip(
                avatar: const Icon(Icons.add, size: 18),
                label: Text(l10n.notificationsFollowModel),
                onPressed: () => _follow(context, ref, TopicTypes.model),
              ),
              ActionChip(
                avatar: const Icon(Icons.add, size: 18),
                label: Text(l10n.notificationsFollowCategory),
                onPressed: () => _follow(context, ref, TopicTypes.category),
              ),
              ActionChip(
                avatar: const Icon(Icons.add, size: 18),
                label: Text(l10n.notificationsFollowMarket),
                onPressed: () => _follow(context, ref, TopicTypes.market),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _follow(BuildContext context, WidgetRef ref, String type) async {
    final l10n = context.l10n;
    final picked = await showAppBottomSheet<_TopicChoice>(
      context: context,
      title: switch (type) {
        TopicTypes.brand => l10n.notificationsFollowBrand,
        TopicTypes.model => l10n.notificationsFollowModel,
        TopicTypes.category => l10n.notificationsFollowCategory,
        _ => l10n.notificationsFollowMarket,
      },
      builder: (context) => _TopicPicker(type: type),
    );
    if (picked == null || !context.mounted) return;
    try {
      await ref
          .read(notificationsRepositoryProvider)
          .subscribe(
            topicType: type,
            brandId: type == TopicTypes.brand ? picked.id : null,
            modelId: type == TopicTypes.model ? picked.id : null,
            categoryId: type == TopicTypes.category ? picked.id : null,
            marketCode: type == TopicTypes.market ? picked.id : null,
          );
      ref.invalidate(notificationSubscriptionsProvider);
      if (context.mounted) showAppSnackBar(context, l10n.notificationsFollowed(picked.label), tone: AppTone.success);
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, errorMessage(l10n, e), tone: AppTone.danger);
    }
  }
}

class _TopicChoice {
  const _TopicChoice(this.id, this.label);

  final String id;
  final String label;
}

/// Brand / model (brand → model) / news category / market chooser.
class _TopicPicker extends ConsumerStatefulWidget {
  const _TopicPicker({required this.type});

  final String type;

  @override
  ConsumerState<_TopicPicker> createState() => _TopicPickerState();
}

class _TopicPickerState extends ConsumerState<_TopicPicker> {
  PickerItem? _brand;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final lang = context.languageCode;
    Widget list(List<_TopicChoice> items, ValueChanged<_TopicChoice> onTap) => Column(
      children: [
        for (final i in items)
          ListTile(title: Text(i.label), trailing: const ForwardChevron(), onTap: () => onTap(i)),
      ],
    );

    switch (widget.type) {
      case TopicTypes.market:
        return list(
          [for (final m in ref.watch(appConfigProvider).enabledMarkets) _TopicChoice(m.code, m.nameFor(lang))],
          (c) => Navigator.of(context).pop(c),
        );
      case TopicTypes.category:
        return AsyncStateView<CachedResult<List<NewsCategory>>>(
          value: ref.watch(newsCategoriesProvider),
          compact: true,
          onRetry: () => ref.invalidate(newsCategoriesProvider),
          isEmpty: (r) => r.data.isEmpty,
          builder: (context, r) =>
              list([for (final c in r.data) _TopicChoice(c.id, c.name)], (c) => Navigator.of(context).pop(c)),
        );
      default:
        final market = ref.watch(effectiveMarketProvider).code;
        final query = PickerQuery(brand: _brand?.id, market: market, allMarkets: true);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_brand != null)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  icon: const Icon(Icons.arrow_back),
                  label: Text(_brand!.label),
                  onPressed: () => setState(() => _brand = null),
                ),
              ),
            AsyncStateView<CachedResult<PickerPage>>(
              value: ref.watch(pickerProvider(query)),
              compact: true,
              onRetry: () => ref.invalidate(pickerProvider(query)),
              isEmpty: (r) => r.data.items.isEmpty,
              emptyTitle: l10n.garagePickerEmpty,
              builder: (context, r) => list([for (final i in r.data.items) _TopicChoice(i.id, i.label)], (c) {
                if (widget.type == TopicTypes.brand) {
                  Navigator.of(context).pop(c);
                } else if (_brand == null) {
                  setState(() => _brand = r.data.items.firstWhere((i) => i.id == c.id));
                } else {
                  Navigator.of(context).pop(_TopicChoice(c.id, '${_brand!.label} ${c.label}'));
                }
              }),
            ),
          ],
        );
    }
  }
}
