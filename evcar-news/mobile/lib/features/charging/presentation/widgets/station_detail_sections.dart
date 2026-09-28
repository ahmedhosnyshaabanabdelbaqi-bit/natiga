import 'package:flutter/material.dart';
import 'package:intl/intl.dart' show DateFormat;
import 'package:timezone/timezone.dart' as tz;

import '../../../../core/links/external_links.dart';
import '../../../../core/time/time_zones.dart';
import '../../../../shared/widgets/kit.dart';
import '../../domain/station_models.dart';
import '../../domain/station_status.dart';
import 'charging_labels.dart';

/// Formats [utc] as a wall-clock time in the station's time zone
/// ("22:00"); falls back to device time when the zone is unknown.
String? stationClock(BuildContext context, DateTime? utc, String? zone, {bool withDay = false}) {
  if (utc == null) return null;
  final loc = TimeZones.location(zone);
  final lang = context.languageCode;
  final DateTime local = loc == null ? utc.toLocal() : tz.TZDateTime.from(utc, loc);
  final t = DateFormat.jm(lang).format(local);
  if (!withDay) return t;
  return '${DateFormat.EEEE(lang).format(local)} $t';
}

/// Section card with a header.
class DetailSection extends StatelessWidget {
  const DetailSection({super.key, required this.title, required this.icon, required this.child, this.trailing});

  final String title;
  final IconData icon;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.cardGap),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              header: true,
              child: Row(
                children: [
                  Icon(icon, size: 22, color: theme.colorScheme.primary),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                  ),
                  ?trailing,
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            child,
          ],
        ),
      ),
    );
  }
}

/// Small grey helper text.
class HelpText extends StatelessWidget {
  const HelpText(this.text, {super.key, this.icon});

  final String text;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final style = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    if (icon == null) return Text(text, style: style);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 1),
          child: Icon(icon, size: 16, color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(width: AppSpacing.xs),
        Expanded(child: Text(text, style: style)),
      ],
    );
  }
}

/// Label / value row that stacks at large text.
class InfoRow extends StatelessWidget {
  const InfoRow({super.key, required this.label, required this.value, this.icon, this.onTap});

  final String label;
  final String? value;
  final IconData? icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n;
    final v = value?.trim();
    final valueWidget = v == null || v.isEmpty
        ? NotAvailableValue(style: theme.textTheme.bodyMedium)
        : Text(
            v,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: onTap != null ? theme.colorScheme.primary : null,
              decoration: onTap != null ? TextDecoration.underline : null,
            ),
          );
    final content = Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.xxs,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          if (icon != null) Icon(icon, size: 18, color: theme.colorScheme.onSurfaceVariant),
          Text('$label:', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          valueWidget,
        ],
      ),
    );
    return Semantics(
      label: '$label: ${v == null || v.isEmpty ? l10n.commonNotAvailable : v}',
      link: onTap != null,
      excludeSemantics: true,
      child: onTap == null
          ? content
          : InkWell(
              onTap: onTap,
              borderRadius: const BorderRadius.all(Radius.circular(AppRadii.xs)),
              child: ConstrainedBox(constraints: const BoxConstraints(minHeight: kMinTouchTarget), child: content),
            ),
    );
  }
}

// ---------------------------------------------------------------------------
// Three statuses
// ---------------------------------------------------------------------------

class _StatusRow extends StatelessWidget {
  const _StatusRow({required this.kind, required this.look, this.details = const []});

