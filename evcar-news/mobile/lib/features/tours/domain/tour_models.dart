import 'package:flutter/foundation.dart';

import '../../../core/json/json_readers.dart';

/// Hand-written models of the public tours API (`GET /tours`,
/// `/tours/featured`, `/tours/:idOrSlug`) — contract in
/// docs/decisions/backend-tours.md §1. Missing values stay `null` (shown as
/// "غير متوفر / Not available"), never 0.

/// Where a seat scene was photographed from (`ScenePosition`).
enum ScenePosition {
  driver('driver'),
  frontPassenger('front_passenger'),
  rear('rear'),
  thirdRow('third_row'),
  cargo('cargo'),
  other('other');

  const ScenePosition(this.apiValue);

  final String apiValue;

  static ScenePosition fromApi(String? value) =>
      values.firstWhere((p) => p.apiValue == value, orElse: () => ScenePosition.other);
}

/// Hotspot kinds (`hotspot_type`). Unknown kinds are dropped by the parser.
enum HotspotType {
  info('info'),
  detailImage('detail_image'),
  video('video'),
  specLink('spec_link'),
  sceneLink('scene_link');

  const HotspotType(this.apiValue);

  final String apiValue;

  static HotspotType? fromApi(String? value) {
    for (final t in values) {
      if (t.apiValue == value) return t;
    }
    return null;
  }
}

/// `lhd` / `rhd`; anything else is unknown (`null`).
enum DriveSide {
  lhd,
  rhd;

  static DriveSide? fromApi(String? v) => switch (v) {
    'lhd' => DriveSide.lhd,
    'rhd' => DriveSide.rhd,
    _ => null,
  };
}

@immutable
class SeatSceneRef {
  const SeatSceneRef({required this.id, required this.key, required this.position, this.title});

  final String id;
  final String key;
  final ScenePosition position;
  final String? title;

  static SeatSceneRef? tryParse(Map<String, dynamic> j) {
    final id = j.stringOrNull('id');
    if (id == null) return null;
    return SeatSceneRef(
      id: id,
      key: j.stringOrNull('key') ?? id,
      position: ScenePosition.fromApi(j.stringOrNull('position')),
      title: _text(j.stringOrNull('title')),
    );
  }
}

/// `TourCard` — list/featured item and the head of [TourDetail].
@immutable
class TourCard {
  const TourCard({
    required this.id,
    required this.variantId,
    this.slug,
    this.title,
    this.variantSlug,
    this.variantName,
    this.carName,
    this.brandName,
    this.modelName,
    this.modelSlug,
    this.modelYearId,
    this.modelYear,
    this.marketCode,
    this.driveSide,
    this.interiorColorName,
    this.interiorColorHex,
    this.seatScenes = const [],
    this.sceneCount,
    this.isReferenceForSimilarTrim = false,
    this.differenceNote,
    this.referenceVariantName,
    this.previewUrl,
    this.isDemo = false,
    this.demoLabel,
    this.publishedAt,
  });

  final String id;
  final String variantId;
  final String? slug;
  final String? title;
  final String? variantSlug;

  /// Trim name.
  final String? variantName;

  /// "Brand Model Trim" (localized).
  final String? carName;
  final String? brandName;
  final String? modelName;

  /// Car page slug (`/cars/:slug`).
  final String? modelSlug;
  final String? modelYearId;
  final int? modelYear;
  final String? marketCode;
  final DriveSide? driveSide;
  final String? interiorColorName;

  /// `#RRGGBB` or null.
  final String? interiorColorHex;
  final List<SeatSceneRef> seatScenes;
  final int? sceneCount;

  /// Photographed in a similar trim (editor-approved): [differenceNote] must
  /// be shown prominently.
  final bool isReferenceForSimilarTrim;
  final String? differenceNote;

  /// Trim that was actually photographed.
  final String? referenceVariantName;
  final String? previewUrl;
  final bool isDemo;
  final String? demoLabel;
  final DateTime? publishedAt;

  /// Best available display name.
  String get displayName => carName ?? [brandName, modelName, variantName].whereType<String>().join(' ');

