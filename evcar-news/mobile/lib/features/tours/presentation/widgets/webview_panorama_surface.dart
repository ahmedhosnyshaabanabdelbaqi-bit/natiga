import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../application/panorama_surface.dart';
import '../../domain/tour_models.dart';
import '../../domain/viewer_protocol.dart';

/// Bundled viewer page (Pannellum + bridge), see `assets/panorama/`.
const kViewerAsset = 'assets/panorama/viewer.html';

/// Whether a WebView navigation to [url] is allowed: only the bundled viewer
/// page itself (file URL ending in `flutter_assets/assets/panorama/viewer.html`,
/// no query / fragment). Everything else — links, redirects, `javascript:`,
/// `data:`, remote pages — is blocked.
bool isAllowedViewerNavigation(String url) {
  final uri = Uri.tryParse(url);
  if (uri == null || uri.scheme != 'file') return false;
  if (uri.hasQuery || uri.hasFragment) return false;
  return uri.path.endsWith('/flutter_assets/$kViewerAsset');
}

/// Isolated WebView running the bundled viewer (Android / iOS only).
class WebViewPanoramaSurface implements PanoramaSurface {
  WebViewPanoramaSurface({required this.tour, required this.onEvent}) {
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF05070D))
      ..enableZoom(false)
      ..setVerticalScrollBarEnabled(false)
      ..setHorizontalScrollBarEnabled(false)
      ..addJavaScriptChannel(kViewerChannelName, onMessageReceived: _onMessage)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) =>
              isAllowedViewerNavigation(request.url) ? NavigationDecision.navigate : NavigationDecision.prevent,
          onWebResourceError: (error) {
            // Only a failure of the viewer page itself is fatal; tile
            // errors are handled inside the page (fallback to renditions).
            if (error.isForMainFrame ?? false) onEvent(const ViewerError(ViewerErrorCode.loadFailed));
          },
        ),
      )
      ..loadFlutterAsset(kViewerAsset);
  }

  final TourDetail tour;
  final void Function(ViewerEvent event) onEvent;
  late final WebViewController _controller;
  bool _disposed = false;

  void _onMessage(JavaScriptMessage message) {
    if (_disposed) return;
    final event = parseViewerEvent(message.message, tour: tour);
    if (event == null) {
      if (kDebugMode) debugPrint('360 viewer: ignored message');
      return;
    }
    onEvent(event);
  }

  @override
  Widget build(BuildContext context) => WebViewWidget(controller: _controller);

  @override
  Future<void> send(ViewerCommand command) async {
    if (_disposed) return;
    await _controller.runJavaScript(jsReceiveCall(command));
  }

  @override
  Future<void> reload() => _controller.reload();

  @override
  void dispose() {
    if (_disposed) return;
    unawaited(send(ViewerCommand.destroy()).catchError((Object _) {}));
    _disposed = true;
  }
}

PanoramaSurface _webViewSurface({required TourDetail tour, required void Function(ViewerEvent event) onEvent}) =>
    WebViewPanoramaSurface(tour: tour, onEvent: onEvent);

/// How the viewer screen creates its panorama view (tests override it).
final panoramaSurfaceFactoryProvider = Provider<PanoramaSurfaceFactory>((ref) => _webViewSurface);