  final String kind;
  final StatusLook look;
  final List<String> details;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.palette.tone(look.tone);
    return Semantics(
      container: true,
      label: [kind, look.label, ...details].join('. '),
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: colors.container,
                shape: BoxShape.circle,
                border: Border.all(color: colors.border),
              ),
              child: Icon(look.icon, size: 22, color: colors.onContainer),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(kind, style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                  Text(look.label, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                  for (final d in details)
                    Padding(padding: const EdgeInsets.only(top: AppSpacing.xxs), child: HelpText(d)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Operational / open now / live availability — three separate answers
/// (ARCHITECTURE §3), never merged into one "available" badge.
class StationStatusSection extends StatelessWidget {
  const StationStatusSection({super.key, required this.station, required this.now, required this.offlineCopy});

  final StationDetail station;
  final DateTime now;
  final bool offlineCopy;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final s = station;
    final hours = s.hours;

    // 1. Operational (data).
    final op = operationalLook(l10n, s.operationalStatus, serverLabel: s.operationalStatusLabel);

    // 2. Open now (schedule + station time zone).
    final openState = effectiveOpenNow(hours, now: now, offlineCopy: offlineCopy);
    final open = openNowLook(l10n, openState);
    final openDetails = <String>[];
    if (hours.isAlwaysOpen == true) {
      openDetails.add(l10n.chargingOpen24h);
    } else if (!offlineCopy && openState == hours.openNow.state) {
      final closes = stationClock(context, hours.openNow.closesAt, hours.timezone);
      final opens = stationClock(context, hours.openNow.opensAt, hours.timezone, withDay: true);
      if (openState == OpenState.open && closes != null) openDetails.add(l10n.chargingClosesAt(closes));
      if (openState == OpenState.closed && opens != null) openDetails.add(l10n.chargingOpensAt(opens));
    }
    if (openState == OpenState.unknown) {
      openDetails.add(hours.openingHoursText != null ? l10n.chargingHoursTextOnly : l10n.chargingHoursNotPublished);
    }
    if (offlineCopy && openState != OpenState.unknown) openDetails.add(l10n.chargingOpenNowFromSaved);
    if (hours.timezone != null) openDetails.add(l10n.chargingStationTimezone(hours.timezone!));

    // 3. Live availability (live provider only; expiry enforced on device).
    final avail = stationAvailability([for (final c in s.allConnectors) c.availability], now: now, offlineCopy: offlineCopy);
    final a = s.availability;
    final availDetails = <String>[];
    if (offlineCopy) {
      availDetails.add(l10n.chargingOfflineNoLive);
    } else if (!a.liveProviderConfigured && avail != AvailabilityDisplay.available) {
      availDetails.add(l10n.chargingNoLiveSourceForStation);
    } else {
      if (avail == AvailabilityDisplay.available || avail == AvailabilityDisplay.occupied || avail == AvailabilityDisplay.outOfOrder) {
        availDetails.add(
          l10n.chargingAvailCounts(
            fmt.number(a.available)!,
            fmt.number(a.occupied)!,
            fmt.number(a.outOfOrder)!,
            fmt.number(a.unknown)!,
          ),
        );
      }
      if (a.provider != null) availDetails.add(l10n.chargingAvailSource(a.provider!));
      if (a.lastObservedAt != null) {
        availDetails.add(l10n.chargingAvailObserved(fmt.dateTime(a.lastObservedAt)!));
      }
    }
    if (avail == AvailabilityDisplay.uncertain) availDetails.add(l10n.chargingAvailExpiredExplain);
    if (a.disclaimer != null) availDetails.add(a.disclaimer!);

    return DetailSection(
      title: l10n.chargingStatusSection,
      icon: Icons.fact_check_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _StatusRow(kind: l10n.chargingStatusOperational, look: op),
          const Divider(height: 1),
          _StatusRow(kind: l10n.chargingStatusOpenNow, look: open, details: openDetails),
          const Divider(height: 1),
          _StatusRow(kind: l10n.chargingStatusLive, look: availabilityLook(l10n, avail), details: availDetails),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Chargers and connectors
// ---------------------------------------------------------------------------

class ConnectorsSection extends StatelessWidget {
  const ConnectorsSection({super.key, required this.station, required this.now, required this.offlineCopy});

  final StationDetail station;
  final DateTime now;
  final bool offlineCopy;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final s = station;
    final summary = [
      if (s.pointCount != null) l10n.chargingPointCount(s.pointCount!) else l10n.chargingPointCountUnknown,
      if (s.connectorCount != null) l10n.chargingPlugCount(s.connectorCount!),
    ].join(' · ');
    return DetailSection(
      title: l10n.chargingConnectorsSection,
      icon: Icons.ev_station_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(summary, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: AppSpacing.xxs),
          HelpText(l10n.chargingPlugsNotCars, icon: Icons.info_outline),
          for (final p in s.points) ...[
            const SizedBox(height: AppSpacing.md),
            _PointHeader(point: p),
            for (final c in p.connectors) _ConnectorTile(connector: c, now: now, offlineCopy: offlineCopy, fmt: fmt),
          ],
          if (s.unassignedConnectors.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Text(l10n.chargingUnassignedConnectors, style: theme.textTheme.titleSmall),
            HelpText(l10n.chargingUnassignedConnectorsHelp),
            for (final c in s.unassignedConnectors)
              _ConnectorTile(connector: c, now: now, offlineCopy: offlineCopy, fmt: fmt),
          ],
          if (s.allConnectors.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: Text(l10n.chargingNoConnectorData),
            ),
        ],
      ),
    );
  }
}

class _PointHeader extends StatelessWidget {
  const _PointHeader({required this.point});

  final ChargingPoint point;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final op = operationalLook(l10n, point.operationalStatus);
    final extra = [
      if (point.evseId != null) 'EVSE ${point.evseId}',
      if (point.floorLevel != null) l10n.chargingFloor(point.floorLevel!),
      ?point.parkingRestrictions,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(point.label ?? l10n.chargingPointUnnamed, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
            if (point.operationalStatus != OperationalStatus.operational)
              StatusPill(look: op, kind: l10n.chargingStatusOperational),
          ],
        ),
        if (extra.isNotEmpty) HelpText(extra.join(' · ')),
      ],
    );
  }
}

