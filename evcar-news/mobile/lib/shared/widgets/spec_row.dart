import 'package:flutter/material.dart';

import '../../app/theme/app_palette.dart';
import '../../app/theme/app_tokens.dart';
import '../../core/l10n/l10n.dart';
import 'badges.dart';
import 'not_available_value.dart';
import 'reliability_badge.dart';
import 'source_badge.dart';

/// Where a spec value came from (`sourceId` → name, `verifiedAt`).
@immutable
class SpecSource {
  const SpecSource({this.name, this.verifiedAt, this.onTap});

  final String? name;
  final DateTime? verifiedAt;

  /// Opens the source (e.g. its URL) — optional.
  final VoidCallback? onTap;
}

/// Range measurement cycles (never converted into one another).
enum RangeCycle {
  wltp('WLTP'),
  epa('EPA'),
  cltc('CLTC'),
  nedc('NEDC'),
  other('OTHER');

  const RangeCycle(this.apiValue);

  final String apiValue;

  static RangeCycle? fromApi(String? value) {
    final v = value?.toUpperCase();
    for (final c in values) {
      if (c.apiValue == v) return c;
    }
    return null;
  }

  /// "WLTP" … or the localized "Other cycle".
  String label(AppLocalizations l10n) => this == RangeCycle.other ? l10n.commonRangeCycleOther : apiValue;
}

/// One specification line: label, value (or "Not available"), measurement
/// qualifier (cycle, SoC window, charger power…), reliability and source.
///
/// Missing values are `null` and render as "غير متوفر" — never 0
/// (REQUIREMENTS §6). Label and value sit side by side, and stack when the
/// row gets narrow or the text is enlarged.
///
/// ```dart
/// SpecRow(
///   label: l10n.carsSpecRange,
///   value: fmt.distanceKm(range.km),
///   qualifier: RangeCycle.fromApi(range.cycle)?.label(l10n),
///   reliability: Reliability.fromApi(range.reliability),
///   source: SpecSource(name: range.source?.name, verifiedAt: range.verifiedAt),
/// )
/// ```
class SpecRow extends StatelessWidget {
  const SpecRow({
    super.key,
    required this.label,
    required this.value,
    this.qualifier,
    this.note,
    this.reliability,
    this.source,
    this.icon,
    this.highlight = false,
    this.showSource = true,
  });

  final String label;

  /// Formatted value including its unit; null = not available.
  final String? value;

  /// Short condition next to the value ("WLTP", "10–80%").
  final String? qualifier;

  /// Longer explanation under the row ("On a 150 kW charger").
  final String? note;
  final Reliability? reliability;
  final SpecSource? source;
  final IconData? icon;

  /// Emphasises the value (e.g. the better value in a comparison — always
  /// together with a text/icon cue from the caller, never colour alone).
  final bool highlight;
  final bool showSource;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n;
    final v = value?.trim();
    final has = v != null && v.isNotEmpty;
    final labelStyle = theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final valueStyle = theme.textTheme.bodyLarge?.copyWith(
      fontWeight: highlight ? FontWeight.w700 : FontWeight.w600,
      color: highlight ? theme.colorScheme.primary : theme.colorScheme.onSurface,
    );

