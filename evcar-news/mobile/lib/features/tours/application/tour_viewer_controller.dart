import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../data/panorama_cache.dart';
import '../domain/rendition_policy.dart';
import '../domain/tour_models.dart';
import '../domain/viewer_protocol.dart';
import 'motion_look.dart';
import 'panorama_surface.dart';

enum ViewerPhase {
  /// Waiting for the viewer page to report `ready`.
  starting,

  /// Page ready, first image not on screen yet.
  loading,

  /// A scene is on screen.
  showing,

  /// Nothing can be shown (see [TourViewerController.failure]).
  failed,
}

enum ViewerFailure {
  /// The device has no WebGL.
  webglUnsupported,

  /// The viewer page or the panorama files could not be loaded.
  loadFailed,

  /// No file of this tour fits the device.
  noSuitableImage,
}

enum MotionState { off, on, unavailable }

/// Everything the 360° viewer does, independent of the WebView (tested with
/// a fake [PanoramaSurface]):
///
/// * init handshake (`ready` → `init` with the tour's scenes and hotspots);
/// * progressive loading per scene: preview first, then the rendition the
///   [chooseRendition] policy picked for this device, or multires tiles with
///   the rendition as fallback when tiles fail;
/// * scene switching (separate images — no fake 3D transition);
/// * hotspots: scene links switch scenes, everything else is handed to the
///   UI ([onHotspot]) and shown as a native bottom sheet;
/// * optional motion control (native sensors), stopped whenever the viewer
///   is paused (screen hidden / app in background) and on dispose.
class TourViewerController extends ChangeNotifier {
  TourViewerController({
    required this.tour,
    required this._device,
    required this.loader,
    required this.surfaceFactory,
    required this.motion,
    required this.locale,
    required this.strings,
    this.allowInsecureMedia = kDebugMode,
    this.onHotspot,
    this.onMotionUnavailable,
  }) : _currentSceneId = tour.initialSceneId {
    _surface = surfaceFactory(tour: tour, onEvent: _onEvent);
  }

  final TourDetail tour;
  final PanoramaLoader loader;
  final PanoramaSurfaceFactory surfaceFactory;
  final MotionSource motion;
  final String locale;
  final ViewerStrings strings;
  final bool allowInsecureMedia;

  /// Called for hotspots that open a sheet (info, image, video, spec).
  final void Function(TourScene scene, Hotspot hotspot)? onHotspot;

  /// Called when motion control was requested but the sensors do not work.
  final VoidCallback? onMotionUnavailable;

  late PanoramaSurface _surface;
  PanoramaSurface get surface => _surface;

  DeviceDisplayProfile _device;
  DeviceDisplayProfile get device => _device;

  ViewerPhase _phase = ViewerPhase.starting;
  ViewerPhase get phase => _phase;

  ViewerFailure? _failure;
  ViewerFailure? get failure => _failure;

  String _currentSceneId;
  String get currentSceneId => _currentSceneId;
  TourScene get currentScene => tour.scene(_currentSceneId) ?? tour.initialScene;

  PanoramaQuality? _shownQuality;

  /// Quality on screen for the current scene (null while loading).
  PanoramaQuality? get shownQuality => _shownQuality;

  double? _progress;

  /// Download progress (0..1) of the high-quality file, null when idle or
  /// unknown.
  double? get progress => _progress;
  bool _loadingFull = false;
  bool get loadingFull => _loadingFull;

  /// The high-quality file failed; the preview stays on screen.
  bool _fullFailed = false;
  bool get fullFailed => _fullFailed;

  MotionState _motion = MotionState.off;
  MotionState get motionState => _motion;

  bool _paused = false;
  bool get paused => _paused;

  bool _disposed = false;
  bool _initSent = false;

  final Map<String, RenditionPlan> _plans = {};
  final Set<String> _delivering = {};
  final Map<String, CancelToken> _cancels = {};
  Future<void> _queue = Future.value();

  RenditionPlan planFor(TourScene scene) => _plans[scene.id] ??= chooseRendition(scene.panorama, _device);

