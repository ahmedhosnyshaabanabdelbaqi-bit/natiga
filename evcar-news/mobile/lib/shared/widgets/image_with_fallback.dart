import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme/app_palette.dart';
import '../../app/theme/app_tokens.dart';
import '../../core/l10n/l10n.dart';

/// Builds the [ImageProvider] for a remote image URL. Disk-cached on
/// Android/iOS; tests override it (no network in widget tests), e.g. with a
/// provider that fails so the fallback is rendered.
final networkImageProviderFactory = Provider<ImageProvider Function(String url)>(
  (ref) =>
      (url) => CachedNetworkImageProvider(url),
);

/// Whether [url] may be loaded: https only (http only in debug builds for the
/// local MinIO/dev API). Anything else shows the fallback.
bool isLoadableImageUrl(String? url) {
  if (url == null) return false;
  final uri = Uri.tryParse(url.trim());
  if (uri == null || uri.host.isEmpty) return false;
  return uri.scheme == 'https' || (kDebugMode && uri.scheme == 'http');
}

/// Remote image with a skeleton while loading, a calm placeholder when it is
/// missing or fails, and the licence/credit line required for media
/// (REQUIREMENTS §5/§9: track the source and rights of media).
///
/// * Decodes at the displayed size (memory-friendly lists).
/// * [semanticLabel] = the image's alt text; `null` marks it decorative.
/// * [credit] is drawn over the bottom-start corner and read by screen
///   readers ("Image: Reuters").
///
/// ```dart
/// ImageWithFallback(
///   url: article.coverImage?.url,
///   semanticLabel: article.coverImage?.alt,
///   credit: article.coverImage?.credit,
///   aspectRatio: 16 / 9,
/// )
/// ```
class ImageWithFallback extends ConsumerWidget {
  const ImageWithFallback({
    super.key,
    required this.url,
    this.semanticLabel,
    this.credit,
    this.aspectRatio,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.borderRadius,
    this.fallbackIcon = Icons.image_outlined,
    this.showFallbackText = true,
    this.overlay,
  });

  final String? url;
  final String? semanticLabel;
  final String? credit;
  final double? aspectRatio;
  final double? width;
  final double? height;
  final BoxFit fit;
  final BorderRadius? borderRadius;
  final IconData fallbackIcon;

  /// Show "Image not available" under the icon when there is room.
  final bool showFallbackText;

  /// Drawn on top of the image (e.g. badges); not affected by the fallback.
  final Widget? overlay;

  bool get _isSmall => (height != null && height! < 96) || (width != null && width! < 140);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final factory = ref.watch(networkImageProviderFactory);
    final src = url?.trim();
    final creditText = credit?.trim();
    final hasCredit = creditText != null && creditText.isNotEmpty;

    // No LayoutBuilder here: cards using this widget must support intrinsic
    // sizing (HorizontalCardList uses IntrinsicHeight). Decode width = the
    // explicit width, or the screen width (upper bound) for flexible images.
    final Widget content0;
    if (!isLoadableImageUrl(src)) {
      content0 = _Fallback(icon: fallbackIcon, showText: showFallbackText, small: _isSmall);
    } else {
      final dpr = MediaQuery.devicePixelRatioOf(context);
      final logicalWidth = width ?? MediaQuery.sizeOf(context).width;
      final cacheWidth = logicalWidth.isFinite && logicalWidth > 0 ? (logicalWidth * dpr).round() : null;
      final provider = ResizeImage.resizeIfNeeded(cacheWidth, null, factory(src!));
      content0 = Image(
        image: provider,
        fit: fit,
        width: double.infinity,
        height: double.infinity,
        excludeFromSemantics: true,
        gaplessPlayback: true,
        frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
          if (wasSynchronouslyLoaded) return child;
          return AnimatedSwitcher(
            duration: AppMotion.of(context, AppMotion.medium),
            child: frame == null
                ? DecoratedBox(
                    key: const ValueKey('image-loading'),
                    decoration: BoxDecoration(color: context.palette.skeletonBase),
                    child: const SizedBox.expand(),
                  )
                : KeyedSubtree(key: const ValueKey('image-loaded'), child: child),
          );
        },
        errorBuilder: (context, error, stackTrace) => _Fallback(
          key: const ValueKey('image-failed'),
          icon: fallbackIcon,
          showText: showFallbackText,
          small: _isSmall,
        ),
      );
    }
    Widget content = content0;

    content = Stack(
      fit: StackFit.expand,
      children: [
        content,
        ?overlay,
        if (hasCredit)
          PositionedDirectional(start: 0, bottom: 0, child: _CreditLabel(text: l10n.commonImageCredit(creditText))),
      ],
    );

    if (borderRadius != null) content = ClipRRect(borderRadius: borderRadius!, child: content);
    if (aspectRatio != null) {
      content = AspectRatio(aspectRatio: aspectRatio!, child: content);
    } else {
      content = SizedBox(width: width, height: height, child: content);
    }
    if (aspectRatio != null && width != null) content = SizedBox(width: width, child: content);

    final alt = semanticLabel?.trim();
    final hasAlt = alt != null && alt.isNotEmpty;
    if (!hasAlt && !hasCredit) return ExcludeSemantics(child: content);
    return Semantics(
      image: true,
      label: [if (hasAlt) alt, if (hasCredit) l10n.commonImageCredit(creditText)].join('. '),
      excludeSemantics: true,
      child: content,
    );
  }
}

class _Fallback extends StatelessWidget {
  const _Fallback({super.key, required this.icon, required this.showText, required this.small});

  final IconData icon;
  final bool showText;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: AlignmentDirectional.topStart,
          end: AlignmentDirectional.bottomEnd,
          colors: [scheme.surfaceContainerHigh, scheme.surfaceContainer],
        ),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: small ? 22 : 32, color: scheme.outline),
            if (showText && !small) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                context.l10n.commonImageUnavailable,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textScaler: TextScaler.noScaling,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(color: scheme.outline),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CreditLabel extends StatelessWidget {
  const _CreditLabel({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 240),
      child: DecoratedBox(
        decoration: const BoxDecoration(
          color: Color(0x99000000),
          borderRadius: BorderRadiusDirectional.only(topEnd: Radius.circular(AppRadii.sm)),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            // Fixed small size: the credit must not cover the image at 200%.
            textScaler: TextScaler.noScaling,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(color: Colors.white, fontSize: 10),
          ),
        ),
      ),
    );
  }
}
