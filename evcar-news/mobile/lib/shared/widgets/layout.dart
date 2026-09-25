import 'package:flutter/material.dart';

import '../../app/theme/app_tokens.dart';

/// Horizontally scrolling row of equally tall cards (home carousels, "more
/// like this"). Items get [itemWidth] (scaled up a little at large text
/// sizes) and stretch to the tallest one, so nothing is clipped at 200%.
///
/// Meant for short lists (≤ ~12 items): it is not lazy. Children must
/// support intrinsic sizing — every card in this kit does (no
/// `LayoutBuilder` inside `CarCard`/`NewsCard` standard & compact).
class HorizontalCardList extends StatelessWidget {
  const HorizontalCardList({
    super.key,
    required this.children,
    this.itemWidth = 264,
    this.spacing = AppSpacing.cardGap,
    this.padding,
  });

  final List<Widget> children;
  final double itemWidth;
  final double spacing;

  /// Defaults to the page gutter.
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final scale = context.textScale.clamp(1.0, 1.6);
    final maxWidth = context.screenSize.width - 2 * context.pageGutter;
    final width = (itemWidth * scale).clamp(160.0, maxWidth > 160 ? maxWidth : 160.0);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: padding ?? EdgeInsets.symmetric(horizontal: context.pageGutter, vertical: AppSpacing.xs),
      clipBehavior: Clip.none,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) SizedBox(width: spacing),
              SizedBox(width: width, child: children[i]),
            ],
          ],
        ),
      ),
    );
  }
}

/// Number of grid columns for [width] when items need at least
/// [minItemWidth] (1 on phones, 2–4 on tablets / landscape).
int adaptiveColumnCount(double width, {double minItemWidth = 300, double spacing = AppSpacing.cardGap, int max = 4}) {
  final n = ((width + spacing) / (minItemWidth + spacing)).floor();
  return n.clamp(1, max);
}

/// Non-lazy responsive grid whose rows size to their tallest item (safe at
/// any text size). For long lists use a `SliverList` on phones and this (or
/// `SliverGrid` with `mainAxisExtent`) on wide screens.
class AdaptiveGrid extends StatelessWidget {
  const AdaptiveGrid({
    super.key,
    required this.children,
    this.minItemWidth = 300,
    this.spacing = AppSpacing.cardGap,
    this.maxColumns = 4,
  });

  final List<Widget> children;
  final double minItemWidth;
  final double spacing;
  final int maxColumns;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final cols = adaptiveColumnCount(
          constraints.maxWidth,
          minItemWidth: minItemWidth * context.textScale.clamp(1.0, 1.5),
          spacing: spacing,
          max: maxColumns,
        );
        if (cols == 1) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < children.length; i++) ...[if (i > 0) SizedBox(height: spacing), children[i]],
            ],
          );
        }
        final rows = <Widget>[];
        for (var start = 0; start < children.length; start += cols) {
          final end = (start + cols).clamp(0, children.length);
          rows.add(
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var i = start; i < start + cols; i++) ...[
                    if (i > start) SizedBox(width: spacing),
                    Expanded(child: i < end ? children[i] : const SizedBox.shrink()),
                  ],
                ],
              ),
            ),
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < rows.length; i++) ...[if (i > 0) SizedBox(height: spacing), rows[i]],
          ],
        );
      },
    );
  }
}
