import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../../../app/router/app_routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/platform/platform_capabilities.dart';
import '../../../shared/widgets/kit.dart';
import '../application/motion_look.dart';
import '../application/tour_viewer_controller.dart';
import '../application/tours_providers.dart';
import '../data/panorama_cache.dart';
import '../domain/rendition_policy.dart';
import '../domain/tour_models.dart';
import '../domain/viewer_protocol.dart';
import 'widgets/tour_facts.dart';
import 'widgets/tour_labels.dart';
import 'widgets/tour_sheets.dart';
import 'widgets/webview_panorama_surface.dart';

/// 360° interior tour viewer (`/cars/:slug/tour/:tourId`): an isolated
/// WebView with the bundled Pannellum page (assets/panorama/viewer.html),
/// native controls, scene switcher and hotspot sheets. Always dark (a
/// "cinema" surface), in the user's language and direction.
class TourViewerScreen extends ConsumerStatefulWidget {
  const TourViewerScreen({super.key, required this.carSlug, required this.tourId});

  /// Car slug the tour belongs to.
  final String carSlug;

  /// Tour id (or slug).
  final String tourId;

  @override
  ConsumerState<TourViewerScreen> createState() => _TourViewerScreenState();
}

class _TourViewerScreenState extends ConsumerState<TourViewerScreen> {
  int? _maxWidth;

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    _maxWidth ??= DeviceDisplayProfile.fromWindow(
      logicalWidth: mq.size.width,
      logicalHeight: mq.size.height,
      devicePixelRatio: mq.devicePixelRatio,
    ).apiMaxWidth;
    final args = (idOrSlug: widget.tourId, maxWidth: _maxWidth!);
    final value = ref.watch(tourDetailProvider(args));
    final canView = ref.watch(platformCapabilitiesProvider).panoramaWebView;
    final primary = Theme.of(context).colorScheme.primary;

    Widget body;
    if (value.hasValue && !value.hasError) {
      final res = value.requireValue;
      body = canView
          ? TourViewerView(key: ValueKey(res.data.id), tour: res.data, carSlug: widget.carSlug)
          : _WebPreviewFallback(tour: res.data, carSlug: widget.carSlug);
    } else if (value.hasError) {
      body = _ErrorView(
        error: value.error!,
        carSlug: widget.carSlug,
        onRetry: () => ref.invalidate(tourDetailProvider(args)),
      );
    } else {
      body = const _LoadingView();
    }

    return Theme(
      data: AppTheme.dark(primary: primary),
      child: AnnotatedRegion<SystemUiOverlayStyle>(value: SystemUiOverlayStyle.light, child: body),
    );
  }
}

// ---------------------------------------------------------------------------
// Non-viewer states
// ---------------------------------------------------------------------------

class _DarkFrame extends StatelessWidget {
  const _DarkFrame({required this.child, this.title});

  final Widget child;
  final String? title;

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: _kViewerBackground,
    appBar: AppBar(
      backgroundColor: Colors.transparent,
      foregroundColor: Colors.white,
      title: title == null ? null : Text(title!),
    ),
    body: SafeArea(top: false, child: child),
  );
}

const _kViewerBackground = Color(0xFF05070D);

