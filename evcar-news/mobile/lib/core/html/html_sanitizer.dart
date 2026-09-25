import 'package:html/dom.dart' as dom;
import 'package:html/parser.dart' as html_parser;

/// Allow-list sanitizer for article HTML (defence in depth: the backend
/// already sanitizes with `sanitize-html`, but the app never trusts content
/// it renders).
///
/// * Only structural/text tags survive; attributes are allow-listed per tag.
/// * `script`, `style`, forms, SVG/MathML, … are removed with their content.
/// * Embedded media (`iframe`, `video`, `audio`) are never rendered inline;
///   when their `src` is https they become a plain link ([mediaLinkText]).
/// * URLs must be `https:` (or `http:`/`mailto:` for links); relative URLs are
///   resolved against [baseUrl] or dropped.
/// * Unknown tags are unwrapped (their text is kept).
class HtmlSanitizer {
  HtmlSanitizer({this.baseUrl, this.mediaLinkText = 'Video', this.allowHttpImages = false});

  /// Base for relative URLs (e.g. `https://evcar.news`).
  final String? baseUrl;

  /// Text of the link that replaces embedded media.
  final String mediaLinkText;

  /// Allow `http:` image sources (development servers only).
  final bool allowHttpImages;

  static const _dropWithContent = {
    'script',
    'style',
    'noscript',
    'template',
    'object',
    'embed',
    'applet',
    'form',
    'input',
    'button',
    'select',
    'option',
    'textarea',
    'svg',
    'math',
    'link',
    'meta',
    'base',
    'head',
    'title',
    'frame',
    'frameset',
    'canvas',
    'dialog',
    'portal',
  };

  static const _mediaTags = {'iframe', 'video', 'audio', 'source', 'track', 'picture'};

  static const _globalAttrs = {'dir', 'lang'};

  static const _allowed = <String, Set<String>>{
    'p': {},
    'br': {},
    'hr': {},
    'div': {},
    'span': {},
    'strong': {},
    'b': {},
    'em': {},
    'i': {},
    'u': {},
    's': {},
    'del': {},
    'ins': {},
    'sub': {},
    'sup': {},
    'small': {},
    'mark': {},
    'abbr': {'title'},
    'h2': {},
    'h3': {},
    'h4': {},
    'h5': {},
    'h6': {},
    'ul': {},
    'ol': {'start'},
    'li': {},
    'blockquote': {},
    'q': {},
    'cite': {},
    'code': {},
    'pre': {},
    'figure': {},
    'figcaption': {},
    'table': {},
    'thead': {},
    'tbody': {},
    'tfoot': {},
    'tr': {},
    'caption': {},
    'th': {'colspan', 'rowspan', 'scope'},
    'td': {'colspan', 'rowspan'},
    'a': {'href', 'title'},
    'img': {'src', 'alt', 'width', 'height', 'title'},
  };

  /// `h1` is reserved for the article title rendered natively.
  static const _renamed = {'h1': 'h2'};

  String sanitize(String input) {
    final fragment = html_parser.parseFragment(input);
    final root = dom.Element.tag('div');
    for (final node in fragment.nodes) {
      _copy(node, root);
    }
    return root.innerHtml;
  }

  void _copy(dom.Node node, dom.Element parent) {
    if (node is dom.Text) {
      parent.append(dom.Text(node.data));
      return;
    }
    if (node is! dom.Element) return; // comments, doctype, …

    final tag = node.localName?.toLowerCase() ?? '';
    if (_dropWithContent.contains(tag)) return;

    if (_mediaTags.contains(tag)) {
      final src = _safeUrl(node.attributes['src'], allowHttp: false, allowMailto: false);
      if (src != null && (tag == 'iframe' || tag == 'video' || tag == 'audio')) {
        final p = dom.Element.tag('p');
        final a = dom.Element.tag('a')..attributes['href'] = src;
        a.append(dom.Text(mediaLinkText));
        p.append(a);
        parent.append(p);
      }
      return;
    }

    final name = _renamed[tag] ?? tag;
    final allowedAttrs = _allowed[name];
    if (allowedAttrs == null) {
      // Unknown tag: keep its children (text) but not the tag itself.
      for (final child in node.nodes) {
        _copy(child, parent);
      }
      return;
    }

    final out = dom.Element.tag(name);
    node.attributes.forEach((key, value) {
      final attr = key.toString().toLowerCase();
      if (!allowedAttrs.contains(attr) && !_globalAttrs.contains(attr)) return;
      if (attr == 'href') {
        final url = _safeUrl(value, allowHttp: true, allowMailto: true);
        if (url != null) out.attributes['href'] = url;
        return;
      }
      if (attr == 'src') {
        final url = _safeUrl(value, allowHttp: allowHttpImages, allowMailto: false);
        if (url != null) out.attributes['src'] = url;
        return;
      }
      if (attr == 'dir' && value != 'rtl' && value != 'ltr' && value != 'auto') return;
      if ((attr == 'colspan' || attr == 'rowspan' || attr == 'start' || attr == 'width' || attr == 'height') &&
          int.tryParse(value) == null) {
        return;
      }
      out.attributes[attr] = value;
    });

    // Images without a safe source are dropped; links without a safe href
    // are unwrapped (text kept).
    if (name == 'img' && !out.attributes.containsKey('src')) return;
    if (name == 'a' && !out.attributes.containsKey('href')) {
      for (final child in node.nodes) {
        _copy(child, parent);
      }
      return;
    }

    for (final child in node.nodes) {
      _copy(child, out);
    }
    parent.append(out);
  }

  String? _safeUrl(String? raw, {required bool allowHttp, required bool allowMailto}) {
    if (raw == null) return null;
    // Strip control characters and whitespace used to smuggle schemes
    // ("java\nscript:").
    final cleaned = raw.replaceAll(RegExp(r'[\u0000- \u007F-\u009F]'), '');
    if (cleaned.isEmpty) return null;
    Uri? uri = Uri.tryParse(cleaned);
    if (uri == null) return null;
    if (!uri.hasScheme) {
      final base = baseUrl == null ? null : Uri.tryParse(baseUrl!);
      if (base == null || cleaned.startsWith('//')) return null;
      uri = base.resolveUri(uri);
    }
    final scheme = uri.scheme.toLowerCase();
    final ok = scheme == 'https' || (allowHttp && scheme == 'http') || (allowMailto && scheme == 'mailto');
    if (!ok) return null;
    if ((scheme == 'https' || scheme == 'http') && uri.host.isEmpty) return null;
    return uri.toString();
  }
}
