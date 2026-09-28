import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/deep_links.dart';
import '../../../../core/links/external_links.dart';
import '../../../../shared/widgets/kit.dart';

/// An allow-listed embedded video (YouTube via youtube-nocookie, Vimeo)
/// shown as a tappable card that opens the video outside the app.
class VideoEmbed {
  const VideoEmbed({required this.provider, required this.watchUrl});

  /// Display name of the site (`YouTube`, `Vimeo`).
  final String provider;

  /// Public watch page (never the embed URL).
  final String watchUrl;
}

final _youTubeId = RegExp(r'^[A-Za-z0-9_-]{6,20}$');
final _vimeoId = RegExp(r'^\d{3,15}$');

/// Recognizes the embed URLs the backend allows (`youtube-nocookie.com/embed/…`,
/// `youtube.com/embed/…`, `player.vimeo.com/video/…`); null for anything else.
VideoEmbed? parseVideoEmbed(String? url) {
  if (url == null) return null;
  final uri = Uri.tryParse(url.trim());
  if (uri == null || uri.scheme != 'https') return null;
  final host = uri.host.toLowerCase();
  final seg = uri.pathSegments.where((s) => s.isNotEmpty).toList();
  if ((host == 'www.youtube-nocookie.com' ||
          host == 'youtube-nocookie.com' ||
          host == 'www.youtube.com' ||
          host == 'youtube.com') &&
      seg.length == 2 &&
      seg[0] == 'embed' &&
      _youTubeId.hasMatch(seg[1])) {
    final start = int.tryParse(uri.queryParameters['start'] ?? '');
    final watch = Uri.https('www.youtube.com', '/watch', {
      'v': seg[1],
      if (start != null && start > 0) 't': '${start}s',
    });
    return VideoEmbed(provider: 'YouTube', watchUrl: watch.toString());
  }
  if (host == 'player.vimeo.com' && seg.length == 2 && seg[0] == 'video' && _vimeoId.hasMatch(seg[1])) {
    return VideoEmbed(provider: 'Vimeo', watchUrl: 'https://vimeo.com/${seg[1]}');
  }
  return null;
}

/// In-app route for an evcar.news link (`/n/<slug>`, `/news/…`, `/cars/…`,
/// `/brands/…`, `/compare/<id>`), or null when it is not an app page.
String? inAppRouteForLink(Uri uri) {
  if (uri.scheme != 'https' && uri.scheme != 'http') return null;
  if (!deepLinkHosts.contains(uri.host.toLowerCase())) return null;
  final mapped = deepLinkRedirect(uri);
  if (mapped != null) return mapped;
  final seg = uri.pathSegments.where((s) => s.isNotEmpty).toList();
  if (seg.length >= 2 && const {'news', 'cars', 'brands', 'variants'}.contains(seg[0])) {
    return '/${seg.map(Uri.encodeComponent).join('/')}';
  }
  return null;
}

/// Opens a link tapped inside an article:
/// * evcar.news pages open in the app;
/// * web links open in the external browser after a sheet that shows the
///   real destination host (link text can differ from its target) and warns
///   about unencrypted `http`;
/// * `mailto:` opens the mail app. Anything else is ignored.
Future<void> openArticleLink(BuildContext context, String url) async {
  final uri = Uri.tryParse(url.trim());
  if (uri == null) return;
  final route = inAppRouteForLink(uri);
  if (route != null) {
    await context.push(route);
    return;
  }
  final scheme = uri.scheme.toLowerCase();
  if (scheme == 'mailto') {
    await openExternalUrl(context, uri.toString());
    return;
  }
  if ((scheme != 'https' && scheme != 'http') || uri.host.isEmpty) return;
  final l10n = context.l10n;
  final insecure = scheme == 'http';
  final ok = await showConfirmSheet(
    context: context,
    title: l10n.newsExternalLinkTitle,
    message: [l10n.newsExternalLinkMessage(uri.host), if (insecure) l10n.newsExternalLinkInsecure].join('\n\n'),
    confirmLabel: l10n.newsOpenLink,
    icon: insecure ? Icons.gpp_maybe_outlined : Icons.open_in_new,
  );
  if (ok && context.mounted) await openExternalUrl(context, uri.toString());
}
