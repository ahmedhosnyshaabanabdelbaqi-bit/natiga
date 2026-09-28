import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_map_marker_cluster/flutter_map_marker_cluster.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../../../core/app_config/app_config.dart';
import '../../../../shared/widgets/kit.dart';
import '../../domain/station_models.dart';
import '../../domain/station_query.dart';

/// Tile provider factory; tests override it with an offline provider.
/// `null` = the default network provider of flutter_map.
final chargingTileProviderProvider = Provider<TileProvider Function()?>((ref) => null);

LatLng latLngOf(GeoPoint p) => LatLng(p.lat, p.lng);

GeoBounds boundsOf(LatLngBounds b) => GeoBounds(south: b.south, west: b.west, north: b.north, east: b.east);

/// The stations map: tiles + attribution from `/app-config`, station pins
/// with client-side clustering (or server clusters when zoomed out /
/// truncated), the reference place, long-press to pick a point.
class StationsMap extends ConsumerWidget {
  const StationsMap({
    super.key,
    required this.controller,
    required this.config,
    required this.initialCenter,
    required this.stations,
    required this.onStationTap,
    this.clusters,
    this.place,
    this.selectedId,
    this.initialZoom = 11,
    this.onLongPress,
    this.onCameraMoved,
    this.onClusterTap,
    this.bottomPadding = 0,
  });

  final MapController controller;
  final MapConfig config;
  final GeoPoint initialCenter;
  final double initialZoom;
  final List<StationListItem> stations;

  /// Server clusters (zoomed out / truncated); when set, pins are not drawn.
  final List<StationCluster>? clusters;
  final SearchPlace? place;
  final String? selectedId;
  final ValueChanged<String> onStationTap;
  final ValueChanged<GeoPoint>? onLongPress;

  /// Called after a user gesture moved the camera.
  final void Function(MapCamera camera)? onCameraMoved;
  final ValueChanged<StationCluster>? onClusterTap;

  /// Space covered by overlays at the bottom (attribution stays visible).
  final double bottomPadding;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final tileFactory = ref.watch(chargingTileProviderProvider);
    final maxZoom = config.maxZoom.clamp(3, 22).toDouble();
    final markers = [
      for (final s in stations)
        Marker(
          key: ValueKey('station-${s.id}'),
          point: LatLng(s.latitude, s.longitude),
          width: s.id == selectedId ? 56 : 44,
          height: s.id == selectedId ? 56 : 44,
          child: _StationPin(station: s, selected: s.id == selectedId, onTap: () => onStationTap(s.id)),
        ),
    ];
    final serverClusters = clusters;

    return Semantics(
      label: l10n.chargingMapSemantics(stations.length),
      container: true,
      child: FlutterMap(
        mapController: controller,
        options: MapOptions(
          initialCenter: latLngOf(initialCenter),
          initialZoom: initialZoom,
          minZoom: 3,
          maxZoom: maxZoom,
          backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
          interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
          onLongPress: onLongPress == null ? null : (_, p) => onLongPress!(GeoPoint(p.latitude, p.longitude)),
          onPositionChanged: (camera, hasGesture) {
            if (hasGesture) onCameraMoved?.call(camera);
          },
        ),
        children: [
          TileLayer(
            urlTemplate: config.tileUrlTemplate,
            userAgentPackageName: 'news.evcar.app',
            maxZoom: maxZoom,
            tileProvider: tileFactory?.call(),
          ),
          if (serverClusters != null)
            MarkerLayer(
              markers: [
                for (final c in serverClusters)
                  Marker(
                    point: LatLng(c.latitude, c.longitude),
                    width: 56,
                    height: 56,
                    child: _ClusterBubble(
                      count: c.count,
                      onTap: onClusterTap == null ? null : () => onClusterTap!(c),
                    ),
                  ),
              ],
            )
          else
            MarkerClusterLayerWidget(
              options: MarkerClusterLayerOptions(
                markers: markers,
                maxClusterRadius: 60,
                size: const Size(52, 52),
                maxZoom: maxZoom,
                disableClusteringAtZoom: 15,
                showPolygon: false,
                spiderfyCluster: true,
                animationsOptions: AppMotion.enabled(context)
                    ? const AnimationsOptions()
                    : const AnimationsOptions(
                        zoom: Duration.zero,
                        fitBound: Duration.zero,
                        centerMarker: Duration.zero,
                        spiderfy: Duration.zero,
                      ),
                builder: (context, clustered) => _ClusterBubble(count: clustered.length),
              ),
            ),
          if (place != null)
            MarkerLayer(
              markers: [
                Marker(
                  point: latLngOf(place!.point),
                  width: 40,
                  height: 40,
                  child: _PlaceMarker(device: place!.kind == PlaceKind.device),
                ),
              ],
            ),
          _Attribution(text: config.attribution, bottomPadding: bottomPadding),
        ],
      ),
    );
  }
}

