import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_config/app_config_controller.dart';

/// Builds the image provider of the branding logo. Disk-cached network image
/// by default; tests override it (no network in widget tests).
final brandLogoImageProvider = Provider<ImageProvider Function(String url)>(
  (ref) =>
      (url) => CachedNetworkImageProvider(url),
);

/// App-bar title with the branding from `/app-config` (REQUIREMENTS §1:
/// name, logo and colours editable in the admin): the uploaded logo next to
/// the app name. Without a logo — or when it cannot be loaded (offline, bad
/// URL) — only the name is shown.
class BrandTitle extends ConsumerWidget {
  const BrandTitle({super.key});

  static const logoHeight = 28.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branding = ref.watch(appConfigProvider.select((c) => c.branding));
    final url = branding.logoUrl;
    final validUrl = url != null && (url.startsWith('https://') || url.startsWith('http://'));
    final name = Text(branding.appName, overflow: TextOverflow.ellipsis);
    if (!validUrl) return name;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Decorative: the app name next to it is what screen readers announce.
        ExcludeSemantics(
          child: Image(
            key: const ValueKey('brand-logo'),
            image: ref.watch(brandLogoImageProvider)(url),
            height: logoHeight,
            fit: BoxFit.contain,
            errorBuilder: (context, error, stackTrace) => const SizedBox.shrink(key: ValueKey('brand-logo-failed')),
          ),
        ),
        const SizedBox(width: 8),
        Flexible(child: name),
      ],
    );
  }
}