  static TourCard? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = j.stringOrNull('id');
    final variantId = j.stringOrNull('variantId');
    if (id == null || variantId == null) return null;
    return TourCard(
      id: id,
      variantId: variantId,
      slug: j.stringOrNull('slug'),
      title: _text(j.stringOrNull('title')),
      variantSlug: j.stringOrNull('variantSlug'),
      variantName: _text(j.stringOrNull('variantName')),
      carName: _text(j.stringOrNull('carName')),
      brandName: _text(j.stringOrNull('brandName')),
      modelName: _text(j.stringOrNull('modelName')),
      modelSlug: j.stringOrNull('modelSlug'),
      modelYearId: j.stringOrNull('modelYearId'),
      modelYear: j.intOrNull('modelYear'),
      marketCode: j.stringOrNull('marketCode'),
      driveSide: DriveSide.fromApi(j.stringOrNull('driveSide')),
      interiorColorName: _text(j.stringOrNull('interiorColorName')),
      interiorColorHex: j.stringOrNull('interiorColorHex'),
      seatScenes: j.objectList('seatScenes', SeatSceneRef.tryParse).whereType<SeatSceneRef>().toList(),
      sceneCount: j.intOrNull('sceneCount'),
      isReferenceForSimilarTrim: j.boolOr('isReferenceForSimilarTrim', false),
      differenceNote: _text(j.stringOrNull('differenceNote')),
      referenceVariantName: _text(j.stringOrNull('referenceVariantName')),
      previewUrl: j.stringOrNull('previewUrl'),
      isDemo: j.boolOr('isDemo', false),
      demoLabel: _text(j.stringOrNull('demoLabel')),
      publishedAt: j.dateTimeOrNull('publishedAt'),
    );
  }
}

/// Initial camera of a scene (degrees).
@immutable
class SceneView {
  const SceneView({
    this.yaw = 0,
    this.pitch = 0,
    this.hfov = 100,
    this.minHfov,
    this.maxHfov,
    this.minPitch,
    this.maxPitch,
    this.northOffset,
  });

  final double yaw;
  final double pitch;
  final double hfov;
  final double? minHfov;
  final double? maxHfov;
  final double? minPitch;
  final double? maxPitch;
  final double? northOffset;

  static SceneView parse(Map<String, dynamic>? j) {
    if (j == null) return const SceneView();
    return SceneView(
      yaw: _finite(j.doubleOrNull('yaw')) ?? 0,
      pitch: _finite(j.doubleOrNull('pitch')) ?? 0,
      hfov: _finite(j.doubleOrNull('hfov')) ?? 100,
      minHfov: _finite(j.doubleOrNull('minHfov')),
      maxHfov: _finite(j.doubleOrNull('maxHfov')),
      minPitch: _finite(j.doubleOrNull('minPitch')),
      maxPitch: _finite(j.doubleOrNull('maxPitch')),
      northOffset: _finite(j.doubleOrNull('northOffset')),
    );
  }
}

/// One image file of a panorama (preview or rendition).
@immutable
class PanoramaImage {
  const PanoramaImage({required this.url, this.width, this.height, this.sizeBytes});

  final String url;
  final int? width;
  final int? height;
  final int? sizeBytes;

  static PanoramaImage? tryParse(Map<String, dynamic>? j) {
    if (j == null) return null;
    final url = j.stringOrNull('url');
    if (url == null || url.isEmpty) return null;
    return PanoramaImage(
      url: url,
      width: j.intOrNull('width'),
      height: j.intOrNull('height'),
      sizeBytes: j.intOrNull('sizeBytes'),
    );
  }
}

/// Pannellum multi-resolution tile set.
@immutable
class MultiresConfig {
  const MultiresConfig({
    required this.basePath,
    required this.path,
    required this.fallbackPath,
    required this.extension,
    required this.tileResolution,
    required this.maxLevel,
    required this.cubeResolution,
  });

  final String basePath;
  final String path;
  final String fallbackPath;
  final String extension;
  final int tileResolution;
  final int maxLevel;
  final int cubeResolution;

  static final _pathRe = RegExp(r'^[A-Za-z0-9_/%.-]{1,64}$');

  static MultiresConfig? tryParse(Map<String, dynamic>? j) {
    if (j == null) return null;
    final base = j.stringOrNull('basePath');
    final path = j.stringOrNull('path');
    final fallback = j.stringOrNull('fallbackPath');
    final ext = j.stringOrNull('extension');
    final tile = j.intOrNull('tileResolution');
    final level = j.intOrNull('maxLevel');
    final cube = j.intOrNull('cubeResolution');
    if (base == null || path == null || fallback == null || ext == null) return null;
    if (tile == null || level == null || cube == null) return null;
    if (!_pathRe.hasMatch(path) || !_pathRe.hasMatch(fallback) || !RegExp(r'^(jpg|png|webp)$').hasMatch(ext)) {
      return null;
    }
    if (tile < 64 || tile > 2048 || level < 1 || level > 10 || cube < 64 || cube > 16384) return null;
    return MultiresConfig(
      basePath: base,
      path: path,
      fallbackPath: fallback,
      extension: ext,
      tileResolution: tile,
      maxLevel: level,
      cubeResolution: cube,
    );
  }