class _ConnectorTile extends StatelessWidget {
  const _ConnectorTile({required this.connector, required this.now, required this.offlineCopy, required this.fmt});

  final StationConnector connector;
  final DateTime now;
  final bool offlineCopy;
  final AppFormatters fmt;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final c = connector;
    final dc = c.currentType == CurrentType.dc;
    final avail = connectorAvailability(c.availability, now: now, offlineCopy: offlineCopy);
    final a = c.availability;
    final specs = [
      if (c.currentType != null) c.currentType!.apiValue,
      fmt.powerKw(c.maxPowerKw) ?? l10n.chargingPowerUnknown,
      if (c.format == 'cable') l10n.chargingFormatCable,
      if (c.format == 'socket') l10n.chargingFormatSocket,
      if (c.phases != null) l10n.chargingPhases(c.phases!),
      if (c.quantity > 1) l10n.chargingQuantity(c.quantity),
    ].join(' · ');
    final availDetail = switch (avail) {
      AvailabilityDisplay.available || AvailabilityDisplay.occupied || AvailabilityDisplay.outOfOrder => [
        if (a.source != null) l10n.chargingAvailSource(a.source!),
        if (a.observedAt != null) l10n.chargingAvailObserved(fmt.dateTime(a.observedAt)!),
        if (a.expiresAt != null) l10n.chargingAvailValidUntil(fmt.dateTime(a.expiresAt)!),
      ].join(' · '),
      AvailabilityDisplay.uncertain => a.observedAt == null
          ? l10n.chargingAvailExpiredExplain
          : l10n.chargingAvailLastReading(fmt.dateTime(a.observedAt)!),
      _ => '',
    };
    final compat = c.compatibility;
    return Semantics(
      container: true,
      child: Padding(
        padding: const EdgeInsets.only(top: AppSpacing.sm),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: context.palette.tone(dc ? AppTone.brand : AppTone.info).container,
                borderRadius: const BorderRadius.all(Radius.circular(AppRadii.sm)),
              ),
              child: Icon(
                dc ? Icons.bolt : Icons.power_outlined,
                color: context.palette.tone(dc ? AppTone.brand : AppTone.info).onContainer,
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(c.typeName, style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600)),
                  Text(specs, style: theme.textTheme.bodySmall),
                  const SizedBox(height: AppSpacing.xs),
                  Wrap(
                    spacing: AppSpacing.xs,
                    runSpacing: AppSpacing.xs,
                    children: [
                      StatusPill(look: availabilityLook(l10n, avail), kind: l10n.chargingStatusLive),
                      if (c.operationalStatus != OperationalStatus.operational && c.operationalStatus != OperationalStatus.unknown)
                        StatusPill(look: operationalLook(l10n, c.operationalStatus), kind: l10n.chargingStatusOperational),
                      if (compat != null)
                        Pill(
                          dense: true,
                          tone: compat.compatible ? AppTone.brand : AppTone.neutral,
                          icon: compat.compatible ? Icons.verified_outlined : Icons.do_not_disturb_alt,
                          label: compat.compatible
                              ? (compat.maxUsablePowerKw == null
                                    ? l10n.chargingConnectorCompatible
                                    : l10n.chargingConnectorCompatibleUpTo(fmt.powerKw(compat.maxUsablePowerKw)!))
                              : l10n.chargingConnectorNotCompatible,
                        ),
                    ],
                  ),
                  if (availDetail.isNotEmpty)
                    Padding(padding: const EdgeInsets.only(top: AppSpacing.xxs), child: HelpText(availDetail)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Opening hours
// ---------------------------------------------------------------------------

class HoursSection extends StatelessWidget {
  const HoursSection({super.key, required this.hours, required this.now});

  final StationHours hours;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final today = TimeZones.nowIn(hours.timezone, now: now)?.weekday;
    final weekly = hours.weekly;
    return DetailSection(
      title: l10n.chargingHoursSection,
      icon: Icons.schedule_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (hours.isAlwaysOpen == true)
            Text(l10n.chargingOpen24h, style: theme.textTheme.bodyLarge)
          else if (weekly != null)
            for (final d in weekly)
              _DayRow(day: d, isToday: today != null && const ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(d.day) == today - 1)
          else
            Text(l10n.chargingHoursNotPublished),
          if (hours.openingHoursText != null) ...[
            const SizedBox(height: AppSpacing.sm),
            HelpText(l10n.chargingHoursAsPublished(hours.openingHoursText!), icon: Icons.notes),
          ],
          if (hours.timezone != null) ...[
            const SizedBox(height: AppSpacing.sm),
            HelpText(l10n.chargingHoursTimezoneNote(hours.timezone!), icon: Icons.public),
          ],
        ],
      ),
    );
  }
}

