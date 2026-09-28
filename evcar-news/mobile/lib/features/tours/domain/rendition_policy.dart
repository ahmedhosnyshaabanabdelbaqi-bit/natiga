import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import 'tour_models.dart';

/// What the phone can display, used to pick panorama files
/// (REQUIREMENTS §8: "لا تحمّل أكبر صورة لجميع المستخدمين").
@immutable
class DeviceDisplayProfile {
  const DeviceDisplayProfile({required this.physicalLongSide, this.maxTextureSize, this.lowMemory = false});

  /// From the window size (logical px × device pixel ratio).
  factory DeviceDisplayProfile.fromWindow({
    required double logicalWidth,
    required double logicalHeight,
    required double devicePixelRatio,
    int? maxTextureSize,
  }) {
    final longSide = (math.max(logicalWidth, logicalHeight) * devicePixelRatio).round();
    return DeviceDisplayProfile(
      physicalLongSide: longSide,
      maxTextureSize: maxTextureSize,
      // No memory-class API without a new plugin: small, low-density screens
      // are treated as low-memory devices.
      lowMemory: longSide > 0 && longSide < kLowEndLongSide,
    );
  }

  /// Longest side of the screen in physical pixels.
  final int physicalLongSide;

  /// WebGL `MAX_TEXTURE_SIZE` reported by the viewer (null until known).
  final int? maxTextureSize;
  final bool lowMemory;

  DeviceDisplayProfile withMaxTextureSize(int? value) =>
      DeviceDisplayProfile(physicalLongSide: physicalLongSide, maxTextureSize: value, lowMemory: lowMemory);

  /// Screens with a long side under this many physical pixels get 2048 px
  /// panoramas (≈ 16 MB decoded instead of 64 MB for 4096).
  static const kLowEndLongSide = 1280;

  /// Largest equirectangular width loaded as ONE image. 8192 px (128 MB of
  /// texture memory) is never loaded whole; above 4096 only multires tiles
  /// are used (they stream the visible part only).
  static const kMaxEquirectWidth = 4096;

  /// Width cap for a single equirectangular image on this device.
  int get equirectCap {
    var cap = lowMemory ? 2048 : kMaxEquirectWidth;
    final tex = maxTextureSize;
    // Pannellum refuses equirectangular images wider than 2 × MAX_TEXTURE_SIZE.
    if (tex != null && tex > 0) cap = math.min(cap, tex * 2);
    return cap;
  }

  /// Panorama width that looks sharp at the default 100° field of view:
  /// the screen's long side covers 100° of the 360° image.
  int get desiredWidth => (physicalLongSide * 360 / 100).round();

  /// `maxWidth` query parameter for `GET /tours/:id` (the API drops wider
  /// renditions and recommends the largest one ≤ this). Clamped to the API
  /// range 512..16384.
  int get apiMaxWidth => equirectCap.clamp(512, 16384);
}

/// Files to load for one scene, in order: [preview] first (fast, low
/// resolution), then either [multires] tiles or the [rendition].
@immutable
class RenditionPlan {
  const RenditionPlan({this.preview, this.rendition, this.multires, required this.reason});

  /// ~1024×512 image shown immediately (may be null).
  final PanoramaImage? preview;

  /// Device-appropriate full image (also the fallback when tiles fail).
  final PanoramaImage? rendition;

  /// Tile set, used instead of [rendition] when the device benefits from
  /// more detail than one image may carry.
  final MultiresConfig? multires;

  /// Why this plan was chosen (logs, tests, decisions doc).
  final String reason;

  bool get hasAnything => preview != null || rendition != null || multires != null;

  @override
  String toString() =>
      'RenditionPlan(preview: ${preview?.width}, rendition: ${rendition?.width}, multires: ${multires != null}, $reason)';
}

/// Pure selection policy (unit tested):
///
/// 1. `preview` = the API preview, else the smallest rendition when ≤ 2048.
/// 2. `rendition` = the smallest rendition at least as wide as
///    `min(desiredWidth, equirectCap)` among those ≤ `equirectCap`; else the
///    largest ≤ cap; if every rendition is too big for the device, none
///    (the preview stays, the screen says so).
/// 3. `multires` when the tour has tiles, the device is not low-end and it
///    wants more pixels than the chosen rendition has.
RenditionPlan chooseRendition(PanoramaSource source, DeviceDisplayProfile device) {
  final cap = device.equirectCap;
  final target = math.min(device.desiredWidth, cap);
  final sorted = [...source.renditions]..sort((a, b) => (a.width ?? 0).compareTo(b.width ?? 0));
  final fitting = sorted.where((r) => (r.width ?? 0) > 0 && r.width! <= cap).toList();

  PanoramaImage? rendition;
  String reason;
  if (fitting.isEmpty) {
    // Unknown widths: trust the server's recommendation for this maxWidth.
    final rec = source.recommendedRendition;
    if (rec != null && (rec.width == null || rec.width! <= cap)) {
      rendition = rec;
      reason = 'recommended';
    } else {
      rendition = null;
      reason = sorted.isEmpty ? 'no renditions' : 'all renditions exceed device cap $cap';
    }
  } else {
    rendition = fitting.firstWhere((r) => r.width! >= target, orElse: () => fitting.last);
    reason = 'rendition ${rendition.width} for target $target (cap $cap)';
  }

  var preview = source.preview;
  if (preview == null && sorted.isNotEmpty && (sorted.first.width ?? 1 << 30) <= 2048) {
    preview = sorted.first;
  }
  if (preview != null && rendition != null && preview.url == rendition.url) preview = null;

  MultiresConfig? multires;
  final tiles = source.multires;
  if (tiles != null && !device.lowMemory && device.desiredWidth > (rendition?.width ?? 0)) {
    multires = tiles;
    reason = '$reason; multires (wants ${device.desiredWidth})';
  }
  return RenditionPlan(preview: preview, rendition: rendition, multires: multires, reason: reason);
}