class _LoadingView extends StatelessWidget {
  const _LoadingView();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return _DarkFrame(
      title: l10n.toursViewerTitle,
      child: Semantics(
        liveRegion: true,
        label: l10n.toursLoading,
        child: Skeleton(
          semanticLabel: l10n.toursLoading,
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.xl),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Expanded(child: SkeletonBox(radius: AppRadii.lg)),
                const SizedBox(height: AppSpacing.lg),
                const SkeletonLine(widthFactor: 0.6, fontSize: 18),
                const SizedBox(height: AppSpacing.sm),
                const SkeletonLine(widthFactor: 0.4),
                const SizedBox(height: AppSpacing.lg),
                Row(
                  children: [
                    for (var i = 0; i < 3; i++) ...[
                      if (i > 0) const SizedBox(width: AppSpacing.sm),
                      const Expanded(child: SkeletonBox(height: 40, radius: AppRadii.xl)),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Unavailable (404 / nothing viewable) → "الجولة غير متاحة لهذه الفئة" +
/// the regular photo gallery; offline → offline state; else a generic error.
class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.carSlug, required this.onRetry});

  final Object error;
  final String carSlug;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final e = error;
    final unavailable = e is FormatException || (e is ApiException && e.kind == ApiErrorKind.notFound);
    final gallery = StateAction(
      label: l10n.toursOpenGallery,
      icon: Icons.photo_library_outlined,
      onPressed: () => context.pushReplacement(AppRoutes.carGallery(carSlug)),
    );
    Widget child;
    if (unavailable) {
      child = EmptyState(
        icon: Icons.threesixty,
        title: l10n.toursUnavailableTitle,
        message: l10n.toursUnavailableMessage,
        actions: [
          StateAction(
            label: l10n.toursOpenGallery,
            icon: Icons.photo_library_outlined,
            primary: true,
            onPressed: () => context.pushReplacement(AppRoutes.carGallery(carSlug)),
          ),
        ],
      );
    } else if (e is ApiException && e.isConnectivityProblem) {
      child = OfflineState(onRetry: onRetry, actions: [gallery]);
    } else {
      child = ErrorState(error: e, onRetry: onRetry, actions: [gallery]);
    }
    return _DarkFrame(title: l10n.toursViewerTitle, child: Center(child: SingleChildScrollView(child: child)));
  }
}

/// Web design preview: the WebView does not exist there. Shows an honest
/// message, a clearly labelled still preview and the tour details.
class _WebPreviewFallback extends StatelessWidget {
  const _WebPreviewFallback({required this.tour, required this.carSlug});

  final TourDetail tour;
  final String carSlug;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final preview = tour.card.previewUrl ?? tour.initialScene.panorama.preview?.url;
    return _DarkFrame(
      title: tour.card.displayName,
      child: ListView(
        padding: EdgeInsets.all(context.pageGutter),
        children: [
          NotSupportedOnPlatformState(compact: true, message: l10n.toursWebPreviewMessage),
          const SizedBox(height: AppSpacing.lg),
          ImageWithFallback(
            url: preview,
            aspectRatio: 2,
            borderRadius: AppRadii.image,
            semanticLabel: l10n.toursStillPreview,
            overlay: PositionedDirectional(
              top: AppSpacing.sm,
              start: AppSpacing.sm,
              child: Pill(label: l10n.toursStillPreview, icon: Icons.photo_outlined, dense: true),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          TourInfoBody(tour: tour, carSlug: carSlug),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// The viewer
// ---------------------------------------------------------------------------

/// The live viewer for a loaded [tour] (Android / iOS).
class TourViewerView extends ConsumerStatefulWidget {
  const TourViewerView({super.key, required this.tour, required this.carSlug});

  final TourDetail tour;
  final String carSlug;

  @override
  ConsumerState<TourViewerView> createState() => _TourViewerViewState();
}

class _TourViewerViewState extends ConsumerState<TourViewerView> with WidgetsBindingObserver {
  TourViewerController? _c;
  bool _fullscreen = false;
  bool _visible = true;
  bool _foreground = true;
  bool _hintVisible = false;
  bool _hintShown = false;
  Timer? _hintTimer;

  TourViewerController get c => _c!;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_c != null) return;
    final mq = MediaQuery.of(context);
    final l10n = context.l10n;
    _c = TourViewerController(
      tour: widget.tour,
      device: DeviceDisplayProfile.fromWindow(
        logicalWidth: mq.size.width,
        logicalHeight: mq.size.height,
        devicePixelRatio: mq.devicePixelRatio,
      ),
      loader: ref.read(panoramaLoaderProvider),
      surfaceFactory: ref.read(panoramaSurfaceFactoryProvider),
      motion: ref.read(motionSourceProvider),
      locale: context.languageCode,
      strings: ViewerStrings(
        loading: l10n.commonLoading,
        loadFailed: l10n.toursLoadFailedTitle,
        webglUnsupported: l10n.toursWebglTitle,
      ),
      onHotspot: _openHotspot,
      onMotionUnavailable: () {
        if (mounted) showAppSnackBar(context, context.l10n.toursMotionUnavailable, icon: Icons.screen_rotation_alt);
      },
    )..addListener(_onChanged);
  }

  void _onChanged() {
    if (!mounted) return;
    if (!_hintShown && c.phase == ViewerPhase.showing) {
      _hintShown = true;
      _hintVisible = true;
      _hintTimer = Timer(const Duration(seconds: 5), () {
        if (mounted) setState(() => _hintVisible = false);
      });
    }
    setState(() {});
  }

  void _openHotspot(TourScene scene, Hotspot hotspot) {
    if (!mounted) return;
    unawaited(showHotspotSheet(context, tour: widget.tour, hotspot: hotspot));
  }

  void _updateRunning() {
    if (_c == null) return;
    if (_visible && _foreground) {
      c.resume();
    } else {
      c.pause();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _updateRunning();
  }

  Future<void> _setFullscreen(bool value) async {
    setState(() => _fullscreen = value);
    await SystemChrome.setEnabledSystemUIMode(value ? SystemUiMode.immersiveSticky : SystemUiMode.edgeToEdge);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _hintTimer?.cancel();
    if (_fullscreen) unawaited(SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge));
    _c?.removeListener(_onChanged);
    _c?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tour = widget.tour;
    final failed = c.phase == ViewerPhase.failed;
    final loading = !failed && c.shownQuality == null;
    final showChrome = !_fullscreen && !failed;

    return PopScope(
      canPop: !_fullscreen,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _fullscreen) unawaited(_setFullscreen(false));
      },
      child: Scaffold(
        backgroundColor: _kViewerBackground,
        body: VisibilityDetector(
          key: ValueKey('tour-viewer-${tour.id}'),
          onVisibilityChanged: (info) {
            _visible = info.visibleFraction > 0;
            _updateRunning();
          },
          child: Stack(
            fit: StackFit.expand,
            children: [
              Semantics(
                container: true,
                label: l10n.toursViewerSemantics(tour.card.displayName),
                child: c.surface.build(context),
              ),
              if (loading) _LoadingOverlay(tour: tour),
              if (failed) _FailureOverlay(controller: c, carSlug: widget.carSlug),
              if (showChrome) ...[
                _TopChrome(
                  tour: tour,
                  scene: c.currentScene,
                  onInfo: () => showTourInfoSheet(context, tour: tour, carSlug: widget.carSlug),
                ),
                _BottomChrome(
                  controller: c,
                  hintVisible: _hintVisible,
                  onFullscreen: () => _setFullscreen(true),
                  onPoints: () async {
                    final h = await showHotspotListSheet(context, scene: c.currentScene);
                    if (h != null && mounted) c.activateHotspot(c.currentScene, h);
                  },
                  onInfo: () => showTourInfoSheet(context, tour: tour, carSlug: widget.carSlug),
                ),
              ],
              if (_fullscreen)
                PositionedDirectional(
                  top: 0,
                  end: 0,
                  child: SafeArea(
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.sm),
                      child: _GlassButton(
                        icon: Icons.fullscreen_exit,
                        tooltip: l10n.toursFullscreenExit,
                        onPressed: () => _setFullscreen(false),
                      ),
                    ),
                  ),
                ),
              if (_fullscreen && tour.card.isDemo)
                PositionedDirectional(
                  top: 0,
                  start: 0,
                  child: SafeArea(
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.sm),
                      child: Pill(label: TourLabels.demo(l10n, tour.card), icon: Icons.science_outlined, tone: AppTone.demo),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LoadingOverlay extends StatelessWidget {
  const _LoadingOverlay({required this.tour});

  final TourDetail tour;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return IgnorePointer(
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: RadialGradient(colors: [Color(0xFF0B1A3A), _kViewerBackground], radius: 1.1),
        ),
        child: Center(
          child: Semantics(
            liveRegion: true,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox.square(dimension: 56, child: CircularProgressIndicator(strokeWidth: 3)),
                const SizedBox(height: AppSpacing.lg),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
                  child: Text(
                    l10n.toursLoading,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleMedium?.copyWith(color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FailureOverlay extends StatelessWidget {
  const _FailureOverlay({required this.controller, required this.carSlug});

  final TourViewerController controller;
  final String carSlug;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final (icon, title, message, canRetry) = switch (controller.failure) {
      ViewerFailure.webglUnsupported => (Icons.videocam_off_outlined, l10n.toursWebglTitle, l10n.toursWebglMessage, false),
      ViewerFailure.noSuitableImage => (Icons.photo_size_select_large, l10n.toursNoImageTitle, l10n.toursNoImageMessage, false),
      _ => (Icons.error_outline, l10n.toursLoadFailedTitle, l10n.toursLoadFailedMessage, true),
    };
    return ColoredBox(
      color: _kViewerBackground,
      child: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.sm),
                child: _GlassButton(
                  icon: Icons.adaptive.arrow_back,
                  tooltip: MaterialLocalizations.of(context).backButtonTooltip,
                  onPressed: () => Navigator.of(context).maybePop(),
                ),
              ),
            ),
            Expanded(
              child: Center(
                child: SingleChildScrollView(
                  child: EmptyState(
                    icon: icon,
                    title: title,
                    message: message,
                    actions: [
                      if (canRetry)
                        StateAction(label: l10n.commonRetry, icon: Icons.refresh, primary: true, onPressed: controller.retry),
                      StateAction(
                        label: l10n.toursOpenGallery,
                        icon: Icons.photo_library_outlined,
                        primary: !canRetry,
                        onPressed: () => context.pushReplacement(AppRoutes.carGallery(carSlug)),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Back, title, binding and notices over the top of the panorama.
class _TopChrome extends StatelessWidget {
  const _TopChrome({required this.tour, required this.scene, required this.onInfo});

  final TourDetail tour;
  final TourScene scene;
  final VoidCallback onInfo;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final landscape = context.isLandscape;
    final maxHeight = MediaQuery.sizeOf(context).height * (landscape ? 0.5 : 0.42);
    return Align(
      alignment: Alignment.topCenter,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xCC000000), Color(0x00000000)],
          ),
        ),
        child: SafeArea(
          bottom: false,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: maxHeight),
            child: SingleChildScrollView(
              padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.sm, AppSpacing.xs, AppSpacing.sm, AppSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _GlassButton(
                        icon: Icons.adaptive.arrow_back,
                        tooltip: MaterialLocalizations.of(context).backButtonTooltip,
                        onPressed: () => Navigator.of(context).maybePop(),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Semantics(
                                header: true,
                                child: Text(
                                  tour.card.displayName,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                    shadows: const [Shadow(blurRadius: 6)],
                                  ),
                                ),
                              ),
                              Text(
                                TourLabels.scene(l10n, scene),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodySmall?.copyWith(color: Colors.white70),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      _GlassButton(icon: Icons.info_outline, tooltip: l10n.toursInfo, onPressed: onInfo),
                    ],
                  ),
                  if (tour.card.isDemo) ...[
                    const SizedBox(height: AppSpacing.sm),
                    DemoTourNotice(card: tour.card, compact: true),
                  ],
                  if (tour.isReference) ...[
                    const SizedBox(height: AppSpacing.sm),
                    ReferenceTrimNotice(card: tour.card, compact: true),
                  ],
                  if (!landscape) ...[
                    const SizedBox(height: AppSpacing.sm),
                    TourBindingPills(card: tour.card, onDark: true, dense: true),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Quality status, seat switcher, controls and credit line.
class _BottomChrome extends ConsumerWidget {
  const _BottomChrome({
    required this.controller,
    required this.hintVisible,
    required this.onFullscreen,
    required this.onPoints,
    required this.onInfo,
  });

  final TourViewerController controller;
  final bool hintVisible;
  final VoidCallback onFullscreen;
  final VoidCallback onPoints;
  final VoidCallback onInfo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final c = controller;
    final tour = c.tour;
    final scene = c.currentScene;
    final motionAvailable = ref.watch(platformCapabilitiesProvider).motionSensors;
    final credit = scene.attribution.displayText;
    final maxHeight = MediaQuery.sizeOf(context).height * (context.isLandscape ? 0.55 : 0.45);

    return Align(
      alignment: Alignment.bottomCenter,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.bottomCenter,
            end: Alignment.topCenter,
            colors: [Color(0xDD000000), Color(0x00000000)],
          ),
        ),
        child: SafeArea(
          top: false,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: maxHeight),
            child: SingleChildScrollView(
              reverse: true,
              padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.xl, AppSpacing.md, AppSpacing.sm),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AnimatedOpacity(
                    opacity: hintVisible ? 1 : 0,
                    duration: AppMotion.of(context, AppMotion.medium),
                    child: ExcludeSemantics(
                      excluding: !hintVisible,
                      child: Text(
                        l10n.toursDragHint,
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodySmall?.copyWith(color: Colors.white),
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Center(child: _QualityStatus(controller: c)),
                  if (tour.scenes.length > 1) ...[
                    const SizedBox(height: AppSpacing.md),
                    _SceneSwitcher(controller: c),
                  ],
                  const SizedBox(height: AppSpacing.md),
                  Wrap(
                    alignment: WrapAlignment.center,
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: [
                      _GlassButton(icon: Icons.zoom_out, tooltip: l10n.toursZoomOut, onPressed: () => c.zoom(zoomIn: false)),
                      _GlassButton(icon: Icons.zoom_in, tooltip: l10n.toursZoomIn, onPressed: () => c.zoom(zoomIn: true)),
                      _GlassButton(icon: Icons.center_focus_strong, tooltip: l10n.toursResetView, onPressed: c.resetView),
                      if (motionAvailable)
                        _GlassButton(
                          icon: c.motionState == MotionState.on ? Icons.screen_rotation_alt : Icons.screen_lock_rotation,
                          tooltip: c.motionState == MotionState.on ? l10n.toursMotionOn : l10n.toursMotionOff,
                          selected: c.motionState == MotionState.on,
                          onPressed: () {
                            final wasOn = c.motionState == MotionState.on;
                            c.toggleMotion();
                            if (!wasOn && c.motionState == MotionState.on) {
                              showAppSnackBar(context, l10n.toursMotionEnabled, icon: Icons.screen_rotation_alt);
                            }
                          },
                        ),
                      _GlassButton(
                        icon: Icons.touch_app_outlined,
                        tooltip: l10n.toursPoints,
                        badge: scene.hotspots.isEmpty ? null : '${scene.hotspots.length}',
                        onPressed: onPoints,
                      ),
                      _GlassButton(icon: Icons.fullscreen, tooltip: l10n.toursFullscreenEnter, onPressed: onFullscreen),
                    ],
                  ),
                  if (credit != null) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Semantics(
                      button: true,
                      label: l10n.toursCredit(credit),
                      hint: l10n.toursAttributionTitle,
                      excludeSemantics: true,
                      child: InkWell(
                        onTap: onInfo,
                        borderRadius: AppRadii.pill,
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(minHeight: kMinTouchTarget),
                          child: Center(
                            child: Text(
                              l10n.toursCredit(credit),
                              textAlign: TextAlign.center,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.labelSmall?.copyWith(color: Colors.white70),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _QualityStatus extends StatelessWidget {
  const _QualityStatus({required this.controller});

  final TourViewerController controller;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final c = controller;
    final q = c.shownQuality;
    if (q == null) return const SizedBox.shrink();
    final style = theme.textTheme.labelMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w600);

    if (c.fullFailed && q == PanoramaQuality.preview) {
      return _GlassPanel(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.warning_amber_rounded, color: Colors.white, size: 18),
            const SizedBox(width: AppSpacing.xs),
            Flexible(child: Text(l10n.toursHdFailed, style: style)),
            TextButton(
              onPressed: c.retryFull,
              style: TextButton.styleFrom(foregroundColor: Colors.white, minimumSize: const Size(48, 40)),
              child: Text(l10n.commonRetry),
            ),
          ],
        ),
      );
    }
    if (q == PanoramaQuality.preview && c.loadingFull) {
      final p = c.progress;
      final label = p == null
          ? l10n.toursLoadingHdUnknown
          : l10n.toursLoadingHd(AppFormatters.of(context).percent(p * 100) ?? '');
      return Semantics(
        container: true,
        liveRegion: true,
        label: label,
        excludeSemantics: true,
        child: _GlassPanel(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 280),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label, style: style, textAlign: TextAlign.center),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: AppRadii.pill,
                  child: LinearProgressIndicator(value: p, minHeight: 4, backgroundColor: Colors.white24),
                ),
              ],
            ),
          ),
        ),
      );
    }
    final hd = q != PanoramaQuality.preview;
    return Semantics(
      container: true,
      label: hd ? l10n.toursQualityHdSemantics : l10n.toursQualityPreviewSemantics,
      excludeSemantics: true,
      child: _GlassPanel(
        dense: true,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(hd ? Icons.hd_outlined : Icons.blur_on, color: Colors.white, size: 16),
            const SizedBox(width: 4),
            Text(hd ? l10n.toursQualityHd : l10n.toursQualityPreview, style: style),
          ],
        ),
      ),
    );
  }
}

/// Seat picker: each seat is a separate panorama (no fake 3D move).
class _SceneSwitcher extends StatelessWidget {
  const _SceneSwitcher({required this.controller});

  final TourViewerController controller;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final c = controller;
    return Semantics(
      container: true,
      label: l10n.toursSeatPicker,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final s in c.tour.scenes) ...[
              Padding(
                padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
                child: Semantics(
                  button: true,
                  selected: s.id == c.currentSceneId,
                  label: TourLabels.scene(l10n, s),
                  excludeSemantics: true,
                  child: Material(
                    color: s.id == c.currentSceneId ? Colors.white : Colors.black.withValues(alpha: 0.5),
                    shape: StadiumBorder(side: BorderSide(color: Colors.white.withValues(alpha: 0.5))),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () => c.selectScene(s.id),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(minHeight: kMinTouchTarget),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                s.id == c.currentSceneId ? Icons.check : TourLabels.seatIcon(s.position),
                                size: 18,
                                color: s.id == c.currentSceneId ? theme.colorScheme.primary : Colors.white,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                TourLabels.scene(l10n, s),
                                style: theme.textTheme.labelLarge?.copyWith(
                                  color: s.id == c.currentSceneId ? const Color(0xFF0B1220) : Colors.white,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _GlassPanel extends StatelessWidget {
  const _GlassPanel({required this.child, this.dense = false});

  final Widget child;
  final bool dense;

  @override
  Widget build(BuildContext context) => Container(
    padding: EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: dense ? 4 : AppSpacing.sm),
    decoration: BoxDecoration(
      color: Colors.black.withValues(alpha: 0.55),
      borderRadius: BorderRadius.circular(AppRadii.lg),
      border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
    ),
    child: child,
  );
}

/// 48dp round translucent button used over the panorama.
class _GlassButton extends StatelessWidget {
  const _GlassButton({required this.icon, required this.tooltip, required this.onPressed, this.selected = false, this.badge});

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool selected;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    Widget button = Material(
      color: selected ? primary : Colors.black.withValues(alpha: 0.5),
      shape: CircleBorder(side: BorderSide(color: Colors.white.withValues(alpha: selected ? 0.9 : 0.35))),
      clipBehavior: Clip.antiAlias,
      child: IconButton(
        tooltip: tooltip,
        isSelected: selected,
        onPressed: onPressed,
        constraints: const BoxConstraints.tightFor(width: 48, height: 48),
        icon: Icon(icon, color: Colors.white),
      ),
    );
    if (badge != null) {
      button = Badge(label: Text(badge!), offset: const Offset(-2, 2), child: button);
    }
    return button;
  }
}
