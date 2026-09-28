import 'package:flutter/widgets.dart';

import '../domain/tour_models.dart';
import '../domain/viewer_protocol.dart';

/// The isolated view that renders panoramas (a WebView on Android/iOS).
///
/// Abstracted so the viewer logic ([TourViewerController]) and screens can
/// be tested without a WebView (webview_flutter cannot run in `flutter
/// test`); the real implementation lives in
/// `presentation/widgets/webview_panorama_surface.dart`.
abstract class PanoramaSurface {
  /// The platform view.
  Widget build(BuildContext context);

  /// Delivers one command (in call order).
  Future<void> send(ViewerCommand command);

  /// Reloads the viewer page (after a failure); a new `ready` follows.
  Future<void> reload();

  void dispose();
}

/// Creates a surface for [tour]; [onEvent] receives validated events only.
typedef PanoramaSurfaceFactory = PanoramaSurface Function({required TourDetail tour, required void Function(ViewerEvent event) onEvent});