  // ------------------------------------------------------------ commands

  Future<void> _send(ViewerCommand c) {
    if (_disposed) return Future.value();
    final next = _queue.then((_) => _disposed ? null : _surface.send(c)).catchError((Object e) {
      if (kDebugMode) debugPrint('360 viewer: send failed: $e');
    });
    _queue = next;
    return next;
  }

  Future<void> _sendAll(Iterable<ViewerCommand> commands) async {
    for (final c in commands) {
      if (_disposed) return;
      await _send(c);
    }
  }

  void _set(VoidCallback change) {
    if (_disposed) return;
    change();
    notifyListeners();
  }

  // -------------------------------------------------------------- events

  void _onEvent(ViewerEvent event) {
    if (_disposed) return;
    switch (event) {
      case ViewerReady(:final webgl, :final maxTextureSize):
        if (!webgl) {
          _set(() {
            _phase = ViewerPhase.failed;
            _failure = ViewerFailure.webglUnsupported;
          });
          return;
        }
        _device = _device.withMaxTextureSize(maxTextureSize);
        _plans.clear();
        if (!tour.scenes.any((s) => planFor(s).hasAnything)) {
          _set(() {
            _phase = ViewerPhase.failed;
            _failure = ViewerFailure.noSuitableImage;
          });
          return;
        }
        _initSent = true;
        _set(() => _phase = ViewerPhase.loading);
        unawaited(
          _send(
            ViewerCommand.init(
              tour: tour,
              locale: locale,
              strings: strings,
              firstSceneId: _currentSceneId,
              allowInsecureMedia: allowInsecureMedia,
              multires: {
                for (final s in tour.scenes)
                  if (planFor(s).multires != null) s.id: planFor(s).multires!,
              },
            ),
          ),
        );
      case ViewerNeedsImages(:final sceneId):
        unawaited(_deliver(sceneId));
      case ViewerSceneShown(:final sceneId, :final quality):
        if (sceneId != _currentSceneId) return;
        _set(() {
          _phase = ViewerPhase.showing;
          _shownQuality = quality;
          if (quality != PanoramaQuality.preview) {
            _loadingFull = false;
            _progress = null;
          }
        });
      case ViewerHotspotTapped(:final sceneId, :final hotspotId):
        final scene = tour.scene(sceneId);
        final hotspot = scene?.hotspot(hotspotId);
        if (scene == null || hotspot == null) return;
        activateHotspot(scene, hotspot);
      case ViewerMultiresFailed(:final sceneId):
        final scene = tour.scene(sceneId);
        if (scene == null) return;
        _plans[sceneId] = RenditionPlan(
          preview: planFor(scene).preview,
          rendition: planFor(scene).rendition,
          reason: 'multires failed → rendition',
        );
        unawaited(_deliverFull(scene));
      case ViewerError(:final code, :final sceneId):
        if (kDebugMode) debugPrint('360 viewer error: ${code.wire} ${event.message ?? ''}');
        if (code == ViewerErrorCode.webglUnsupported) {
          _set(() {
            _phase = ViewerPhase.failed;
            _failure = ViewerFailure.webglUnsupported;
          });
        } else if (code == ViewerErrorCode.loadFailed ||
            code == ViewerErrorCode.imageRejected ||
            code == ViewerErrorCode.tooLarge) {
          // A failed upgrade keeps the preview on screen.
          if (_shownQuality != null && (sceneId == null || sceneId == _currentSceneId)) {
            _set(() {
              _fullFailed = true;
              _loadingFull = false;
              _progress = null;
            });
          } else {
            _fail(ViewerFailure.loadFailed);
          }
        }
    }
  }

  void _fail(ViewerFailure failure) => _set(() {
    _phase = ViewerPhase.failed;
    _failure = failure;
    _loadingFull = false;
    _progress = null;
  });

  // ------------------------------------------------------------- images

