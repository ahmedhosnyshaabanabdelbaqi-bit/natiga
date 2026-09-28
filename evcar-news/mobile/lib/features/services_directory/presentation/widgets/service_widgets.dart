import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/formatting/digits.dart';
import '../../../../core/links/external_links.dart';
import '../../../../shared/widgets/kit.dart';
import '../../../charging/presentation/widgets/charging_labels.dart' show distanceText;
import '../../../charging/presentation/widgets/directions_sheet.dart';
import '../../domain/service_models.dart';

/// Sponsorship label of a directory entry. The server's `sponsorLabel` is
/// the complete label chosen by the admin (it falls back to "مُموَّل /
/// Sponsored"), not a sponsor name, so it is shown as-is — never wrapped in
/// "Sponsored by …". Icon + text + tooltip, never colour only.
class DirectorySponsoredLabel extends StatelessWidget {
  const DirectorySponsoredLabel({super.key, this.label, this.dense = true});

  final String? label;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final text = label?.trim();
    final shown = text == null || text.isEmpty ? l10n.commonSponsoredLabel : text;
    return Pill(
      label: shown,
      icon: Icons.campaign_outlined,
      tone: AppTone.sponsored,
      dense: dense,
      tooltip: l10n.commonSponsoredDescription,
      semanticLabel: '$shown. ${l10n.commonSponsoredDescription}',
    );
  }
}

IconData serviceTypeIcon(String type) => switch (type) {
  ServiceTypes.serviceCenter => Icons.build_outlined,
  ServiceTypes.dealer => Icons.storefront_outlined,
  ServiceTypes.chargerInstaller => Icons.ev_station_outlined,
  ServiceTypes.emergency => Icons.car_crash_outlined,
  ServiceTypes.batteryService => Icons.battery_charging_full,
  _ => Icons.handyman_outlined,
};

/// Verification of the contact data: verified (date), verified long ago
/// (warning), or not verified — icon + text, never colour only.
class ContactVerificationPill extends StatelessWidget {
  const ContactVerificationPill({super.key, required this.contact, this.dense = true});

  final ServiceContact contact;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final date = AppFormatters.of(context).date(contact.verifiedAt);
    if (!contact.verified) {
      return Pill(
        icon: Icons.help_outline,
        tone: AppTone.warning,
        dense: dense,
        label: contact.label ?? l10n.servicesDirectoryNotVerified,
      );
    }
    if (contact.stale) {
      return Pill(
        icon: Icons.history,
        tone: AppTone.warning,
        dense: dense,
        label:
            contact.label ??
            (date == null ? l10n.servicesDirectoryVerifiedLongAgo : l10n.servicesDirectoryVerifiedStale(date)),
      );
    }
    return Pill(
      icon: Icons.verified_outlined,
      tone: AppTone.success,
      dense: dense,
      label: contact.label ?? (date == null ? l10n.servicesDirectoryVerified : l10n.servicesDirectoryVerifiedOn(date)),
    );
  }
}

/// Open now / closed / hours unknown.
class ServiceOpenPill extends StatelessWidget {
  const ServiceOpenPill({super.key, required this.state, this.alwaysOpen});

  final ServiceOpenState state;
  final bool? alwaysOpen;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (alwaysOpen ?? false) {
      return Pill(
        icon: Icons.all_inclusive,
        tone: AppTone.success,
        dense: true,
        label: l10n.servicesDirectoryAlwaysOpen,
      );
    }
    return switch (state) {
      ServiceOpenState.open => Pill(
        icon: Icons.schedule,
        tone: AppTone.success,
        dense: true,
        label: l10n.servicesDirectoryOpenNow,
      ),
      ServiceOpenState.closed => Pill(
        icon: Icons.do_not_disturb_on_outlined,
        tone: AppTone.danger,
        dense: true,
        label: l10n.servicesDirectoryClosedNow,
      ),
      ServiceOpenState.unknown => Pill(
        icon: Icons.help_outline,
        dense: true,
        label: l10n.servicesDirectoryHoursUnknown,
      ),
    };
  }
}

/// A service entry for display: free text as entered by the editors, or a
/// `snake_case` code turned into words ("battery_check" → "Battery check").
String serviceEntryLabel(String raw) {
  final t = raw.trim();
  if (!RegExp(r'^[a-z0-9]+(_[a-z0-9]+)+$').hasMatch(t)) return t;
  final words = t.replaceAll('_', ' ');
  return words[0].toUpperCase() + words.substring(1);
}

/// `tel:` URI with only digits and a leading `+`.
String? telUri(String? phone) {
  if (phone == null) return null;
  final western = toWesternDigits(phone);
  final plus = western.trim().startsWith('+');
  final digits = western.replaceAll(RegExp(r'\D'), '');
  return digits.length < 3 ? null : 'tel:${plus ? '+' : ''}$digits';
}

/// `https://wa.me/<digits>` for a WhatsApp number (international format).
String? whatsAppUri(String? number) {
  if (number == null) return null;
  final digits = toWesternDigits(number).replaceAll(RegExp(r'\D'), '');
  return digits.length < 6 ? null : 'https://wa.me/$digits';
}

/// Website only when it is a well-formed https URL.
String? safeWebsite(String? url) {
  final uri = Uri.tryParse(url?.trim() ?? '');
  if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) return null;
  return uri.toString();
}

String? mailUri(String? email) {
  final e = email?.trim();
  if (e == null || !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(e)) return null;
  return 'mailto:$e';
}