    final valueWidget = Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 6,
      runSpacing: 4,
      children: [
        if (has) Text(v, style: valueStyle) else NotAvailableValue(style: valueStyle),
        if (has && qualifier != null && qualifier!.trim().isNotEmpty)
          Pill(label: qualifier!, tone: AppTone.info, dense: true),
      ],
    );

    final labelWidget = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 18, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: AppSpacing.sm),
        ],
        Flexible(child: Text(label, style: labelStyle)),
      ],
    );

    final meta = <Widget>[
      if (has && reliability != null) ReliabilityBadge(reliability: reliability!, dense: true),
      if (has && showSource && source != null)
        SourceBadge(sourceName: source!.name, verifiedAt: source!.verifiedAt, onTap: source!.onTap, dense: true),
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm + 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            container: true,
            label: [
              label,
              has ? v : l10n.commonNotAvailable,
              if (has && qualifier != null && qualifier!.trim().isNotEmpty) qualifier!,
            ].join(', '),
            excludeSemantics: true,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final stacked = constraints.maxWidth < 320 || context.textScale > 1.4;
                if (stacked) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [labelWidget, const SizedBox(height: 2), valueWidget],
                  );
                }
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(flex: 5, child: labelWidget),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      flex: 6,
                      child: Align(alignment: AlignmentDirectional.centerEnd, child: valueWidget),
                    ),
                  ],
                );
              },
            ),
          ),
          if (note != null && note!.trim().isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(note!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ],
          if (meta.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            Wrap(spacing: AppSpacing.sm, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: meta),
          ],
        ],
      ),
    );
  }
}

/// Titled card of [SpecRow]s ("Battery & charging", "Dimensions"…),
/// optionally collapsible.
class SpecGroup extends StatefulWidget {
  const SpecGroup({
    super.key,
    required this.title,
    required this.rows,
    this.icon,
    this.collapsible = false,
    this.initiallyExpanded = true,
    this.footer,
  });

  final String title;
  final List<Widget> rows;
  final IconData? icon;
  final bool collapsible;
  final bool initiallyExpanded;

  /// Under the rows (e.g. a `LastUpdatedText`).
  final Widget? footer;

  @override
  State<SpecGroup> createState() => _SpecGroupState();
}

class _SpecGroupState extends State<SpecGroup> {
  late bool _expanded = widget.initiallyExpanded || !widget.collapsible;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n;
    final palette = context.palette;
    final header = Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.lg, AppSpacing.md, AppSpacing.sm, AppSpacing.md),
      child: Row(
        children: [
          if (widget.icon != null) ...[
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: palette.tone(AppTone.brand).container,
                borderRadius: BorderRadius.circular(AppRadii.sm),
              ),
              child: Icon(widget.icon, size: 18, color: palette.tone(AppTone.brand).onContainer),
            ),
            const SizedBox(width: AppSpacing.md),
          ],
          Expanded(
            child: Semantics(
              header: true,
              child: Text(widget.title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            ),
          ),
          if (widget.collapsible)
            ExcludeSemantics(
              child: AnimatedRotation(
                turns: _expanded ? 0.5 : 0,
                duration: AppMotion.of(context, AppMotion.fast),
                child: Icon(Icons.expand_more, color: theme.colorScheme.onSurfaceVariant),
              ),
            ),
        ],
      ),
    );

    final rows = <Widget>[];
    for (var i = 0; i < widget.rows.length; i++) {
      if (i > 0) rows.add(Divider(height: 1, color: theme.colorScheme.outlineVariant.withValues(alpha: 0.6)));
      rows.add(widget.rows[i]);
    }

    return DecoratedBox(
      decoration: BoxDecoration(borderRadius: AppRadii.card, boxShadow: palette.cardShadow),
      child: Material(
        color: theme.colorScheme.surface,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.card,
          side: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.7)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (widget.collapsible)
              Semantics(
                button: true,
                expanded: _expanded,
                hint: _expanded ? l10n.commonClose : l10n.commonMore,
                child: InkWell(onTap: () => setState(() => _expanded = !_expanded), child: header),
              )
            else
              header,
            AnimatedSize(
              duration: AppMotion.of(context, AppMotion.medium),
              curve: AppMotion.standard,
              alignment: AlignmentDirectional.topCenter,
              child: _expanded
                  ? Padding(
                      padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.sm),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          ...rows,
                          if (widget.footer != null) ...[const SizedBox(height: AppSpacing.sm), widget.footer!],
                        ],
                      ),
                    )
                  : const SizedBox(width: double.infinity),
            ),
          ],
        ),
      ),
    );
  }
}