  Future<void> _deliver(String sceneId) async {
    final scene = tour.scene(sceneId);
    if (scene == null || !_delivering.add(sceneId)) return;
    try {
      final plan = planFor(scene);
      var previewSent = false;
      if (plan.preview != null) {
        try {
          final bytes = await loader.load(
            plan.preview!.url,
            mediaOrigin: tour.mediaOrigin,
            cancel: _cancelFor(sceneId),
          );
          if (_disposed) return;
          await _sendAll(imageChunkCommands(sceneId: sceneId, quality: PanoramaQuality.preview, bytes: bytes));
          previewSent = true;
        } on Object catch (e) {
          if (kDebugMode) debugPrint('360 preview failed: $e');
        }
      }
      if (_disposed) return;
      if (plan.multires != null) {
        await _send(ViewerCommand.useMultires(sceneId));
        if (!previewSent && plan.rendition == null) return;
        if (!previewSent) {
          // Tiles may still fail; make sure something appears.
          await _deliverFull(scene);
        }
        return;
      }
      if (plan.rendition == null) {
        if (!previewSent) _fail(ViewerFailure.noSuitableImage);
        return;
      }
      final ok = await _deliverFull(scene);
      if (!ok && !previewSent && sceneId == _currentSceneId) _fail(ViewerFailure.loadFailed);
    } finally {
      _delivering.remove(sceneId);
    }
  }

  CancelToken _cancelFor(String sceneId) {
    final existing = _cancels[sceneId];
    if (existing != null && !existing.isCancelled) return existing;
    return _cancels[sceneId] = CancelToken();
  }

  /// Downloads and sends the rendition of [scene]; false on failure.
  Future<bool> _deliverFull(TourScene scene) async {
    final rendition = planFor(scene).rendition;
    if (rendition == null) {
      if (scene.id == _currentSceneId && _shownQuality == null) _fail(ViewerFailure.noSuitableImage);
      return false;
    }
    final isCurrent = scene.id == _currentSceneId;
    if (isCurrent) {
      _set(() {
        _loadingFull = true;
        _fullFailed = false;
        _progress = null;
      });
    }
    try {
      final bytes = await loader.load(
        rendition.url,
        mediaOrigin: tour.mediaOrigin,
        cancel: _cancelFor(scene.id),
        onProgress: (received, total) {
          if (_disposed || scene.id != _currentSceneId) return;
          final expected = total ?? rendition.sizeBytes;
          final p = expected == null || expected <= 0 ? null : (received / expected).clamp(0.0, 1.0);
          if (p == null || _progress == null || (p - _progress!).abs() >= 0.02 || p == 1) {
            _set(() => _progress = p);
          }
        },
      );
      if (_disposed) return false;
      await _sendAll(imageChunkCommands(sceneId: scene.id, quality: PanoramaQuality.full, bytes: bytes));
      return true;
    } on Object catch (e) {
      if (kDebugMode) debugPrint('360 rendition failed: $e');
      if (scene.id == _currentSceneId) {
        _set(() {
          _fullFailed = true;
          _loadingFull = false;
          _progress = null;
        });
      }
      return false;
    }
  }

  /// Retries the high-quality file after a failure (preview on screen).
  Future<void> retryFull() async {
    final scene = currentScene;
    _cancels.remove(scene.id);
    await _deliverFull(scene);
  }

  // ------------------------------------------------------------- actions

  /// Switches to [sceneId] (another photo taken from that seat).
  void selectScene(String sceneId, {double? yaw, double? pitch}) {
    if (tour.scene(sceneId) == null) return;
    if (sceneId == _currentSceneId) {
      if (yaw != null || pitch != null) unawaited(_send(ViewerCommand.show(sceneId, yaw: yaw, pitch: pitch)));
      return;
    }
    _set(() {
      _currentSceneId = sceneId;
      _shownQuality = null;
      _loadingFull = false;
      _fullFailed = false;
      _progress = null;
      if (_phase == ViewerPhase.showing) _phase = ViewerPhase.loading;
    });
    if (_initSent) unawaited(_send(ViewerCommand.show(sceneId, yaw: yaw, pitch: pitch)));
  }

