import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../l10n/l10n.dart';

/// Opens [url] outside the app (browser/mail/phone/maps). Only `https`,
/// `http`, `mailto`, `tel` and `geo` are allowed. Shows a snackbar if the URL
/// cannot be opened. Returns whether it was launched.
Future<bool> openExternalUrl(BuildContext context, String url) async {
  final uri = Uri.tryParse(url);
  const allowed = {'https', 'http', 'mailto', 'tel', 'geo'};
  var launched = false;
  if (uri != null && allowed.contains(uri.scheme.toLowerCase())) {
    try {
      launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } on Exception {
      launched = false;
    }
  }
  if (!launched && context.mounted) {
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(context.l10n.commonLinkOpenFailed)));
  }
  return launched;
}
