import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'tour_models.dart';

/// Strict JSON message protocol between the app and the isolated 360°
/// viewer (`assets/panorama/viewer.js`), version [kViewerProtocolVersion].
///
/// * App → viewer: [ViewerCommand]s are JSON-encoded and passed as ONE
///   string literal to `window.evcarViewer.receive(...)` ([jsReceiveCall]) —
///   never interpolated as code.
/// * Viewer → app: JSON strings posted on the `EvcarBridge`
///   JavaScriptChannel, parsed by [parseViewerEvent]. Anything that is not a
///   known, well-formed message is ignored (returns null).
///
/// Panorama pixels never come from the network inside the WebView for
/// single-image panoramas: the app downloads them (size-capped disk cache),
/// checks the file signature and streams the bytes in base64 chunks
/// ([imageChunkCommands]); the viewer turns them into a `blob:` URL. Only
/// multires tiles are fetched by the WebView, from [TourDetail.mediaOrigin].
const kViewerProtocolVersion = 2;

/// Name of the JavaScriptChannel.
const kViewerChannelName = 'EvcarBridge';

/// Largest raw message accepted from the viewer.
const kMaxViewerMessageLength = 2048;

/// Largest panorama file streamed into the viewer.
const kMaxPanoramaBytes = 40 * 1024 * 1024;

/// Raw bytes per chunk (≈ 256 KiB of base64 per `runJavaScript` call).
const kImageChunkBytes = 192 * 1024;

final _idRe = RegExp(r'^[A-Za-z0-9_-]{1,64}$');

bool isViewerId(Object? v) => v is String && _idRe.hasMatch(v);

enum PanoramaQuality {
  preview,
  full,
  multires;

  static PanoramaQuality? fromWire(Object? v) => switch (v) {
    'preview' => PanoramaQuality.preview,
    'full' => PanoramaQuality.full,
    'multires' => PanoramaQuality.multires,
    _ => null,
  };
}

/// Error codes the viewer may report.
enum ViewerErrorCode {
  invalidMessage('INVALID_MESSAGE'),
  loadFailed('LOAD_FAILED'),
  webglUnsupported('WEBGL_UNSUPPORTED'),
  notInitialized('NOT_INITIALIZED'),
  imageRejected('IMAGE_REJECTED'),
  tooLarge('TOO_LARGE');

  const ViewerErrorCode(this.wire);

  final String wire;