  Map<String, Object> toJson() => {
    'basePath': basePath,
    'path': path,
    'fallbackPath': fallbackPath,
    'extension': extension,
    'tileResolution': tileResolution,
    'maxLevel': maxLevel,
    'cubeResolution': cubeResolution,
  };
}

@immutable
class PanoramaSource {
  const PanoramaSource({
    required this.assetId,
    this.projection = 'equirectangular',
    this.width,
    this.height,
    this.preview,
    this.renditions = const [],
    this.recommendedRendition,
    this.multires,
  });

  final String assetId;
  final String projection;
  final int? width;
  final int? height;
  final PanoramaImage? preview;

  /// Ascending by width.
  final List<PanoramaImage> renditions;
  final PanoramaImage? recommendedRendition;
  final MultiresConfig? multires;

  bool get isEquirectangular => projection == 'equirectangular';

  static PanoramaSource? tryParse(Map<String, dynamic>? j) {
    if (j == null) return null;
    final assetId = j.stringOrNull('assetId');
    if (assetId == null) return null;
    final renditions = j.objectList('renditions', PanoramaImage.tryParse).whereType<PanoramaImage>().toList()
      ..sort((a, b) => (a.width ?? 0).compareTo(b.width ?? 0));
    return PanoramaSource(
      assetId: assetId,
      projection: j.stringOrNull('projection') ?? 'equirectangular',
      width: j.intOrNull('width'),
      height: j.intOrNull('height'),
      preview: PanoramaImage.tryParse(j.objectOrNull('preview')),
      renditions: renditions,
      recommendedRendition: PanoramaImage.tryParse(j.objectOrNull('recommendedRendition')),
      multires: MultiresConfig.tryParse(j.objectOrNull('multires')),
    );
  }
}

/// Rights of a scene's file (always shown with the scene).
@immutable
class MediaAttribution {
  const MediaAttribution({this.credit, this.rightsHolder, this.licenseType, this.licenseUrl, this.sourceUrl});

  final String? credit;
  final String? rightsHolder;
  final String? licenseType;
  final String? licenseUrl;
  final String? sourceUrl;

  /// Text to show next to the image ("© …").
  String? get displayText => credit ?? rightsHolder;

  static MediaAttribution parse(Map<String, dynamic>? j) {
    if (j == null) return const MediaAttribution();
    return MediaAttribution(
      credit: _text(j.stringOrNull('credit')),
      rightsHolder: _text(j.stringOrNull('rightsHolder')),
      licenseType: j.stringOrNull('licenseType'),
      licenseUrl: j.stringOrNull('licenseUrl'),
      sourceUrl: j.stringOrNull('sourceUrl'),
    );
  }
}

/// Tour-level attribution line (`attributions[]`).
@immutable
class TourAttribution {
  const TourAttribution({required this.text, this.licenseType, this.licenseUrl, this.sourceUrl});

  final String text;
  final String? licenseType;
  final String? licenseUrl;
  final String? sourceUrl;

  static TourAttribution? tryParse(Map<String, dynamic> j) {
    final text = _text(j.stringOrNull('text'));
    if (text == null) return null;
    return TourAttribution(
      text: text,
      licenseType: j.stringOrNull('licenseType'),
      licenseUrl: j.stringOrNull('licenseUrl'),
      sourceUrl: j.stringOrNull('sourceUrl'),
    );
  }
}

@immutable
class HotspotImage {
  const HotspotImage({required this.url, this.width, this.height, this.sizes = const [], this.alt, this.credit});

  final String url;
  final int? width;
  final int? height;
  final List<PanoramaImage> sizes;
  final String? alt;
  final String? credit;

  /// Smallest size at least [minWidth] px wide (or the largest one).
  String urlFor(double minWidth) {
    final sorted = [...sizes]..sort((a, b) => (a.width ?? 0).compareTo(b.width ?? 0));
    for (final s in sorted) {
      if ((s.width ?? 0) >= minWidth) return s.url;
    }
    return sorted.isNotEmpty ? sorted.last.url : url;
  }