class _DayRow extends StatelessWidget {
  const _DayRow({required this.day, required this.isToday});

  final DaySchedule day;
  final bool isToday;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final w = day.windows;
    final value = w == null
        ? l10n.chargingDayUnknown
        : w.isEmpty
        ? l10n.chargingDayClosed
        : w.map((x) => '${x.start}–${x.end}').join('، ');
    final style = isToday
        ? theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700, color: theme.colorScheme.primary)
        : theme.textTheme.bodyMedium;
    return Semantics(
      label: '${weekdayLabel(l10n, day.day)}${isToday ? ' (${l10n.chargingToday})' : ''}: $value',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                isToday ? '${weekdayLabel(l10n, day.day)} · ${l10n.chargingToday}' : weekdayLabel(l10n, day.day),
                style: style,
              ),
            ),
            Flexible(
              child: Text(value, style: style, textAlign: TextAlign.end, textDirection: w == null || w.isEmpty ? null : TextDirection.ltr),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

class TariffsSection extends StatelessWidget {
  const TariffsSection({super.key, required this.station});

  final StationDetail station;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = station;
    return DetailSection(
      title: l10n.chargingPricesSection,
      icon: Icons.payments_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (s.tariffs.isEmpty && s.usageCostText == null) Text(l10n.chargingPriceNotAvailable),
          for (final t in s.tariffs) _TariffCard(tariff: t, connectors: s.allConnectors),
          if (s.usageCostText != null) ...[
            if (s.tariffs.isNotEmpty) const SizedBox(height: AppSpacing.md),
            Text(l10n.chargingUsageCostTitle, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: AppSpacing.xxs),
            Text(s.usageCostText!),
            const SizedBox(height: AppSpacing.xxs),
            HelpText(l10n.chargingUsageCostNote, icon: Icons.info_outline),
          ],
        ],
      ),
    );
  }
}

class _TariffCard extends StatelessWidget {
  const _TariffCard({required this.tariff, required this.connectors});

