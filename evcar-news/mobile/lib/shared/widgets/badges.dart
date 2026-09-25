import 'package:flutter/material.dart';

import '../../app/theme/app_palette.dart';
import '../../app/theme/app_tokens.dart';
import '../../core/l10n/l10n.dart';

/// Small rounded label with an optional icon, coloured by [AppTone].
///
/// Non-interactive. Always carries text (and usually an icon), so the tone
/// colour is never the only signal.
///
/// ```dart
/// Pill(label: 'WLTP', icon: Icons.straighten, tone: AppTone.info)
/// ```
class Pill extends StatelessWidget {
  const Pill({
    super.key,
    required this.label,
    this.icon,
    this.tone = AppTone.neutral,
    this.dense = false,
    this.tooltip,
    this.semanticLabel,
    this.outlined = false,
  });

  final String label;
  final IconData? icon;
  final AppTone tone;
  final bool dense;
  final String? tooltip;

  /// Overrides what screen readers announce (defaults to [label]).
  final String? semanticLabel;

  /// Border instead of filled background (for use on busy surfaces).
  final bool outlined;

  @override
  Widget build(BuildContext context) {
    final colors = context.palette.tone(tone);
    final theme = Theme.of(context);
    final style = (dense ? theme.textTheme.labelSmall : theme.textTheme.labelMedium)?.copyWith(
      color: colors.onContainer,
      fontWeight: FontWeight.w600,
    );
    Widget pill = Container(
      padding: EdgeInsetsDirectional.fromSTEB(dense ? 6 : 10, dense ? 2 : 4, dense ? 8 : 10, dense ? 2 : 4),
      decoration: BoxDecoration(
        color: outlined ? Colors.transparent : colors.container,
        borderRadius: AppRadii.pill,
        border: Border.all(color: colors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: dense ? 12 : 14, color: colors.onContainer),
            SizedBox(width: dense ? 3 : 4),
          ],
          Flexible(
            child: Text(
              label,
              style: style,
              // Enlarged text may wrap instead of hiding the label.
              maxLines: context.textScale > 1.3 ? 3 : 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
    pill = Semantics(label: semanticLabel ?? label, excludeSemantics: true, child: pill);
    if (tooltip != null) pill = Tooltip(message: tooltip!, child: pill);
    return pill;
  }
}

/// "بيانات تجريبية / Demo data" — mandatory on every `isDemo=true` record
/// (news, cars, stations, panoramas, reviews). Demo data must never look real.
class DemoBadge extends StatelessWidget {
  const DemoBadge({super.key, this.dense = false});

  final bool dense;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Pill(
      label: l10n.commonDemoLabel,
      icon: Icons.science_outlined,
      tone: AppTone.demo,
      dense: dense,
      tooltip: l10n.commonDemoDescription,
      semanticLabel: '${l10n.commonDemoLabel}. ${l10n.commonDemoDescription}',
    );
  }
}

/// Kind of paid placement.
enum SponsoredKind {
  /// An advertisement ("إعلان").
  ad,

  /// Sponsored content / sponsorship ("رعاية").
  sponsorship,
}

/// "إعلان / رعاية" label. Ads and sponsorship are always labelled and never
/// change comparison results (ARCHITECTURE §3).
class SponsoredLabel extends StatelessWidget {
  const SponsoredLabel({super.key, this.kind = SponsoredKind.sponsorship, this.sponsorName, this.dense = false});

  final SponsoredKind kind;
  final String? sponsorName;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final name = sponsorName?.trim();
    final label = switch (kind) {
      SponsoredKind.ad => l10n.commonAdLabel,
      SponsoredKind.sponsorship =>
        name == null || name.isEmpty ? l10n.commonSponsoredLabel : l10n.commonSponsoredBy(name),
    };
    return Pill(
      label: label,
      icon: Icons.campaign_outlined,
      tone: AppTone.sponsored,
      dense: dense,
      tooltip: l10n.commonSponsoredDescription,
      semanticLabel: '$label. ${l10n.commonSponsoredDescription}',
    );
  }
}

/// Prominent "360°" badge for cars/trims with a published interior tour
/// (REQUIREMENTS §3: tours must be visible, not hidden in menus).
class Tour360Badge extends StatelessWidget {
  const Tour360Badge({super.key, this.dense = false});

  final bool dense;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final style = (dense ? theme.textTheme.labelSmall : theme.textTheme.labelMedium)?.copyWith(
      color: Colors.white,
      fontWeight: FontWeight.w700,
    );
    return Semantics(
      label: l10n.commonTour360Available,
      excludeSemantics: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: context.palette.brandGradient,
          borderRadius: AppRadii.pill,
          boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 6, offset: Offset(0, 2))],
        ),
        child: Padding(
          padding: EdgeInsetsDirectional.fromSTEB(dense ? 6 : 8, dense ? 2 : 4, dense ? 8 : 10, dense ? 2 : 4),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.threesixty, size: dense ? 14 : 16, color: Colors.white),
              const SizedBox(width: 4),
              Flexible(
                child: Text(l10n.commonTour360, style: style, maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Powertrain classes (REQUIREMENTS §6: BEV / PHEV / EREV / HEV are always
/// labelled clearly; a hybrid is never shown as a full EV).
enum Powertrain {
  bev('bev'),
  phev('phev'),
  erev('erev'),
  hev('hev');

  const Powertrain(this.apiValue);

  final String apiValue;

  static Powertrain? fromApi(String? value) {
    final v = value?.toLowerCase();
    for (final p in values) {
      if (p.apiValue == v) return p;
    }
    return null;
  }
}

/// "كهربائية بالكامل · BEV" style pill.
class PowertrainPill extends StatelessWidget {
  const PowertrainPill({super.key, required this.powertrain, this.dense = false});

  final Powertrain powertrain;
  final bool dense;

  static String labelFor(AppLocalizations l10n, Powertrain p) => switch (p) {
    Powertrain.bev => l10n.commonPowertrainBev,
    Powertrain.phev => l10n.commonPowertrainPhev,
    Powertrain.erev => l10n.commonPowertrainErev,
    Powertrain.hev => l10n.commonPowertrainHev,
  };

  @override
  Widget build(BuildContext context) {
    final name = labelFor(context.l10n, powertrain);
    return Pill(
      label: '$name · ${powertrain.apiValue.toUpperCase()}',
      icon: powertrain == Powertrain.bev ? Icons.bolt : Icons.local_gas_station_outlined,
      tone: powertrain == Powertrain.bev ? AppTone.brand : AppTone.neutral,
      dense: dense,
    );
  }
}
