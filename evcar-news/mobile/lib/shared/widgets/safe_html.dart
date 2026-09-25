import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart';

import '../../app/theme/text_scaling.dart';
import '../../core/html/html_sanitizer.dart';
import '../../core/l10n/l10n.dart';
import '../../core/links/external_links.dart';

/// Renders sanitized article HTML natively (no WebView, no JavaScript).
///
/// Links open in the external browser; embedded media become links
/// ([HtmlSanitizer]). Text scale follows the app/system setting, and
/// [readingScale] adds the article-reader font size control.
class SafeHtml extends StatefulWidget {
  const SafeHtml({super.key, required this.html, this.baseUrl, this.textStyle, this.readingScale = 1.0});

  final String html;
  final String? baseUrl;
  final TextStyle? textStyle;
  final double readingScale;

  @override
  State<SafeHtml> createState() => _SafeHtmlState();
}

class _SafeHtmlState extends State<SafeHtml> {
  String? _sanitized;
  String? _forHtml;
  String? _forLang;

  String _sanitize(BuildContext context) {
    final lang = context.languageCode;
    if (_sanitized == null || _forHtml != widget.html || _forLang != lang) {
      _sanitized = HtmlSanitizer(
        baseUrl: widget.baseUrl,
        mediaLinkText: context.l10n.commonExternalVideo,
        allowHttpImages: kDebugMode,
      ).sanitize(widget.html);
      _forHtml = widget.html;
      _forLang = lang;
    }
    return _sanitized!;
  }

  @override
  Widget build(BuildContext context) {
    final base = widget.textStyle ?? Theme.of(context).textTheme.bodyLarge;
    return MediaQuery.withClampedTextScaling(
      minScaleFactor: 0.8,
      maxScaleFactor: 3.0,
      child: Builder(
        builder: (context) {
          final scaler = MediaQuery.textScalerOf(context);
          return MediaQuery(
            data: MediaQuery.of(context).copyWith(textScaler: MultipliedTextScaler(scaler, widget.readingScale)),
            child: HtmlWidget(
              _sanitize(context),
              textStyle: base?.copyWith(height: 1.7),
              onTapUrl: (url) async {
                await openExternalUrl(context, url);
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
