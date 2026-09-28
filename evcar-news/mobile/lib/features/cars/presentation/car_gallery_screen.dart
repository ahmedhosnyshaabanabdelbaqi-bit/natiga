import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:photo_view/photo_view.dart';
import 'package:photo_view/photo_view_gallery.dart';

import '../../../app/di/providers.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../shared/widgets/kit.dart';
import '../application/cars_providers.dart';
import '../domain/catalog_models.dart';

/// Licensed photo gallery of a car (`/cars/:slug/gallery`) with zoom
/// (photo_view) and the credit of every photo. The API only returns ready,
/// licensed images — never panoramas or unlicensed pictures.
class CarGalleryScreen extends ConsumerWidget {
  const CarGalleryScreen({super.key, required this.slug});

  /// Car (model) slug.
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final key = MarketKey(slug, ref.watch(effectiveMarketProvider).code);
    final value = ref.watch(carDetailProvider(key));
    final car = value.value?.data;
    return AppScaffold.slivers(
      title: car == null ? l10n.carsGalleryTitle : l10n.carsGalleryOf(car.title),
      onRefresh: () async {
        ref.invalidate(carDetailProvider(key));
        try {
          await ref.read(carDetailProvider(key).future);
        } on Object {
          // Rendered below.
        }
      },
      slivers: [
        SliverAsyncStateView<CachedResult<CarDetail>>(
          value: value,
          onRetry: () => ref.invalidate(carDetailProvider(key)),
          isEmpty: (r) => _images(r.data).isEmpty,
          emptyIcon: Icons.photo_library_outlined,
          emptyTitle: l10n.carsGalleryEmptyTitle,
          emptyMessage: l10n.carsGalleryEmptyMessage,
          loading: Skeleton(
            child: Padding(
              padding: EdgeInsets.all(context.pageGutter),
              child: const Column(
                children: [
                  SkeletonBox(aspectRatio: 16 / 10),
                  SizedBox(height: AppSpacing.md),
                  SkeletonBox(aspectRatio: 16 / 10),
                ],
              ),
            ),
          ),
          builder: (context, r) {
            final images = _images(r.data);
            return SliverPadding(
              padding: EdgeInsets.symmetric(horizontal: context.pageGutter, vertical: AppSpacing.sm),
              sliver: SliverGrid.builder(
                gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 360,
                  mainAxisSpacing: AppSpacing.sm,
                  crossAxisSpacing: AppSpacing.sm,
                  childAspectRatio: 4 / 3,
                ),
                itemCount: images.length,
                itemBuilder: (context, i) => Semantics(
                  button: true,
                  label: images[i].alt ?? l10n.carsGalleryPhoto(i + 1, images.length),
                  excludeSemantics: true,
                  child: InkWell(
                    borderRadius: AppRadii.image,
                    onTap: () => Navigator.of(context, rootNavigator: true).push(
                      MaterialPageRoute<void>(
                        fullscreenDialog: true,
                        builder: (_) => GalleryViewer(images: images, initialIndex: i),
                      ),
                    ),
                    child: ImageWithFallback(
                      url: images[i].url,
                      credit: images[i].credit,
                      borderRadius: AppRadii.image,
                      aspectRatio: 4 / 3,
                      overlay: images[i].isDemo
                          ? const PositionedDirectional(top: 8, start: 8, child: DemoBadge(dense: true))
                          : null,
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  static List<CatalogImage> _images(CarDetail car) {
    final seen = <String>{};
    return [
      for (final i in [?car.heroImage, ...car.images])
        if (seen.add(i.url)) i,
    ];
  }
}

/// Full-screen swipe + pinch-zoom viewer with caption and credit.
class GalleryViewer extends ConsumerStatefulWidget {
  const GalleryViewer({super.key, required this.images, this.initialIndex = 0});

  final List<CatalogImage> images;
  final int initialIndex;

  @override
  ConsumerState<GalleryViewer> createState() => _GalleryViewerState();
}

class _GalleryViewerState extends ConsumerState<GalleryViewer> {
  late int _index = widget.initialIndex;
  late final _controller = PageController(initialPage: widget.initialIndex);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final factory = ref.watch(networkImageProviderFactory);
    final image = widget.images[_index];
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(l10n.carsGalleryPhoto(_index + 1, widget.images.length)),
      ),
      body: Column(
        children: [
          Expanded(
            child: PhotoViewGallery.builder(
              pageController: _controller,
              itemCount: widget.images.length,
              onPageChanged: (i) => setState(() => _index = i),
              backgroundDecoration: const BoxDecoration(color: Colors.black),
              builder: (context, i) => PhotoViewGalleryPageOptions(
                imageProvider: factory(widget.images[i].url),
                semanticLabel: widget.images[i].alt ?? l10n.carsGalleryPhoto(i + 1, widget.images.length),
                minScale: PhotoViewComputedScale.contained,
                maxScale: PhotoViewComputedScale.covered * 3,
                errorBuilder: (context, _, _) => Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.broken_image_outlined, color: Colors.white70, size: 48),
                      const SizedBox(height: AppSpacing.sm),
                      Text(l10n.commonImageUnavailable, style: const TextStyle(color: Colors.white70)),
                    ],
                  ),
                ),
              ),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (image.caption != null)
                    Text(image.caption!, style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white)),
                  if (image.credit != null)
                    Text(
                      l10n.commonImageCredit(image.credit!),
                      style: theme.textTheme.bodySmall?.copyWith(color: Colors.white70),
                    ),
                  if (image.isDemo) ...[const SizedBox(height: AppSpacing.xs), const DemoBadge(dense: true)],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