class _StationPin extends StatelessWidget {
  const _StationPin({required this.station, required this.selected, required this.onTap});

  final StationListItem station;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final scheme = Theme.of(context).colorScheme;
    final dc = station.currentTypes.contains(CurrentType.dc);
    final tone = palette.tone(station.isDemo ? AppTone.demo : (dc ? AppTone.brand : AppTone.info));
    final closed = station.operationalStatus != OperationalStatus.operational;
    return Semantics(
      button: true,
      selected: selected,
      label: station.name,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: AppMotion.of(context, AppMotion.fast),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: selected ? scheme.primary : tone.container,
            border: Border.all(color: selected ? scheme.onPrimary : tone.border, width: selected ? 3 : 2),
            boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 6, offset: Offset(0, 2))],
          ),
          child: Center(
            child: Icon(
              // Shape, not just colour: bolt = DC fast, plug = AC, slash = not operational.
              closed ? Icons.power_off_outlined : (dc ? Icons.bolt : Icons.power_outlined),
              size: selected ? 28 : 22,
              color: selected ? scheme.onPrimary : tone.onContainer,
            ),
          ),
        ),
      ),
    );
  }
}

class _ClusterBubble extends StatelessWidget {
  const _ClusterBubble({required this.count, this.onTap});

  final int count;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final fmt = AppFormatters.of(context);
    return Semantics(
      button: onTap != null,
      label: context.l10n.chargingClusterSemantics(count),
      child: GestureDetector(
        onTap: onTap,
        child: DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: palette.brandGradient,
            border: Border.all(color: Colors.white, width: 3),
            boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 8, offset: Offset(0, 2))],
          ),
          child: Center(
            child: ExcludeSemantics(
              child: FittedBox(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.xs),
                  child: Text(
                    fmt.number(count) ?? '$count',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PlaceMarker extends StatelessWidget {
  const _PlaceMarker({required this.device});

  final bool device;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l10n = context.l10n;
    if (!device) {
      return Semantics(
        label: l10n.chargingPlaceMarker,
        child: Icon(Icons.place, color: scheme.tertiary, size: 36),
      );
    }
    return Semantics(
      label: l10n.chargingPlaceNearYou,
      child: Center(
        child: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(shape: BoxShape.circle, color: scheme.primary.withValues(alpha: 0.18)),
          child: Center(
            child: Container(
              width: 16,
              height: 16,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: scheme.primary,
                border: Border.all(color: Colors.white, width: 3),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Always-visible tile attribution (OSM and most providers require it).
class _Attribution extends StatelessWidget {
  const _Attribution({required this.text, required this.bottomPadding});

  final String? text;
  final double bottomPadding;

  @override
  Widget build(BuildContext context) {
    final t = text?.trim();
    if (t == null || t.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    return Align(
      alignment: AlignmentDirectional.bottomStart,
      child: Padding(
        padding: EdgeInsetsDirectional.only(start: AppSpacing.sm, bottom: bottomPadding + AppSpacing.xs),
        child: Container(
          constraints: const BoxConstraints(maxWidth: 280),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xxs),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface.withValues(alpha: 0.85),
            borderRadius: const BorderRadius.all(Radius.circular(AppRadii.xs)),
          ),
          child: Text(
            t,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.labelSmall,
            textDirection: TextDirection.ltr,
          ),
        ),
      ),
    );
  }
}
