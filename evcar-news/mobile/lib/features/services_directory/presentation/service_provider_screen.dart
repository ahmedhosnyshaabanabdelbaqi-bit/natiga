import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../shared/widgets/kit.dart';
import '../../charging/presentation/widgets/charging_labels.dart' show distanceText;
import '../application/services_providers.dart';
import '../domain/service_models.dart';
import 'widgets/service_widgets.dart';

/// One service provider (`/services/:id`, id or slug): verified contact
/// data with its verification date, opening hours, services and brands,
/// call / WhatsApp / email / website / directions; sponsorship labelled.
class ServiceProviderScreen extends ConsumerWidget {
  const ServiceProviderScreen({super.key, required this.providerId});

  /// Provider id or slug.
  final String providerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final provider = serviceProviderDetailProvider(providerId);
    final value = ref.watch(provider);

    Future<void> refresh() async {
      ref.invalidate(provider);
      try {
        await ref.read(provider.future);
      } on Object {
        // Rendered below.
      }
    }

    return AppScaffold.slivers(
      title: value.value?.data.name ?? l10n.servicesDirectoryProviderTitle,
      onRefresh: refresh,
      slivers: [
        SliverAsyncStateView<CachedResult<ServiceProvider>>(
          value: value,
          onRetry: () => ref.invalidate(provider),
          loading: const ServicesListSkeleton(),
          builder: (context, res) => SliverToBoxAdapter(
            child: ResponsiveCenter(
              child: _ProviderBody(
                provider: res.data,
                cachedAt: res.fromCache ? res.savedAt : null,
                onRetry: () => ref.invalidate(provider),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _ProviderBody extends StatelessWidget {
  const _ProviderBody({required this.provider, required this.cachedAt, required this.onRetry});

  final ServiceProvider provider;
  final DateTime? cachedAt;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final p = provider;
    final distance = distanceText(fmt, l10n, p.distanceM);
    final tone = context.palette.tone(AppTone.brand);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (cachedAt != null) ...[
          CachedDataNotice(savedAt: cachedAt!, onRetry: onRetry),
          const SizedBox(height: AppSpacing.md),
        ],
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (p.logo != null)
              SizedBox(
                width: 72,
                child: ImageWithFallback(
                  url: p.logo!.url,
                  semanticLabel: p.logo!.alt,
                  credit: p.logo!.credit,
                  aspectRatio: 1,
                  width: 72,
                  fit: BoxFit.contain,
                  borderRadius: AppRadii.control,
                  fallbackIcon: serviceTypeIcon(p.type),
                  showFallbackText: false,
                ),
              )
            else
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(color: tone.container, borderRadius: AppRadii.control),
                child: Icon(serviceTypeIcon(p.type), color: tone.onContainer, size: 36),
              ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(p.typeLabel, style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary)),
                  const SizedBox(height: 2),
                  Semantics(
                    header: true,
                    child: Text(p.name, style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          children: [
            if (p.isSponsored) SponsoredLabel(sponsorName: p.sponsorLabel, dense: true),
            if (p.isDemo) const DemoBadge(dense: true),
            ServiceOpenPill(state: p.openNow, alwaysOpen: p.isAlwaysOpen),
          ],
        ),
        if (p.isSponsored) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(l10n.servicesDirectorySponsoredDetailNote, style: theme.textTheme.bodySmall),
        ],
        if (p.isDemo) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(l10n.commonDemoDescription, style: theme.textTheme.bodySmall),
        ],
        if (p.description != null) ...[
          const SizedBox(height: AppSpacing.lg),
          Text(p.description!, style: theme.textTheme.bodyLarge),
        ],
        const SizedBox(height: AppSpacing.lg),
        _Section(
          title: l10n.servicesDirectoryContactTitle,
          icon: Icons.contact_phone_outlined,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(alignment: AlignmentDirectional.centerStart, child: ContactVerificationPill(contact: p.contact, dense: false)),
              if (p.contact.stale || !p.contact.verified) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(l10n.servicesDirectoryCheckBeforeVisit, style: theme.textTheme.bodySmall),
              ],
              const SizedBox(height: AppSpacing.md),
              _InfoRow(icon: Icons.call_outlined, label: l10n.servicesDirectoryPhone, value: p.contact.phone),
              _InfoRow(icon: Icons.chat_outlined, label: l10n.servicesDirectoryWhatsApp, value: p.contact.whatsapp),
              _InfoRow(icon: Icons.mail_outline, label: l10n.servicesDirectoryEmail, value: p.contact.email),
              _InfoRow(icon: Icons.language, label: l10n.servicesDirectoryWebsite, value: safeWebsite(p.contact.websiteUrl)),
              const SizedBox(height: AppSpacing.md),
              ServiceContactActions(provider: p, includeEmail: true),
            ],
          ),
        ),
        _Section(
          title: l10n.servicesDirectoryLocationTitle,
          icon: Icons.place_outlined,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _InfoRow(icon: Icons.location_city_outlined, label: l10n.servicesDirectoryCity, value: p.city),
              _InfoRow(icon: Icons.signpost_outlined, label: l10n.servicesDirectoryAddress, value: p.address),
              if (distance != null)
                _InfoRow(icon: Icons.near_me_outlined, label: l10n.servicesDirectoryDistance, value: distance),
            ],
          ),
        ),
        _Section(
          title: l10n.servicesDirectoryHoursTitle,
          icon: Icons.schedule,
          child: _OpeningHours(provider: p),
        ),
        if (p.services.isNotEmpty)
          _Section(
            title: l10n.servicesDirectoryServicesTitle,
            icon: Icons.checklist_outlined,
            child: Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: [for (final s in p.services) Pill(label: serviceEntryLabel(s), icon: Icons.check, dense: true)],
            ),
          ),
        if (p.brands.isNotEmpty)
          _Section(
            title: l10n.servicesDirectoryBrandsTitle,
            icon: Icons.directions_car_outlined,
            child: Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final b in p.brands)
                  ActionChip(
                    avatar: const Icon(Icons.directions_car_outlined, size: 18),
                    label: Text(b.name),
                    onPressed: () => context.push(AppRoutes.brand(b.slug)),
                  ),
              ],
            ),
          ),
        const SizedBox(height: AppSpacing.lg),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.icon, required this.child});

  final String title;
  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.cardGap),
      child: AppCard(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SectionHeader(title: title, icon: icon, padding: EdgeInsets.zero),
            const SizedBox(height: AppSpacing.sm),
            child,
          ],
        ),
      ),
    );
  }
}