/// Call / WhatsApp / email / website / directions buttons. Demo entries get
/// no working actions (their numbers and places are invented).
class ServiceContactActions extends ConsumerWidget {
  const ServiceContactActions({super.key, required this.provider, this.includeEmail = false});

  final ServiceProvider provider;
  final bool includeEmail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final p = provider;
    if (p.isDemo) {
      // The card / page already carries the demo badge: explain, don't repeat it.
      final theme = Theme.of(context);
      return Row(
        children: [
          Icon(Icons.phone_disabled_outlined, size: 18, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              l10n.servicesDirectoryDemoNoContact,
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ),
        ],
      );
    }
    final tel = telUri(p.contact.phone);
    final wa = whatsAppUri(p.contact.whatsapp);
    final web = safeWebsite(p.contact.websiteUrl);
    final mail = includeEmail ? mailUri(p.contact.email) : null;
    final actions = <Widget>[
      if (tel != null)
        _ActionButton(
          icon: Icons.call_outlined,
          label: l10n.servicesDirectoryCall,
          primary: true,
          onPressed: () => openExternalUrl(context, tel),
        ),
      if (wa != null)
        _ActionButton(
          icon: Icons.chat_outlined,
          label: l10n.servicesDirectoryWhatsApp,
          onPressed: () => openExternalUrl(context, wa),
        ),
      if (mail != null)
        _ActionButton(
          icon: Icons.mail_outline,
          label: l10n.servicesDirectoryEmail,
          onPressed: () => openExternalUrl(context, mail),
        ),
      if (web != null)
        _ActionButton(
          icon: Icons.language,
          label: l10n.servicesDirectoryWebsite,
          onPressed: () => openExternalUrl(context, web),
        ),
      if (p.hasLocation)
        _ActionButton(
          icon: Icons.directions_outlined,
          label: l10n.servicesDirectoryDirections,
          onPressed: () => showDirectionsSheet(context, ref, lat: p.latitude!, lng: p.longitude!, label: p.name),
        ),
    ];
    if (actions.isEmpty) {
      return Text(
        l10n.servicesDirectoryNoContact,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
      );
    }
    return Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.sm, children: actions);
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({required this.icon, required this.label, required this.onPressed, this.primary = false});

  final IconData icon;
  final String label;
  final VoidCallback onPressed;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    const size = Size(kMinTouchTarget, kMinTouchTarget);
    return primary
        ? FilledButton.tonalIcon(
            style: FilledButton.styleFrom(minimumSize: size),
            onPressed: onPressed,
            icon: Icon(icon, size: 18),
            label: Text(label),
          )
        : OutlinedButton.icon(
            style: OutlinedButton.styleFrom(minimumSize: size),
            onPressed: onPressed,
            icon: Icon(icon, size: 18),
            label: Text(label),
          );
  }
}

/// A provider in the directory list (or the sponsored slot).
class ServiceProviderCard extends StatelessWidget {
  const ServiceProviderCard({super.key, required this.provider, this.showActions = true});

  final ServiceProvider provider;
  final bool showActions;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final p = provider;
    final distance = distanceText(fmt, l10n, p.distanceM);
    final place = [?p.city, if (distance != null) l10n.servicesDirectoryDistanceAway(distance)].join(' · ');
    final tone = context.palette.tone(AppTone.brand);
    final semantic = [
      p.name,
      p.typeLabel,
      if (p.isSponsored) l10n.commonSponsoredLabel,
      if (p.isDemo) l10n.commonDemoLabel,
      if (place.isNotEmpty) place,
    ].join('. ');
    return AppCard(
      semanticLabel: semantic,
      onTap: () => context.push(AppRoutes.serviceProvider(p.slug)),
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (p.logo != null)
                SizedBox(
                  width: 52,
                  child: ImageWithFallback(
                    url: p.logo!.url,
                    semanticLabel: p.logo!.alt,
                    aspectRatio: 1,
                    width: 52,
                    fit: BoxFit.contain,
                    borderRadius: AppRadii.control,
                    fallbackIcon: serviceTypeIcon(p.type),
                    showFallbackText: false,
                  ),
                )
              else
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(color: tone.container, borderRadius: AppRadii.control),
                  child: Icon(serviceTypeIcon(p.type), color: tone.onContainer),
                ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(p.typeLabel, style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.primary)),
                    const SizedBox(height: 2),
                    Text(p.name, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                    if (place.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        place,
                        style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: [
              if (p.isSponsored) DirectorySponsoredLabel(label: p.sponsorLabel),
              if (p.isDemo) const DemoBadge(dense: true),
              ContactVerificationPill(contact: p.contact),
              ServiceOpenPill(state: p.openNow, alwaysOpen: p.isAlwaysOpen),
            ],
          ),
          if (showActions) ...[const SizedBox(height: AppSpacing.md), ServiceContactActions(provider: p)],
        ],
      ),
    );
  }
}

class ServicesListSkeleton extends StatelessWidget {
  const ServicesListSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Skeleton(
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
        child: Column(
          children: [
            for (var i = 0; i < 3; i++)
              const Padding(
                padding: EdgeInsets.only(bottom: AppSpacing.cardGap),
                child: SkeletonCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          SkeletonBox(width: 52, height: 52),
                          SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                SkeletonLine(widthFactor: 0.3),
                                SizedBox(height: AppSpacing.sm),
                                SkeletonLine(widthFactor: 0.8, fontSize: 16),
                              ],
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: AppSpacing.md),
                      SkeletonLine(widthFactor: 0.6),
                      SizedBox(height: AppSpacing.md),
                      SkeletonBox(width: 120, height: 40),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