  final Tariff tariff;
  final List<StationConnector> connectors;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final t = tariff;
    final reliability = Reliability.fromApi(t.reliability);
    final appliesTo = t.connectorId == null
        ? null
        : connectors.where((c) => c.id == t.connectorId).map((c) => c.typeName).firstOrNull;
    final tax = switch (t.taxIncluded) {
      true => t.taxPercent == null ? l10n.chargingTaxIncluded : l10n.chargingTaxIncludedPct(fmt.number(t.taxPercent)!),
      false => t.taxPercent == null ? l10n.chargingTaxExcluded : l10n.chargingTaxExcludedPct(fmt.number(t.taxPercent)!),
      null => l10n.chargingTaxUnknown,
    };
    final validity = [
      if (t.validFrom != null) l10n.chargingValidFrom(fmt.date(t.validFrom)!),
      if (t.validTo != null) l10n.chargingValidTo(fmt.date(t.validTo)!),
    ].join(' · ');

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        border: Border.all(color: theme.colorScheme.outlineVariant),
        borderRadius: const BorderRadius.all(Radius.circular(AppRadii.md)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(t.name ?? l10n.chargingTariffUnnamed, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
              if (t.isDemo) const DemoBadge(dense: true),
              if (!t.isCurrent) Pill(label: l10n.chargingTariffNotCurrent, icon: Icons.history, dense: true, tone: AppTone.warning),
              if (reliability != null) ReliabilityBadge(reliability: reliability, dense: true),
            ],
          ),
          if (appliesTo != null) HelpText(l10n.chargingTariffAppliesTo(appliesTo)),
          const SizedBox(height: AppSpacing.sm),
          for (final e in t.elements) _ElementRow(element: e),
          const SizedBox(height: AppSpacing.xs),
          HelpText(tax, icon: Icons.receipt_long_outlined),
          if (validity.isNotEmpty) HelpText(validity, icon: Icons.event_outlined),
          if (t.notes != null) Padding(padding: const EdgeInsets.only(top: AppSpacing.xs), child: HelpText(t.notes!)),
          const SizedBox(height: AppSpacing.xs),
          SourceBadge(
            sourceName: t.source == null ? null : [t.source!.title, ?t.source!.publisher].join(' — '),
            verifiedAt: t.verifiedAt,
            dense: true,
            onTap: t.source?.url == null ? null : () => openExternalUrl(context, t.source!.url!),
          ),
        ],
      ),
    );
  }
}

class _ElementRow extends StatelessWidget {
  const _ElementRow({required this.element});

  final TariffElement element;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final e = element;
    final price = fmt.money(e.price?.amount, e.price?.currency);
    final conditions = [
      if (e.graceMinutes != null) l10n.chargingGraceMinutes(fmt.number(e.graceMinutes)!),
      if (e.stepSize != null) l10n.chargingStepSize(fmt.number(e.stepSize)!),
      if (e.currentType != null) e.currentType!.apiValue,
      if (e.minPowerKw != null || e.maxPowerKw != null)
        l10n.chargingPowerRange(fmt.powerKw(e.minPowerKw) ?? '0', fmt.powerKw(e.maxPowerKw) ?? '∞'),
      if (e.startTime != null && e.endTime != null) '${e.startTime}–${e.endTime}',
      if (e.daysOfWeek.isNotEmpty) e.daysOfWeek.map((d) => isoWeekdayLabel(l10n, d)).join('، '),
    ];
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            spacing: AppSpacing.sm,
            children: [
              Text(e.componentLabel, style: theme.textTheme.bodyMedium),
              price == null
                  ? NotAvailableValue(style: theme.textTheme.bodyMedium)
                  : Text(
                      '$price ${e.unitLabel}',
                      style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
                    ),
            ],
          ),
          if (conditions.isNotEmpty) HelpText(conditions.join(' · ')),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Community (dated, not live)
// ---------------------------------------------------------------------------

class CommunitySection extends StatelessWidget {
  const CommunitySection({super.key, required this.community, required this.onCheckIn, required this.onReport});

  final StationCommunity community;
  final VoidCallback onCheckIn;
  final VoidCallback onReport;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final c = community;
    return DetailSection(
      title: l10n.chargingCommunitySection,
      icon: Icons.forum_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          HelpText(c.disclaimer ?? l10n.chargingCommunityDisclaimer, icon: Icons.info_outline),
          const SizedBox(height: AppSpacing.md),
          StatTileRow(
            tiles: [
              StatTile(
                label: l10n.chargingCheckins30d,
                value: fmt.number(c.checkinsLast30Days),
                icon: Icons.how_to_reg_outlined,
                dense: true,
              ),
              StatTile(
                label: l10n.chargingSuccessRate,
                value: c.successRate30d == null ? null : fmt.percent(c.successRate30d! * 100),
                icon: Icons.task_alt,
                dense: true,
              ),
              StatTile(
                label: l10n.chargingOpenReports,
                value: fmt.number(c.openReports),
                icon: Icons.flag_outlined,
                tone: c.openReports > 0 ? AppTone.warning : AppTone.brand,
                dense: true,
              ),
            ],
          ),
          if (c.successRate30d == null && c.checkinsLast30Days > 0)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: HelpText(l10n.chargingSuccessRateNeedsMore),
            ),
          if (c.recentCheckins.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Text(l10n.chargingRecentCheckins, style: theme.textTheme.titleSmall),
            for (final x in c.recentCheckins) _CheckinRow(checkin: x),
          ],
          if (c.recentReports.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Text(l10n.chargingRecentReports, style: theme.textTheme.titleSmall),
            for (final r in c.recentReports)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                child: Row(
                  children: [
                    const Icon(Icons.flag_outlined, size: 18),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(child: Text(r.typeLabel)),
                    Flexible(
                      child: Text(
                        '${reportStatusLabel(l10n, r.status)} · ${fmt.date(r.createdAt)}',
                        style: theme.textTheme.bodySmall,
                        textAlign: TextAlign.end,
                      ),
                    ),
                  ],
                ),
              ),
          ],
          if (c.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.md),
              child: Text(l10n.chargingCommunityEmpty, style: theme.textTheme.bodyMedium),
            ),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              SecondaryButton(label: l10n.chargingCheckInTitle, icon: Icons.how_to_reg_outlined, onPressed: onCheckIn),
              SecondaryButton(label: l10n.chargingReportTitle, icon: Icons.flag_outlined, onPressed: onReport),
            ],
          ),
        ],
      ),
    );
  }
}

