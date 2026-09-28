import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

/// An external navigation app the user can pick for directions.
enum NavigationApp { systemChooser, googleMaps, appleMaps, waze, webMap }

/// One option of the directions sheet.
@immutable
class DirectionsOption {
  const DirectionsOption(this.app, this.uri, {this.fallback});

  final NavigationApp app;
  final Uri uri;

  /// Tried when [uri] cannot be opened (app not installed).
  final Uri? fallback;
}

String _c(double v) => v.toStringAsFixed(6);

/// Directions options for a destination, per platform. The app never
/// computes a route itself; it hands the coordinates to a navigation app.
List<DirectionsOption> directionsOptions({
  required double lat,
  required double lng,
  String? label,
  required TargetPlatform platform,
  bool webPreview = false,
}) {
  final ll = '${_c(lat)},${_c(lng)}';
  final googleWeb = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$ll&travelmode=driving');
  final waze = Uri.parse('https://waze.com/ul?ll=$ll&navigate=yes');
  if (webPreview) return [DirectionsOption(NavigationApp.webMap, googleWeb)];
  final name = (label ?? '').replaceAll(RegExp(r'[()]'), ' ').trim();
  if (platform == TargetPlatform.iOS) {
    return [
      DirectionsOption(NavigationApp.appleMaps, Uri.parse('https://maps.apple.com/?daddr=$ll&dirflg=d')),
      DirectionsOption(
        NavigationApp.googleMaps,
        Uri.parse('comgooglemaps://?daddr=$ll&directionsmode=driving'),
        fallback: googleWeb,
      ),
      DirectionsOption(NavigationApp.waze, waze),
    ];
  }
  return [
    // geo: lets Android show every installed navigation app.
    DirectionsOption(
      NavigationApp.systemChooser,
      Uri.parse('geo:$ll?q=$ll${name.isEmpty ? '' : '(${Uri.encodeComponent(name)})'}'),
    ),
    DirectionsOption(NavigationApp.googleMaps, Uri.parse('google.navigation:q=$ll&mode=d'), fallback: googleWeb),
    DirectionsOption(NavigationApp.waze, waze),
  ];
}

/// Opens a URI in another app. Overridable in tests.
typedef ExternalUriLauncher = Future<bool> Function(Uri uri);

Future<bool> _launch(Uri uri) async {
  try {
    return await launchUrl(uri, mode: LaunchMode.externalApplication);
  } on Object {
    return false;
  }
}

final externalUriLauncherProvider = Provider<ExternalUriLauncher>((ref) => _launch);

/// Opens [option] (then its fallback). Returns whether something opened.
Future<bool> openDirections(ExternalUriLauncher launch, DirectionsOption option) async {
  if (await launch(option.uri)) return true;
  final fb = option.fallback;
  return fb != null && await launch(fb);
}
