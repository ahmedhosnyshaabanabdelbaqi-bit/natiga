import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:photo_view/photo_view.dart';

import '../../../../app/theme/app_theme.dart';
import '../../../../core/links/external_links.dart';
import '../../../../shared/widgets/kit.dart';

/// Rights information shown with an image.
class ImageRights {
  const ImageRights({this.caption, this.credit, this.licenseType, this.licenseUrl, this.sourceUrl});

  final String? caption;
  final String? credit;
  final String? licenseType;
  final String? licenseUrl;
  final String? sourceUrl;

  bool get hasLinks => _https(licenseUrl) || _https(sourceUrl);
}

bool _https(String? url) => url != null && Uri.tryParse(url)?.scheme == 'https';

/// Resolves the image for [url]: the offline copy when saved, else the
/// network (https only). Null when nothing can be loaded.
ImageProvider? resolveReaderImage(WidgetRef ref, String? url, Map<String, ImageProvider> local) {
  if (url == null) return null;
  final saved = local[url];
  if (saved != null) return saved;
  if (!isLoadableImageUrl(url)) return null;
  return ref.watch(networkImageProviderFactory)(url);
}

/// Article image: natural aspect ratio (or [aspectRatio]), skeleton while
/// loading, calm fallback on failure, credit under the image, tap to open
/// the zoomable viewer.
class ReaderImage extends ConsumerWidget {
  const ReaderImage({
    super.key,
    required this.url,
    this.alt,
    this.rights = const ImageRights(),
    this.aspectRatio,
    this.localImages = const {},
    this.fallbackUrls = const [],
  });

  final String? url;
  final String? alt;
  final ImageRights rights;
  final double? aspectRatio;
  final Map<String, ImageProvider> localImages;

  /// Other sizes of the same image (a saved copy may hold one of them).
  final List<String> fallbackUrls;

  ImageProvider? _provider(WidgetRef ref) {
    for (final u in [?url, ...fallbackUrls]) {
      final local = localImages[u];
      if (local != null) return local;
    }
    return resolveReaderImage(ref, url, const {});
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final provider = _provider(ref);
    final ratio = aspectRatio ?? 16 / 9;

    Widget fallback() => AspectRatio(
      aspectRatio: ratio,
      child: ColoredBox(
        color: theme.colorScheme.surfaceContainerHighest,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.hide_image_outlined, color: theme.colorScheme.onSurfaceVariant),
              const SizedBox(height: AppSpacing.xs),
              Text(l10n.commonImageUnavailable, style: theme.textTheme.labelMedium),
            ],
          ),
        ),
      ),
    );

    Widget image;
    if (provider == null) {
      image = fallback();
    } else {
      final dpr = MediaQuery.devicePixelRatioOf(context);
      final decodeWidth = (MediaQuery.sizeOf(context).width * dpr).round();
      final img = Image(
        image: ResizeImage.resizeIfNeeded(decodeWidth, null, provider),
        fit: BoxFit.cover,
        width: double.infinity,
        excludeFromSemantics: true,
        gaplessPlayback: true,
        frameBuilder: (context, child, frame, sync) {
          if (sync || frame != null) return child;
          return AspectRatio(
            aspectRatio: ratio,
            child: ColoredBox(color: context.palette.skeletonBase),
          );
        },
        errorBuilder: (context, error, stack) => fallback(),
      );
      image = aspectRatio != null ? AspectRatio(aspectRatio: aspectRatio!, child: img) : img;
      image = Semantics(
        button: true,
        image: true,
        label: [l10n.newsImageOpen, ?alt].join(': '),
        onTapHint: l10n.newsImageOpen,
        excludeSemantics: true,
        child: InkWell(
          onTap: () => openImageViewer(context, provider: provider, alt: alt, rights: rights),
          child: image,
        ),
      );
    }

    final caption = rights.caption;
    final credit = rights.credit;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ClipRRect(borderRadius: AppRadii.image, child: image),
        if (caption != null || credit != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xs),
            child: Text.rich(
              TextSpan(
                children: [
                  if (caption != null) TextSpan(text: caption),
                  if (caption != null && credit != null) const TextSpan(text: '  ·  '),
                  if (credit != null)
                    TextSpan(
                      text: l10n.commonImageCredit(credit),
                      style: const TextStyle(fontStyle: FontStyle.italic),
                    ),
                ],
              ),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ),
      ],
    );
  }
}

/// Full-screen zoomable viewer (pinch / double-tap), with caption, credit and
/// licence/source links.
Future<void> openImageViewer(
  BuildContext context, {
  required ImageProvider provider,
  String? alt,
  ImageRights rights = const ImageRights(),
}) {
  return Navigator.of(context, rootNavigator: true).push(
    MaterialPageRoute<void>(
      fullscreenDialog: true,
      builder: (context) => ImageViewerScreen(provider: provider, alt: alt, rights: rights),
    ),
  );
}

class ImageViewerScreen extends StatelessWidget {
  const ImageViewerScreen({super.key, required this.provider, this.alt, this.rights = const ImageRights()});

  final ImageProvider provider;
  final String? alt;
  final ImageRights rights;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final text = [?rights.caption, if (rights.credit != null) l10n.commonImageCredit(rights.credit!)];
    return Theme(
      data: AppTheme.dark(),
      child: Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          foregroundColor: Colors.white,
          leading: IconButton(
            tooltip: l10n.commonClose,
            icon: const Icon(Icons.close),
            onPressed: () => Navigator.of(context).maybePop(),
          ),
        ),
        body: Column(
          children: [
            Expanded(
              child: Semantics(
                image: true,
                label: [?alt, l10n.newsImageViewerHint].join('. '),
                child: PhotoView(
                  imageProvider: provider,
                  backgroundDecoration: const BoxDecoration(color: Colors.black),
                  minScale: PhotoViewComputedScale.contained,
                  maxScale: PhotoViewComputedScale.covered * 4,
                  errorBuilder: (context, error, stack) => Center(
                    child: Text(l10n.commonImageUnavailable, style: const TextStyle(color: Colors.white)),
                  ),
                ),
              ),
            ),
            if (text.isNotEmpty || rights.hasLinks)
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, AppSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final t in text) Text(t, style: const TextStyle(color: Colors.white70)),
                      Wrap(
                        spacing: AppSpacing.sm,
                        children: [
                          if (_https(rights.licenseUrl))
                            TextButton.icon(
                              onPressed: () => openExternalUrl(context, rights.licenseUrl!),
                              icon: const Icon(Icons.gavel_outlined),
                              label: Text(
                                rights.licenseType == null
                                    ? l10n.newsImageLicense
                                    : '${l10n.newsImageLicense}: ${rights.licenseType}',
                              ),
                            ),
                          if (_https(rights.sourceUrl))
                            TextButton.icon(
                              onPressed: () => openExternalUrl(context, rights.sourceUrl!),
                              icon: const Icon(Icons.open_in_new),
                              label: Text(l10n.newsImageSource),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