class _CheckinRow extends StatelessWidget {
  const _CheckinRow({required this.checkin});

  final CommunityCheckin checkin;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final x = checkin;
    final ok = x.outcome == 'charged_successfully' || x.outcome == 'waited_then_charged';
    final meta = [
      ?x.connectorName,
      if (x.observedPowerKw != null) l10n.chargingObservedPower(fmt.powerKw(x.observedPowerKw)!),
      if (x.waitMinutes != null) l10n.chargingWaited(fmt.durationMinutes(x.waitMinutes)!),
      ?x.vehicleName,
    ];
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(ok ? Icons.check_circle_outline : Icons.cancel_outlined, size: 20, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(x.outcomeLabel, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                // Always dated: community data is never "now".
                Text(fmt.dateTime(x.createdAt)!, style: theme.textTheme.bodySmall),
                if (meta.isNotEmpty) HelpText(meta.join(' · ')),
                if (x.comment != null) Text(x.comment!, style: theme.textTheme.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Source & licence
// ---------------------------------------------------------------------------

class SourceSection extends StatelessWidget {
  const SourceSection({super.key, required this.station, required this.fetchedAt});

  final StationDetail station;
  final DateTime fetchedAt;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final src = station.source;
    return DetailSection(
      title: l10n.chargingSourceSection,
      icon: Icons.verified_user_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InfoRow(label: l10n.chargingDataSource, value: dataSourceLabel(l10n, src.dataSource)),
          if (src.attribution != null) InfoRow(label: l10n.chargingAttribution, value: src.attribution),
          InfoRow(label: l10n.chargingLicense, value: src.license),
          InfoRow(label: l10n.chargingLastVerified, value: fmt.date(src.lastVerifiedAt)),
          if (src.sourceUpdatedAt != null) InfoRow(label: l10n.chargingSourceUpdated, value: fmt.date(src.sourceUpdatedAt)),
          const SizedBox(height: AppSpacing.xs),
          LastUpdatedText(time: src.lastUpdated ?? station.updatedAt, staleAfter: const Duration(days: 365)),
          for (final p in src.providers) ...[
            const Divider(height: AppSpacing.xl),
            Text(p.displayName ?? p.provider, style: theme.textTheme.titleSmall),
            if (p.attribution != null && p.attribution != src.attribution) HelpText(p.attribution!),
            if (p.license != null)
              InfoRow(
                label: l10n.chargingLicense,
                value: p.license,
                onTap: p.licenseUrl == null ? null : () => openExternalUrl(context, p.licenseUrl!),
              ),
            if (p.lastSyncedAt != null) InfoRow(label: l10n.chargingLastSynced, value: fmt.dateTime(p.lastSyncedAt)),
            if (p.sourceUrl != null)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  onPressed: () => openExternalUrl(context, p.sourceUrl!),
                  icon: const Icon(Icons.open_in_new, size: 18),
                  label: Text(l10n.chargingOpenSource),
                ),
              ),
          ],
          const SizedBox(height: AppSpacing.sm),
          HelpText(l10n.chargingFetchedAt(fmt.dateTime(fetchedAt)!), icon: Icons.sync),
        ],
      ),
    );
  }
}
