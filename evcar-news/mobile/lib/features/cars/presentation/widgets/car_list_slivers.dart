import 'package:flutter/material.dart';

import '../../../../shared/widgets/kit.dart';
import '../../domain/catalog_models.dart';
import 'car_summary_card.dart';

/// Lazy list of car cards: one column on phones, 2–3 equal-height columns on
/// tablets / landscape. [onNearEnd] fires when the last row is built
/// (infinite scroll).
class SliverCarCards extends StatelessWidget {
  const SliverCarCards({super.key, required this.cars, this.onNearEnd});

  final List<CarSummary> cars;
  final VoidCallback? onNearEnd;

  @override
  Widget build(BuildContext context) {
    return SliverLayoutBuilder(
      builder: (context, constraints) {
        final gutter = AppSpacing.pageGutter(constraints.crossAxisExtent);
        final width = constraints.crossAxisExtent - 2 * gutter;
        final cols = adaptiveColumnCount(width, minItemWidth: 320 * context.textScale.clamp(1.0, 1.5), max: 3);
        final rows = (cars.length / cols).ceil();
        return SliverPadding(
          padding: EdgeInsets.symmetric(horizontal: gutter),
          sliver: SliverList.separated(
            itemCount: rows,
            separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.cardGap),
            itemBuilder: (context, row) {
              if (row == rows - 1 && onNearEnd != null) {
                WidgetsBinding.instance.addPostFrameCallback((_) => onNearEnd!());
              }
              if (cols == 1) {
                return CarSummaryCard(key: ValueKey(cars[row].id), car: cars[row]);
              }
              final start = row * cols;
              return IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var i = start; i < start + cols; i++) ...[
                      if (i > start) const SizedBox(width: AppSpacing.cardGap),
                      Expanded(
                        child: i < cars.length
                            ? CarSummaryCard(key: ValueKey(cars[i].id), car: cars[i])
                            : const SizedBox.shrink(),
                      ),
                    ],
                  ],
                ),
              );
            },
          ),
        );
      },
    );
  }
}

/// Skeleton shaped like the car list.
class CarListSkeleton extends StatelessWidget {
  const CarListSkeleton({super.key, this.count = 3});

  final int count;

  @override
  Widget build(BuildContext context) => Skeleton(
    child: SkeletonList(item: const CarCardSkeleton(), count: count),
  );
}
