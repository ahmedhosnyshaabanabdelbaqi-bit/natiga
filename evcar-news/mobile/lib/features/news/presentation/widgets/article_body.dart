import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart';
import 'package:html/dom.dart' as dom;

import '../../../../app/theme/text_scaling.dart';
import '../../../../core/html/html_sanitizer.dart';
import '../../../../core/links/external_links.dart';
import '../../../../shared/widgets/kit.dart';
import 'news_links.dart';
import 'reader_image.dart';

String _hex(Color c) => '#${(c.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';

/// Renders an article's HTML natively (no WebView, no JavaScript):
///
/// * sanitized again in the app ([HtmlSanitizer], defence in depth);
/// * images: natural size, credit (`title`) under the image, tap → zoom
///   viewer; offline copies are used when the article is saved;
/// * tables scroll horizontally with visible cell borders;
/// * allow-listed videos (YouTube-nocookie / Vimeo embeds) become a video
///   card that opens the site outside the app — nothing is loaded from the
///   video site until the reader taps;
/// * links: evcar.news pages open in the app, other sites after a
///   confirmation that shows the real destination;
/// * [fontScale] multiplies the system/app text size, [lineHeight] sets
///   the body line height (reader comfort settings).
class ArticleBody extends StatefulWidget {
  const ArticleBody({
    super.key,
    required this.html,
    this.baseUrl,
    this.fontScale = 1.0,
    this.lineHeight = 1.75,
    this.localImages = const {},
  });

  final String html;
  final String? baseUrl;
  final double fontScale;
  final double lineHeight;
  final Map<String, ImageProvider> localImages;

  @override
  State<ArticleBody> createState() => _ArticleBodyState();
}

class _ArticleBodyState extends State<ArticleBody> {
  String? _sanitized;
  String? _forHtml;
  String? _forLang;

  String _sanitize(BuildContext context) {
    final lang = context.languageCode;
    if (_sanitized == null || _forHtml != widget.html || _forLang != lang) {
      _sanitized = HtmlSanitizer(
        baseUrl: widget.baseUrl,
        mediaLinkText: context.l10n.newsWatchVideo,
        allowHttpImages: kDebugMode,
      ).sanitize(widget.html);
      _forHtml = widget.html;
      _forLang = lang;
    }
    return _sanitized!;
  }

  static String? _attr(dom.Element e, String name) {
    final v = e.attributes[name]?.trim();
    return (v == null || v.isEmpty) ? null : v;
  }