  static ViewerErrorCode? fromWire(Object? v) {
    for (final c in values) {
      if (c.wire == v) return c;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Viewer → app
// ---------------------------------------------------------------------------

@immutable
sealed class ViewerEvent {
  const ViewerEvent();
}

/// Bridge loaded. [maxTextureSize] is WebGL's limit (null without WebGL).
class ViewerReady extends ViewerEvent {
  const ViewerReady({required this.webgl, this.maxTextureSize});

  final bool webgl;
  final int? maxTextureSize;
}

/// The viewer has no image for [sceneId] (after init / a scene switch).
class ViewerNeedsImages extends ViewerEvent {
  const ViewerNeedsImages(this.sceneId);

  final String sceneId;
}

/// [sceneId] is on screen at [quality].
class ViewerSceneShown extends ViewerEvent {
  const ViewerSceneShown(this.sceneId, this.quality);

  final String sceneId;
  final PanoramaQuality quality;
}

class ViewerHotspotTapped extends ViewerEvent {
  const ViewerHotspotTapped(this.sceneId, this.hotspotId);

  final String sceneId;
  final String hotspotId;
}

/// The tile set of [sceneId] could not be loaded (network / CORS).
class ViewerMultiresFailed extends ViewerEvent {
  const ViewerMultiresFailed(this.sceneId);

  final String sceneId;
}

class ViewerError extends ViewerEvent {
  const ViewerError(this.code, {this.sceneId, this.message});

  final ViewerErrorCode code;
  final String? sceneId;

  /// Diagnostic only (logs); never shown or interpreted as markup.
  final String? message;
}

/// Parses one message from the viewer. Returns null (ignored) unless it is
/// a known type with exactly the allowed keys and valid values; scene /
/// hotspot ids must belong to [tour] when given.
ViewerEvent? parseViewerEvent(String raw, {TourDetail? tour}) {
  if (raw.isEmpty || raw.length > kMaxViewerMessageLength) return null;
  Object? decoded;
  try {
    decoded = jsonDecode(raw);
  } on FormatException {
    return null;
  }
  if (decoded is! Map<String, dynamic>) return null;
  final m = decoded;
  final type = m['type'];
  if (type is! String) return null;

  bool onlyKeys(Set<String> allowed) => m.keys.every(allowed.contains);
  bool knownScene(Object? id) => isViewerId(id) && (tour == null || tour.scene(id! as String) != null);

  switch (type) {
    case 'ready':
      if (!onlyKeys({'type', 'v', 'webgl', 'maxTextureSize'})) return null;
      if (m['v'] != kViewerProtocolVersion || m['webgl'] is! bool) return null;
      final tex = m['maxTextureSize'];
      if (tex != null && (tex is! int || tex < 0 || tex > 65536)) return null;
      return ViewerReady(webgl: m['webgl'] as bool, maxTextureSize: tex as int?);
    case 'needImages':
      if (!onlyKeys({'type', 'sceneId'}) || !knownScene(m['sceneId'])) return null;
      return ViewerNeedsImages(m['sceneId'] as String);
    case 'sceneShown':
      if (!onlyKeys({'type', 'sceneId', 'quality'}) || !knownScene(m['sceneId'])) return null;
      final q = PanoramaQuality.fromWire(m['quality']);
      if (q == null) return null;
      return ViewerSceneShown(m['sceneId'] as String, q);
    case 'hotspot':
      if (!onlyKeys({'type', 'sceneId', 'hotspotId'}) || !knownScene(m['sceneId'])) return null;
      final hid = m['hotspotId'];
      if (!isViewerId(hid)) return null;
      if (tour != null && tour.scene(m['sceneId'] as String)?.hotspot(hid as String) == null) return null;
      return ViewerHotspotTapped(m['sceneId'] as String, hid as String);
    case 'multiresFailed':
      if (!onlyKeys({'type', 'sceneId'}) || !knownScene(m['sceneId'])) return null;
      return ViewerMultiresFailed(m['sceneId'] as String);
    case 'error':
      if (!onlyKeys({'type', 'code', 'sceneId', 'message'})) return null;
      final code = ViewerErrorCode.fromWire(m['code']);
      if (code == null) return null;
      final sid = m['sceneId'];
      if (sid != null && !knownScene(sid)) return null;
      final msg = m['message'];
      if (msg != null && (msg is! String || msg.length > 300)) return null;
      return ViewerError(code, sceneId: sid as String?, message: msg as String?);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// App → viewer
// ---------------------------------------------------------------------------

@immutable
class ViewerCommand {
  const ViewerCommand._(this.json);

  final Map<String, Object?> json;

  String get type => json['type']! as String;

  String encode() => jsonEncode(json);

  /// Starts the viewer for [tour]. Hotspot labels are plain text; the viewer
  /// renders them with `textContent` only.
  factory ViewerCommand.init({
    required TourDetail tour,
    required String locale,
    required ViewerStrings strings,
    required String firstSceneId,
    required bool allowInsecureMedia,
    Map<String, MultiresConfig> multires = const {},
  }) {
    return ViewerCommand._({
      'type': 'init',
      'v': kViewerProtocolVersion,
      'mediaOrigin': tour.mediaOrigin,
      'allowInsecure': allowInsecureMedia,
      'locale': locale == 'ar' ? 'ar' : 'en',
      'strings': strings.toJson(),
      'firstSceneId': firstSceneId,
      'scenes': [
        for (final s in tour.scenes)
          {
            'id': s.id,
            'title': _clip(s.title ?? s.positionLabel ?? '', 120),
            'view': {
              'yaw': s.view.yaw,
              'pitch': s.view.pitch,
              'hfov': s.view.hfov,
              'minHfov': s.view.minHfov,
              'maxHfov': s.view.maxHfov,
              'minPitch': s.view.minPitch,
              'maxPitch': s.view.maxPitch,
              'northOffset': s.view.northOffset,
            },
            'multires': multires[s.id]?.toJson(),
            'hotspots': [
              for (final h in s.hotspots.take(64))
                {
                  'id': h.id,
                  'kind': h.type == HotspotType.sceneLink ? 'scene' : 'info',
                  'icon': _iconClass(h),
                  'yaw': h.yaw,
                  'pitch': h.pitch,
                  'label': _clip(h.title, 120),
                },
            ],
          },
      ],
    });
  }

  /// Shows [sceneId]; optional target direction (scene links).
  factory ViewerCommand.show(String sceneId, {double? yaw, double? pitch}) =>
      ViewerCommand._({'type': 'show', 'sceneId': sceneId, 'yaw': yaw, 'pitch': pitch});

  factory ViewerCommand.useMultires(String sceneId) => ViewerCommand._({'type': 'useMultires', 'sceneId': sceneId});

  factory ViewerCommand.resetView() => const ViewerCommand._({'type': 'resetView'});

  /// Zoom in (`true`) or out by one step.
  factory ViewerCommand.zoom({required bool zoomIn}) =>
      ViewerCommand._({'type': 'zoom', 'direction': zoomIn ? 'in' : 'out'});

  /// Motion control: add [yawDelta] degrees, set [pitch] (degrees).
  factory ViewerCommand.look({required double yawDelta, required double pitch}) =>
      ViewerCommand._({'type': 'look', 'yawDelta': _round(yawDelta), 'pitch': _round(pitch)});

  factory ViewerCommand.pause() => const ViewerCommand._({'type': 'pause'});

  factory ViewerCommand.resume() => const ViewerCommand._({'type': 'resume'});

  factory ViewerCommand.destroy() => const ViewerCommand._({'type': 'destroy'});

  factory ViewerCommand._imageChunk({
    required String sceneId,
    required PanoramaQuality quality,
    required String mime,
    required int seq,
    required int total,
    required String data,
  }) => ViewerCommand._({
    'type': 'image',
    'sceneId': sceneId,
    'quality': quality.name,
    'mime': mime,
    'seq': seq,
    'total': total,
    'data': data,
  });

  static double _round(double v) => (v * 100).roundToDouble() / 100;

  static String _clip(String s, int max) => s.length <= max ? s : '${s.substring(0, max - 1)}…';

  static String _iconClass(Hotspot h) => switch (h.type) {
    HotspotType.sceneLink => 'scene',
    HotspotType.detailImage => 'image',
    HotspotType.video => 'video',
    HotspotType.specLink => 'spec',
    HotspotType.info => 'info',
  };
}

/// Localized strings used inside the viewer page (plain text).
@immutable
class ViewerStrings {
  const ViewerStrings({required this.loading, required this.loadFailed, required this.webglUnsupported});

  final String loading;
  final String loadFailed;
  final String webglUnsupported;

  Map<String, String> toJson() => {'loading': loading, 'loadFailed': loadFailed, 'webglUnsupported': webglUnsupported};
}

/// JavaScript that delivers [command] to the viewer: the JSON is embedded as
/// a JSON string literal (valid JS), with U+2028/U+2029 escaped.
String jsReceiveCall(ViewerCommand command) {
  final literal = jsonEncode(command.encode())
      .replaceAll(String.fromCharCode(0x2028), r'\u2028')
      .replaceAll(String.fromCharCode(0x2029), r'\u2029');
  return 'window.evcarViewer&&window.evcarViewer.receive($literal);';
}

/// MIME type from the file signature; null when not JPEG / PNG / WebP.
String? sniffImageMime(Uint8List bytes) {
  if (bytes.length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF) return 'image/jpeg';
  if (bytes.length >= 8 &&
      bytes[0] == 0x89 &&
      bytes[1] == 0x50 &&
      bytes[2] == 0x4E &&
      bytes[3] == 0x47 &&
      bytes[4] == 0x0D &&
      bytes[5] == 0x0A &&
      bytes[6] == 0x1A &&
      bytes[7] == 0x0A) {
    return 'image/png';
  }
  if (bytes.length >= 12 &&
      ascii.decode(bytes.sublist(0, 4), allowInvalid: true) == 'RIFF' &&
      ascii.decode(bytes.sublist(8, 12), allowInvalid: true) == 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/// Splits an image into `image` commands. Throws [FormatException] when the
/// bytes are not an accepted image or are too large.
List<ViewerCommand> imageChunkCommands({
  required String sceneId,
  required PanoramaQuality quality,
  required Uint8List bytes,
  int chunkBytes = kImageChunkBytes,
}) {
  if (quality == PanoramaQuality.multires) throw ArgumentError.value(quality, 'quality');
  if (bytes.isEmpty || bytes.length > kMaxPanoramaBytes) throw const FormatException('Panorama size not accepted');
  final mime = sniffImageMime(bytes);
  if (mime == null) throw const FormatException('Not a JPEG, PNG or WebP image');
  final total = (bytes.length / chunkBytes).ceil();
  return [
    for (var i = 0; i < total; i++)
      ViewerCommand._imageChunk(
        sceneId: sceneId,
        quality: quality,
        mime: mime,
        seq: i,
        total: total,
        data: base64Encode(
          Uint8List.sublistView(bytes, i * chunkBytes, (i + 1) * chunkBytes > bytes.length ? bytes.length : (i + 1) * chunkBytes),
        ),
      ),
  ];
}
