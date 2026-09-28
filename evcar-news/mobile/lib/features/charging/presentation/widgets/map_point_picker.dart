import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/app_config/app_config_controller.dart';
import '../../../../shared/widgets/kit.dart';
import '../../domain/station_query.dart';
import 'stations_map.dart';

/// Opens a full-screen map with a fixed centre pin; returns the chosen
/// point, or null. Requires a configured map (callers check
/// `MapConfig.isUsable`).
Future<GeoPoint?> pickPointOnMap(BuildContext context, {required GeoPoint initial, required String title, required String confirmLabel}) {
  return Navigator.of(context).push<GeoPoint>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => _MapPointPickerPage(initial: initial, title: title, confirmLabel: confirmLabel),
    ),
  );
}

class _MapPointPickerPage extends ConsumerStatefulWidget {
  const _MapPointPickerPage({required this.initial, required this.title, required this.confirmLabel});

  final GeoPoint initial;
  final String title;
  final String confirmLabel;

  @override
  ConsumerState<_MapPointPickerPage> createState() => _MapPointPickerPageState();
}

class _MapPointPickerPageState extends ConsumerState<_MapPointPickerPage> {
  final _controller = MapController();
  late GeoPoint _center = widget.initial;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final config = ref.watch(appConfigProvider.select((c) => c.map));
    final tileFactory = ref.watch(chargingTileProviderProvider);
    final fmt = AppFormatters.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Stack(
        children: [
          Positioned.fill(
            child: FlutterMap(
              mapController: _controller,
              options: MapOptions(
                initialCenter: latLngOf(widget.initial),
                initialZoom: 13,
                maxZoom: config.maxZoom.clamp(3, 22).toDouble(),
                interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
                onPositionChanged: (camera, _) =>
                    setState(() => _center = GeoPoint(camera.center.latitude, camera.center.longitude)),
              ),
              children: [
                TileLayer(
                  urlTemplate: config.tileUrlTemplate,
                  userAgentPackageName: 'news.evcar.app',
                  tileProvider: tileFactory?.call(),
                ),
                if ((config.attribution ?? '').isNotEmpty)
                  Align(
                    alignment: AlignmentDirectional.bottomStart,
                    child: Container(
                      margin: const EdgeInsets.all(AppSpacing.sm),
                      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xxs),
                      color: theme.colorScheme.surface.withValues(alpha: 0.85),
                      child: Text(config.attribution!, style: theme.textTheme.labelSmall, textDirection: TextDirection.ltr),
                    ),
                  ),
              ],
            ),
          ),
          IgnorePointer(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.only(bottom: 40),
                child: Icon(Icons.location_on, size: 48, color: theme.colorScheme.primary, semanticLabel: l10n.chargingPlaceMarker),
              ),
            ),
          ),
          PositionedDirectional(
            start: AppSpacing.lg,
            end: AppSpacing.lg,
            bottom: AppSpacing.lg,
            child: SafeArea(
              top: false,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      child: Text(
                        l10n.chargingPickPointHint(
                          fmt.number(_center.lat, maxDecimals: 5)!,
                          fmt.number(_center.lng, maxDecimals: 5)!,
                        ),
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  PrimaryButton(
                    label: widget.confirmLabel,
                    icon: Icons.check,
                    expand: true,
                    onPressed: () => Navigator.of(context).pop(_center),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