  static HotspotImage? tryParse(Map<String, dynamic>? j) {
    if (j == null) return null;
    final url = j.stringOrNull('url');
    if (url == null) return null;
    return HotspotImage(
      url: url,
      width: j.intOrNull('width'),
      height: j.intOrNull('height'),
      sizes: j.objectList('sizes', PanoramaImage.tryParse).whereType<PanoramaImage>().toList(),
      alt: _text(j.stringOrNull('alt')),
      credit: _text(j.stringOrNull('credit')),
    );
  }
}

@immutable
class HotspotVideo {
  const HotspotVideo({
    required this.kind,
    required this.url,
    required this.provider,
    this.mimeType,
    this.durationSeconds,
    this.credit,
  });

  /// `file` (uploaded, served from the media origin) or `embed`.
  final String kind;
  final String url;

  /// `self`, `youtube` or `vimeo`.
  final String provider;
  final String? mimeType;
  final int? durationSeconds;
  final String? credit;

  static HotspotVideo? tryParse(Map<String, dynamic>? j) {
    if (j == null) return null;
    final url = j.stringOrNull('url');
    final kind = j.stringOrNull('kind');
    if (url == null || (kind != 'file' && kind != 'embed')) return null;
    return HotspotVideo(
      kind: kind!,
      url: url,
      provider: j.stringOrNull('provider') ?? 'self',
      mimeType: j.stringOrNull('mimeType'),
      durationSeconds: j.intOrNull('durationSeconds'),
      credit: _text(j.stringOrNull('credit')),
    );
  }
}

/// Spec linked to a hotspot. [value] `null` = "Not available".
@immutable
class HotspotSpec {
  const HotspotSpec({required this.key, required this.label, this.unit, this.value, this.reliability, this.variantSlug});

  final String key;
  final String label;
  final String? unit;

  /// num, String or bool; `null` when the trim has no value.
  final Object? value;
  final String? reliability;
  final String? variantSlug;

  static HotspotSpec? tryParse(Map<String, dynamic>? j) {
    if (j == null) return null;
    final key = j.stringOrNull('key');
    if (key == null) return null;
    final raw = j['value'];
    final value = (raw is num && raw.isFinite) || raw is String || raw is bool ? raw : null;
    return HotspotSpec(
      key: key,
      label: _text(j.stringOrNull('label')) ?? key,
      unit: j.stringOrNull('unit'),
      value: value,
      reliability: j.stringOrNull('reliability'),
      variantSlug: j.stringOrNull('variantSlug'),
    );
  }
}

@immutable
class Hotspot {
  const Hotspot({
    required this.id,
    required this.type,
    required this.yaw,
    required this.pitch,
    required this.title,
    this.iconKey,
    this.body,
    this.targetSceneId,
    this.targetYaw,
    this.targetPitch,
    this.image,
    this.video,
    this.spec,
  });

  final String id;
  final HotspotType type;
  final double yaw;
  final double pitch;
  final String? iconKey;

  /// Plain text (never HTML) — rendered with `Text`.
  final String title;
  final String? body;
  final String? targetSceneId;
  final double? targetYaw;
  final double? targetPitch;
  final HotspotImage? image;
  final HotspotVideo? video;
  final HotspotSpec? spec;

  static Hotspot? tryParse(Map<String, dynamic> j) {
    final id = j.stringOrNull('id');
    final type = HotspotType.fromApi(j.stringOrNull('type'));
    final yaw = _finite(j.doubleOrNull('yaw'));
    final pitch = _finite(j.doubleOrNull('pitch'));
    if (id == null || type == null || yaw == null || pitch == null) return null;
    final hs = Hotspot(
      id: id,
      type: type,
      yaw: yaw,
      pitch: pitch,
      iconKey: j.stringOrNull('iconKey'),
      title: _text(j.stringOrNull('title')) ?? '',
      body: _text(j.stringOrNull('body')),
      targetSceneId: j.stringOrNull('targetSceneId'),
      targetYaw: _finite(j.doubleOrNull('targetYaw')),
      targetPitch: _finite(j.doubleOrNull('targetPitch')),
      image: HotspotImage.tryParse(j.objectOrNull('image')),
      video: HotspotVideo.tryParse(j.objectOrNull('video')),
      spec: HotspotSpec.tryParse(j.objectOrNull('spec')),
    );
    // A hotspot whose payload is missing cannot do anything useful.
    return switch (type) {
      HotspotType.sceneLink when hs.targetSceneId == null => null,
      HotspotType.detailImage when hs.image == null => null,
      HotspotType.video when hs.video == null => null,
      HotspotType.specLink when hs.spec == null => null,
      _ => hs,
    };
  }
}