/// Label + value; missing values read "Not available", never blank or 0.
class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                if (value == null)
                  const NotAvailableValue()
                else
                  // Numbers and URLs read left-to-right inside Arabic text.
                  Text(value!, style: theme.textTheme.bodyLarge, textDirection: _looksLtr(value!) ? TextDirection.ltr : null),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static bool _looksLtr(String v) => !RegExp(r'[؀-ۿ]').hasMatch(v);
}

const _dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

class _OpeningHours extends StatelessWidget {
  const _OpeningHours({required this.provider});

  final ServiceProvider provider;

  String _day(AppLocalizations l10n, String d) => switch (d) {
    'mon' => l10n.servicesDirectoryDayMon,
    'tue' => l10n.servicesDirectoryDayTue,
    'wed' => l10n.servicesDirectoryDayWed,
    'thu' => l10n.servicesDirectoryDayThu,
    'fri' => l10n.servicesDirectoryDayFri,
    'sat' => l10n.servicesDirectoryDaySat,
    _ => l10n.servicesDirectoryDaySun,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    if (provider.isAlwaysOpen ?? false) {
      return Text(l10n.servicesDirectoryAlwaysOpen, style: theme.textTheme.bodyLarge);
    }
    final hours = provider.openingHours;
    if (hours == null || hours.isEmpty) {
      return Text(l10n.servicesDirectoryHoursNotAvailable, style: theme.textTheme.bodyMedium);
    }
    final byDay = {for (final d in hours) d.day: d};
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final d in _dayOrder)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(flex: 2, child: Text(_day(l10n, d), style: theme.textTheme.bodyMedium)),
                Expanded(
                  flex: 3,
                  child: Text(
                    switch (byDay[d]?.windows) {
                      null => l10n.servicesDirectoryHoursUnknownDay,
                      final w when w.isEmpty => l10n.servicesDirectoryClosedDay,
                      final w => w
                          .map((x) => '${_digits(fmt, x.start)}–${_digits(fmt, x.end)}')
                          .join(context.languageCode == 'ar' ? '، ' : ', '),
                    },
                    style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ),
        if (provider.timezone != null) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(
            l10n.servicesDirectoryTimezone(provider.timezone!),
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ],
    );
  }

  /// "HH:MM" with the locale's digits.
  static String _digits(AppFormatters fmt, String hhmm) {
    final parts = hhmm.split(':');
    if (parts.length != 2) return hhmm;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    if (h == null || m == null) return hhmm;
    return '${fmt.number(h)!.padLeft(2, fmt.number(0)!)}:${fmt.number(m)!.padLeft(2, fmt.number(0)!)}';
  }
}