  /// Scene links jump; the other kinds open a native sheet.
  void activateHotspot(TourScene scene, Hotspot hotspot) {
    if (hotspot.type == HotspotType.sceneLink) {
      final target = hotspot.targetSceneId;
      if (target != null) selectScene(target, yaw: hotspot.targetYaw, pitch: hotspot.targetPitch);
      return;
    }
    onHotspot?.call(scene, hotspot);
  }

  void resetView() => unawaited(_send(ViewerCommand.resetView()));

  void zoom({required bool zoomIn}) => unawaited(_send(ViewerCommand.zoom(zoomIn: zoomIn)));

  /// Reloads the page after a failure.
  Future<void> retry() async {
    for (final c in _cancels.values) {
      c.cancel();
    }
    _cancels.clear();
    _plans.clear();
    _delivering.clear();
    _initSent = false;
    _set(() {
      _phase = ViewerPhase.starting;
      _failure = null;
      _shownQuality = null;
      _fullFailed = false;
      _loadingFull = false;
      _progress = null;
    });
    await _surface.reload();
  }

  // --------------------------------------------------------------- motion

  final MotionLookFilter _filter = MotionLookFilter();
  StreamSubscription<Vec3Sample>? _gyroSub;
  StreamSubscription<Vec3Sample>? _accelSub;
  Timer? _motionTimer;
  Timer? _motionWatchdog;
  bool _gotMotion = false;

  void toggleMotion() {
    if (_motion == MotionState.on) {
      _stopMotion();
      _set(() => _motion = MotionState.off);
    } else {
      _set(() => _motion = MotionState.on);
      if (!_paused) _startMotion();
    }
  }

  void _startMotion() {
    _stopMotion();
    _filter.reset();
    _gotMotion = false;
    void unavailable(Object _) {
      _stopMotion();
      _set(() => _motion = MotionState.unavailable);
      onMotionUnavailable?.call();
    }

    try {
      _accelSub = motion.accelerometer().listen(_filter.addAccelerometer, onError: unavailable, cancelOnError: true);
      _gyroSub = motion.gyroscope().listen(
        (s) {
          _gotMotion = true;
          _filter.addGyroscope(s);
        },
        onError: unavailable,
        cancelOnError: true,
      );
    } on Object catch (e) {
      unavailable(e);
      return;
    }
    // ~30 updates per second while motion is on.
    _motionTimer = Timer.periodic(const Duration(milliseconds: 33), (_) {
      final pitch = _filter.pitch;
      if (pitch == null || _shownQuality == null) return;
      unawaited(_send(ViewerCommand.look(yawDelta: _filter.takeYawDelta(), pitch: pitch)));
    });
    // No gyroscope events at all → the device has no usable sensor.
    _motionWatchdog = Timer(const Duration(seconds: 2), () {
      if (!_gotMotion && _motion == MotionState.on) unavailable(StateError('no motion events'));
    });
  }

  void _stopMotion() {
    _motionTimer?.cancel();
    _motionTimer = null;
    _motionWatchdog?.cancel();
    _motionWatchdog = null;
    unawaited(_gyroSub?.cancel());
    unawaited(_accelSub?.cancel());
    _gyroSub = null;
    _accelSub = null;
  }

  /// Screen hidden / app in background: stop sensors and movement.
  void pause() {
    if (_paused || _disposed) return;
    _paused = true;
    _stopMotion();
    unawaited(_send(ViewerCommand.pause()));
  }

  void resume() {
    if (!_paused || _disposed) return;
    _paused = false;
    unawaited(_send(ViewerCommand.resume()));
    if (_motion == MotionState.on) _startMotion();
  }

  @visibleForTesting
  bool get motionListening => _gyroSub != null || _accelSub != null;

  @override
  void dispose() {
    _stopMotion();
    for (final c in _cancels.values) {
      c.cancel();
    }
    _disposed = true;
    _surface.dispose();
    super.dispose();
  }
}