  Widget? _customWidget(BuildContext context, dom.Element e) {
    switch (e.localName) {
      case 'img':
        final src = _attr(e, 'src');
        if (src == null) return null;
        final w = int.tryParse(e.attributes['width'] ?? '');
        final h = int.tryParse(e.attributes['height'] ?? '');
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
          child: ReaderImage(
            url: src,
            alt: _attr(e, 'alt'),
            // The editor stores the credit line of inline images in `title`.
            rights: ImageRights(credit: _attr(e, 'title')),
            aspectRatio: (w != null && h != null && w > 0 && h > 0) ? w / h : null,
            localImages: widget.localImages,
          ),
        );
      case 'p':
        // The sanitizer turns an allowed embed into <p><a href=embed>…</a></p>.
        if (e.children.length == 1 &&
            e.children.first.localName == 'a' &&
            e.text.trim() == e.children.first.text.trim()) {
          final video = parseVideoEmbed(e.children.first.attributes['href']);
          if (video != null) return VideoCard(video: video);
        }
        return null;
      case 'a':
        final video = parseVideoEmbed(e.attributes['href']);
        if (video != null) return InlineCustomWidget(child: VideoCard(video: video));
        return null;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final border = _hex(scheme.outlineVariant);
    final headerBg = _hex(scheme.surfaceContainerHighest);
    final quoteBg = _hex(scheme.primaryContainer.withValues(alpha: 0.35));
    final muted = _hex(scheme.onSurfaceVariant);
    final link = _hex(scheme.primary);
    final base = theme.textTheme.bodyLarge?.copyWith(fontSize: 17, height: widget.lineHeight, color: scheme.onSurface);

    return MediaQuery.withClampedTextScaling(
      minScaleFactor: 0.8,
      maxScaleFactor: 3.2,
      child: Builder(
        builder: (context) {
          final scaler = MediaQuery.textScalerOf(context);
          return MediaQuery(
            data: MediaQuery.of(context).copyWith(textScaler: MultipliedTextScaler(scaler, widget.fontScale)),
            child: HtmlWidget(
              _sanitize(context),
              textStyle: base,
              rebuildTriggers: [widget.localImages, widget.lineHeight, scheme.brightness],
              customWidgetBuilder: (e) => _customWidget(context, e),
              customStylesBuilder: (e) => switch (e.localName) {
                'a' => {'color': link, 'text-decoration': 'underline'},
                'h2' => {'font-size': '1.35em', 'line-height': '1.4', 'margin': '1.2em 0 0.4em'},
                'h3' => {'font-size': '1.18em', 'line-height': '1.4', 'margin': '1em 0 0.3em'},
                'h4' || 'h5' || 'h6' => {'font-size': '1.05em', 'line-height': '1.4'},
                'p' => {'margin': '0 0 0.9em'},
                'blockquote' => {
                  'margin': '0.6em 0',
                  'padding': '8px 14px',
                  'background-color': quoteBg,
                  'font-style': 'italic',
                },
                'figure' => {'margin': '0.8em 0'},
                'figcaption' => {'font-size': '0.82em', 'color': muted, 'line-height': '1.5'},
                'table' => {'border': '1px solid $border', 'border-collapse': 'collapse', 'margin': '0.6em 0'},
                'th' => {
                  'border': '1px solid $border',
                  'padding': '6px 10px',
                  'background-color': headerBg,
                  'font-weight': 'bold',
                  'line-height': '1.45',
                },
                'td' => {'border': '1px solid $border', 'padding': '6px 10px', 'line-height': '1.45'},
                'caption' => {'font-size': '0.85em', 'color': muted, 'padding': '4px 0'},
                'code' => {'font-family': 'monospace', 'background-color': headerBg},
                'pre' => {'padding': '10px', 'background-color': headerBg},
                _ => null,
              },
              onTapUrl: (url) async {
                await openArticleLink(context, url);
                return true;
              },
              onErrorBuilder: (context, element, error) => const SizedBox.shrink(),
            ),
          );
        },
      ),
    );
  }
}

/// "Video thumbnail" of an allow-listed embed: a branded poster with a play
/// button that opens the video on its site (external app / browser).
class VideoCard extends StatelessWidget {
  const VideoCard({super.key, required this.video});

  final VideoEmbed video;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Semantics(
        button: true,
        link: true,
        label: '${l10n.newsWatchVideo}. ${l10n.newsVideoOpensIn(video.provider)}',
        excludeSemantics: true,
        child: Material(
          borderRadius: AppRadii.image,
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () => openExternalUrl(context, video.watchUrl),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AspectRatio(
                  aspectRatio: 16 / 9,
                  child: DecoratedBox(
                    decoration: BoxDecoration(gradient: palette.brandGradient),
                    child: Center(
                      child: Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.45), shape: BoxShape.circle),
                        child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 48),
                      ),
                    ),
                  ),
                ),
                ColoredBox(
                  color: theme.colorScheme.surfaceContainerHigh,
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    child: Row(
                      children: [
                        Icon(Icons.smart_display_outlined, color: theme.colorScheme.primary),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(l10n.newsWatchVideo, style: theme.textTheme.titleSmall),
                              Text(
                                '${l10n.newsVideoOpensIn(video.provider)} · ${l10n.newsVideoPrivacy(video.provider)}',
                                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                              ),
                            ],
                          ),
                        ),
                        const Icon(Icons.open_in_new, size: 20),
                      ],
                    ),
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
