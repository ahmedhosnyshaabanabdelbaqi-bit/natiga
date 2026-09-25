import 'package:flutter/material.dart';

import '../../app/theme/app_palette.dart';
import '../../app/theme/app_tokens.dart';
import '../../core/l10n/l10n.dart';

/// Animated placeholder for content that is loading.
///
/// Wrap one or more [SkeletonBox]/[SkeletonLine]/[SkeletonCircle] (or a
/// preset such as [NewsCardSkeleton]) in a single [Skeleton]: it paints the
/// shimmer, announces "Loading…" once to screen readers and hides the
/// placeholder shapes from them. The shimmer stops when the OS asks to
/// reduce animations.
///
/// ```dart
/// AsyncStateView(
///   value: articles,
///   loading: const Skeleton(child: SkeletonList(item: NewsCardSkeleton.compact())),
///   builder: …,
/// )
/// ```
class Skeleton extends StatefulWidget {
  const Skeleton({super.key, required this.child, this.semanticLabel});

  final Widget child;

  /// Defaults to "Loading…".
  final String? semanticLabel;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(vsync: this, duration: AppMotion.shimmer);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (AppMotion.enabled(context)) {
      if (!_controller.isAnimating) _controller.repeat();
    } else {
      _controller.stop();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final animate = AppMotion.enabled(context);
    final child = ExcludeSemantics(child: widget.child);
    return Semantics(
      label: widget.semanticLabel ?? context.l10n.commonLoading,
      liveRegion: true,
      container: true,
      child: !animate
          ? child
          : AnimatedBuilder(
              animation: _controller,
              child: child,
              builder: (context, child) {
                final t = _controller.value;
                return ShaderMask(
                  blendMode: BlendMode.srcATop,
                  shaderCallback: (bounds) => LinearGradient(
                    begin: Alignment(-1.5 + 3 * t, -0.3),
                    end: Alignment(-0.5 + 3 * t, 0.3),
                    colors: [palette.skeletonBase, palette.skeletonHighlight, palette.skeletonBase],
                    stops: const [0.1, 0.5, 0.9],
                  ).createShader(bounds),
                  child: child,
                );
              },
            ),
    );
  }
}

/// Rectangular placeholder shape.
class SkeletonBox extends StatelessWidget {
  const SkeletonBox({super.key, this.width, this.height, this.aspectRatio, this.radius = AppRadii.md});

  final double? width;
  final double? height;

  /// When set, height follows the width (e.g. 16 / 9 images).
  final double? aspectRatio;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final box = DecoratedBox(
      decoration: BoxDecoration(color: context.palette.skeletonBase, borderRadius: BorderRadius.circular(radius)),
    );
    if (aspectRatio != null) {
      return SizedBox(
        width: width,
        child: AspectRatio(aspectRatio: aspectRatio!, child: box),
      );
    }
    return SizedBox(width: width, height: height, child: box);
  }
}

/// One line of text placeholder. Height follows the text scale so the
/// skeleton has roughly the size of the real content.
class SkeletonLine extends StatelessWidget {
  const SkeletonLine({super.key, this.widthFactor = 1, this.fontSize = 14});

  /// Fraction of the available width.
  final double widthFactor;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.textScalerOf(context).scale(fontSize);
    return Padding(
      padding: EdgeInsets.symmetric(vertical: height * 0.25),
      child: FractionallySizedBox(
        alignment: AlignmentDirectional.centerStart,
        widthFactor: widthFactor,
        child: SkeletonBox(height: height, radius: AppRadii.xs),
      ),
    );
  }
}

/// Circular placeholder (avatars, icons).
class SkeletonCircle extends StatelessWidget {
  const SkeletonCircle({super.key, this.size = 40});

  final double size;

  @override
  Widget build(BuildContext context) => SkeletonBox(width: size, height: size, radius: size / 2);
}

/// Card-shaped container for skeleton presets (same shape as [AppCard]).
class SkeletonCard extends StatelessWidget {
  const SkeletonCard({super.key, required this.child, this.padding = const EdgeInsets.all(AppSpacing.md)});

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: AppRadii.card,
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Padding(padding: padding, child: child),
    );
  }
}

/// Placeholder matching [NewsCard] (see `news_card.dart`).
class NewsCardSkeleton extends StatelessWidget {
  const NewsCardSkeleton({super.key}) : compact = false;

  const NewsCardSkeleton.compact({super.key}) : compact = true;

  final bool compact;

  @override
  Widget build(BuildContext context) {
    if (compact) {
      return const SkeletonCard(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SkeletonBox(width: 104, height: 78),
            SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SkeletonLine(widthFactor: 0.35, fontSize: 11),
                  SkeletonLine(fontSize: 16),
                  SkeletonLine(widthFactor: 0.7, fontSize: 16),
                  SkeletonLine(widthFactor: 0.4, fontSize: 11),
                ],
              ),
            ),
          ],
        ),
      );
    }
    return const SkeletonCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SkeletonBox(aspectRatio: 16 / 9, radius: 0),
          Padding(
            padding: EdgeInsets.all(AppSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonLine(widthFactor: 0.3, fontSize: 11),
                SkeletonLine(fontSize: 18),
                SkeletonLine(widthFactor: 0.8, fontSize: 18),
                SkeletonLine(widthFactor: 0.5, fontSize: 12),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Placeholder matching the vertical [CarCard] (see `car_card.dart`).
class CarCardSkeleton extends StatelessWidget {
  const CarCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const SkeletonCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SkeletonBox(aspectRatio: 16 / 10, radius: 0),
          Padding(
            padding: EdgeInsets.all(AppSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonLine(widthFactor: 0.3, fontSize: 11),
                SkeletonLine(widthFactor: 0.8, fontSize: 17),
                SizedBox(height: AppSpacing.sm),
                Row(
                  children: [
                    Expanded(child: SkeletonLine(fontSize: 20)),
                    SizedBox(width: AppSpacing.sm),
                    Expanded(child: SkeletonLine(fontSize: 20)),
                    SizedBox(width: AppSpacing.sm),
                    Expanded(child: SkeletonLine(fontSize: 20)),
                  ],
                ),
                SkeletonLine(widthFactor: 0.5, fontSize: 16),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Placeholder for a list row (icon/avatar + two lines).
class ListTileSkeleton extends StatelessWidget {
  const ListTileSkeleton({super.key, this.leadingSize = 40});

  final double leadingSize;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
      child: Row(
        children: [
          SkeletonCircle(size: leadingSize),
          const SizedBox(width: AppSpacing.lg),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [SkeletonLine(widthFactor: 0.7, fontSize: 16), SkeletonLine(widthFactor: 0.45, fontSize: 12)],
            ),
          ),
        ],
      ),
    );
  }
}

/// [count] copies of [item] separated by [gap] — a non-scrolling column so it
/// can sit inside any scroll view (wrap it in [Skeleton]).
class SkeletonList extends StatelessWidget {
  const SkeletonList({
    super.key,
    required this.item,
    this.count = 4,
    this.gap = AppSpacing.cardGap,
    this.padding = const EdgeInsets.all(AppSpacing.gutter),
  });

  final Widget item;
  final int count;
  final double gap;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      physics: const NeverScrollableScrollPhysics(),
      padding: padding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < count; i++) ...[if (i > 0) SizedBox(height: gap), item],
        ],
      ),
    );
  }
}
