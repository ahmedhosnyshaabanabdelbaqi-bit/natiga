import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:intl/date_symbol_data_local.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/cache/cache_database.dart';
import '../core/settings/settings_controller.dart';
import 'di/providers.dart';

/// Async initialization before `runApp`: preferences, the SQLite cache,
/// app version and licence registration. Nothing here needs the network.
abstract final class Bootstrap {
  static Future<List<Override>> load() async {
    final prefs = await SharedPreferences.getInstance();

    CacheDatabase? db;
    try {
      db = await CacheDatabase.open();
    } on Exception catch (e) {
      // The app still works (in-memory cache); offline copies are not kept.
      debugPrint('EV Car News: cache database unavailable: $e');
    }

    String? version;
    try {
      final info = await PackageInfo.fromPlatform();
      version = info.buildNumber.isEmpty ? info.version : '${info.version}+${info.buildNumber}';
    } on Exception {
      version = null;
    }

    // Date symbols for every locale (Flutter's localizations load ar/en, this
    // also covers formatting before the first frame and in background code).
    await initializeDateFormatting();
    registerBundledLicenses();

    return [
      sharedPreferencesProvider.overrideWithValue(prefs),
      cacheDatabaseProvider.overrideWithValue(db),
      appVersionProvider.overrideWithValue(version),
    ];
  }

  /// Adds the licences of bundled assets (font, Pannellum) to the licence
  /// page shown from Settings.
  static void registerBundledLicenses() {
    LicenseRegistry.addLicense(() async* {
      yield LicenseEntryWithLineBreaks(const [
        'IBM Plex Sans Arabic (SIL Open Font License 1.1)',
      ], await rootBundle.loadString('assets/fonts/OFL.txt'));
      yield LicenseEntryWithLineBreaks(const [
        'Pannellum (MIT)',
      ], await rootBundle.loadString('assets/panorama/pannellum/COPYING'));
    });
  }
}