@immutable
class TourScene {
  const TourScene({
    required this.id,
    required this.key,
    required this.position,
    required this.panorama,
    this.positionLabel,
    this.title,
    this.sortOrder = 0,
    this.view = const SceneView(),
    this.attribution = const MediaAttribution(),
    this.hotspots = const [],
  });

  final String id;
  final String key;
  final ScenePosition position;
  final String? positionLabel;
  final String? title;
  final int sortOrder;
  final SceneView view;
  final PanoramaSource panorama;
  final MediaAttribution attribution;
  final List<Hotspot> hotspots;

  Hotspot? hotspot(String id) {
    for (final h in hotspots) {
      if (h.id == id) return h;
    }
    return null;
  }

  static TourScene? tryParse(Map<String, dynamic> j) {
    final id = j.stringOrNull('id');
    final panorama = PanoramaSource.tryParse(j.objectOrNull('panorama'));
    if (id == null || panorama == null) return null;
    return TourScene(
      id: id,
      key: j.stringOrNull('key') ?? id,
      position: ScenePosition.fromApi(j.stringOrNull('position')),
      positionLabel: _text(j.stringOrNull('positionLabel')),
      title: _text(j.stringOrNull('title')),
      sortOrder: j.intOrNull('sortOrder') ?? 0,
      view: SceneView.parse(j.objectOrNull('view')),
      panorama: panorama,
      attribution: MediaAttribution.parse(j.objectOrNull('attribution')),
      hotspots: j.objectList('hotspots', Hotspot.tryParse).whereType<Hotspot>().toList(),
    );
  }
}

/// `TourDetail` — everything the viewer needs.
@immutable
class TourDetail {
  const TourDetail({
    required this.card,
    required this.scenes,
    required this.initialSceneId,
    this.matchType = 'exact',
    this.description,
    this.updatedAt,
    this.marketMatch = true,
    this.mediaOrigin,
    this.attributions = const [],
  });

  final TourCard card;

  /// Ordered; only scenes the viewer can show (equirectangular with at least
  /// one image) are kept.
  final List<TourScene> scenes;
  final String initialSceneId;

  /// `exact` or `reference_similar_trim`.
  final String matchType;
  final String? description;
  final DateTime? updatedAt;

  /// False when the tour belongs to another market than the one selected.
  final bool marketMatch;

  /// Origin of every media URL (the viewer's allow-list).
  final String? mediaOrigin;
  final List<TourAttribution> attributions;

  String get id => card.id;
  bool get isReference => card.isReferenceForSimilarTrim || matchType == 'reference_similar_trim';

  TourScene? scene(String id) {
    for (final s in scenes) {
      if (s.id == id) return s;
    }
    return null;
  }

  TourScene get initialScene => scene(initialSceneId) ?? scenes.first;

  /// Parses `data` of `GET /tours/:idOrSlug`. Throws [FormatException] when
  /// the tour has nothing the viewer could show.
  static TourDetail parse(Object? json) {
    final j = asJsonObject(json, 'tour');
    final card = TourCard.tryParse(j);
    if (card == null) throw const FormatException('Tour without id');
    final scenes = j.objectList('scenes', TourScene.tryParse).whereType<TourScene>().where((s) {
      final p = s.panorama;
      return p.isEquirectangular && (p.preview != null || p.renditions.isNotEmpty || p.multires != null);
    }).toList()..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    if (scenes.isEmpty) throw const FormatException('Tour without a viewable scene');
    final initial = j.stringOrNull('initialSceneId');
    return TourDetail(
      card: card,
      scenes: scenes,
      initialSceneId: scenes.any((s) => s.id == initial) ? initial! : scenes.first.id,
      matchType: j.stringOrNull('matchType') ?? 'exact',
      description: _text(j.stringOrNull('description')),
      updatedAt: j.dateTimeOrNull('updatedAt'),
      marketMatch: j.boolOr('marketMatch', true),
      mediaOrigin: j.stringOrNull('mediaOrigin'),
      attributions: j.objectList('attributions', TourAttribution.tryParse).whereType<TourAttribution>().toList(),
    );
  }
}

String? _text(String? s) {
  final t = s?.trim();
  return t == null || t.isEmpty ? null : t;
}

double? _finite(double? v) => v != null && v.isFinite ? v : null;
