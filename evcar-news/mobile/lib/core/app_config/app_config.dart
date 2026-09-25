import 'package:flutter/foundation.dart';

import '../config/env.dart';
import '../json/json_readers.dart';

/// Parsed `GET /api/v1/app-config` (ARCHITECTURE §4.4.1). Hand-written
/// fromJson/toJson (no codegen).
@immutable
class AppConfig {
  const AppConfig({
    required this.branding,
    required this.languages,
    required this.defaultLanguage,
    required this.defaultMarket,
    required this.markets,
    required this.homeSections,
    required this.features,
    required this.map,
    required this.share,
    required this.legal,
  });

  final BrandingConfig branding;
  final List<String> languages;
  final String defaultLanguage;
  final String defaultMarket;
  final List<MarketConfig> markets;
  final List<HomeSectionConfig> homeSections;
  final Map<String, bool> features;
  final MapConfig map;
  final ShareConfig share;
  final LegalConfig legal;

  /// Feature flag; unknown flags are OFF (hidden), never assumed on.
  bool isFeatureEnabled(String key) => features[key] ?? false;

  List<MarketConfig> get enabledMarkets => markets.where((m) => m.enabled).toList(growable: false);

  MarketConfig? marketByCode(String? code) {
    if (code == null) return null;
    for (final m in markets) {
      if (m.code == code) return m;
    }
    return null;
  }

  /// Enabled home sections sorted by `order`.
  List<HomeSectionConfig> get orderedHomeSections =>
      (homeSections.where((s) => s.enabled).toList()..sort((a, b) => a.order.compareTo(b.order)));

  /// Built-in defaults used only until the server config is available.
  /// Contains product configuration (brand colours, launch markets from the
  /// requirements) — no content. Every feature flag is off and the map is
  /// "not configured" so nothing pretends to work.
  factory AppConfig.fallback() => const AppConfig(
    branding: BrandingConfig(appName: 'EV Car News', logoUrl: null, primaryColor: '#0A5CFF', accentColor: '#00C2E0'),
    languages: ['ar', 'en'],
    defaultLanguage: 'ar',
    defaultMarket: 'EG',
    markets: [
      MarketConfig(
        code: 'EG',
        nameAr: 'مصر',
        nameEn: 'Egypt',
        currency: 'EGP',
        timezone: 'Africa/Cairo',
        enabled: true,
      ),
      MarketConfig(
        code: 'SA',
        nameAr: 'السعودية',
        nameEn: 'Saudi Arabia',
        currency: 'SAR',
        timezone: 'Asia/Riyadh',
        enabled: true,
      ),
      MarketConfig(
        code: 'AE',
        nameAr: 'الإمارات',
        nameEn: 'United Arab Emirates',
        currency: 'AED',
        timezone: 'Asia/Dubai',
        enabled: true,
      ),
    ],
    homeSections: [],
    features: {},
    map: MapConfig(tileUrlTemplate: null, attribution: null, maxZoom: 18, configured: false),
    share: ShareConfig(baseUrl: Env.shareBaseUrl),
    legal: LegalConfig(privacyUrl: null, termsUrl: null),
  );

  factory AppConfig.fromJson(Map<String, dynamic> json) {
    final fb = AppConfig.fallback();
    final featuresJson = json.objectOrNull('features') ?? const {};
    final languages = json.stringList('languages');
    return AppConfig(
      branding: BrandingConfig.fromJson(json.objectOrNull('branding'), fb.branding),
      languages: languages.isEmpty ? fb.languages : languages,
      defaultLanguage: json.stringOrNull('defaultLanguage') ?? fb.defaultLanguage,
      defaultMarket: json.stringOrNull('defaultMarket') ?? fb.defaultMarket,
      // An explicit (even empty) list from the server wins; the built-in
      // launch markets are used only when the field is absent.
      markets: json['markets'] is List ? json.objectList('markets', MarketConfig.fromJson) : fb.markets,
      homeSections: json.objectList('homeSections', HomeSectionConfig.fromJson),
      features: {
        for (final e in featuresJson.entries)
          if (e.value is bool) e.key: e.value as bool,
      },
      map: MapConfig.fromJson(json.objectOrNull('map')),
      share: ShareConfig(baseUrl: json.objectOrNull('share')?.stringOrNull('baseUrl') ?? fb.share.baseUrl),
      legal: LegalConfig(
        privacyUrl: json.objectOrNull('legal')?.stringOrNull('privacyUrl'),
        termsUrl: json.objectOrNull('legal')?.stringOrNull('termsUrl'),
      ),
    );
  }

  Map<String, dynamic> toJson() => {
    'branding': branding.toJson(),
    'languages': languages,
    'defaultLanguage': defaultLanguage,
    'defaultMarket': defaultMarket,
    'markets': [for (final m in markets) m.toJson()],
    'homeSections': [for (final s in homeSections) s.toJson()],
    'features': features,
    'map': map.toJson(),
    'share': {'baseUrl': share.baseUrl},
    'legal': {'privacyUrl': legal.privacyUrl, 'termsUrl': legal.termsUrl},
  };
}

@immutable
class BrandingConfig {
  const BrandingConfig({
    required this.appName,
    required this.logoUrl,
    required this.primaryColor,
    required this.accentColor,
  });

  final String appName;
  final String? logoUrl;

  /// Hex strings (`#RRGGBB`); parsed by the theme with a safe fallback.
  final String primaryColor;
  final String accentColor;

  factory BrandingConfig.fromJson(Map<String, dynamic>? json, BrandingConfig fallback) {
    if (json == null) return fallback;
    return BrandingConfig(
      appName: json.stringOrNull('appName') ?? fallback.appName,
      logoUrl: json.stringOrNull('logoUrl'),
      primaryColor: json.stringOrNull('primaryColor') ?? fallback.primaryColor,
      accentColor: json.stringOrNull('accentColor') ?? fallback.accentColor,
    );
  }

  Map<String, dynamic> toJson() => {
    'appName': appName,
    'logoUrl': logoUrl,
    'primaryColor': primaryColor,
    'accentColor': accentColor,
  };
}

@immutable
class MarketConfig {
  const MarketConfig({
    required this.code,
    required this.nameAr,
    required this.nameEn,
    required this.currency,
    required this.timezone,
    required this.enabled,
  });

  final String code;
  final String nameAr;
  final String nameEn;
  final String currency;
  final String timezone;
  final bool enabled;

  String nameFor(String languageCode) => languageCode == 'ar' ? nameAr : nameEn;

  factory MarketConfig.fromJson(Map<String, dynamic> json) {
    final code = json.requireString('code');
    return MarketConfig(
      code: code,
      nameAr: json.stringOrNull('nameAr') ?? code,
      nameEn: json.stringOrNull('nameEn') ?? code,
      currency: json.stringOrNull('currency') ?? '',
      timezone: json.stringOrNull('timezone') ?? 'UTC',
      enabled: json.boolOr('enabled', true),
    );
  }

  Map<String, dynamic> toJson() => {
    'code': code,
    'nameAr': nameAr,
    'nameEn': nameEn,
    'currency': currency,
    'timezone': timezone,
    'enabled': enabled,
  };
}

@immutable
class HomeSectionConfig {
  const HomeSectionConfig({required this.key, required this.enabled, required this.order});

  final String key;
  final bool enabled;
  final int order;

  factory HomeSectionConfig.fromJson(Map<String, dynamic> json) => HomeSectionConfig(
    key: json.requireString('key'),
    enabled: json.boolOr('enabled', true),
    order: json.intOrNull('order') ?? 0,
  );

  Map<String, dynamic> toJson() => {'key': key, 'enabled': enabled, 'order': order};
}

@immutable
class MapConfig {
  const MapConfig({
    required this.tileUrlTemplate,
    required this.attribution,
    required this.maxZoom,
    required this.configured,
  });

  final String? tileUrlTemplate;
  final String? attribution;
  final int maxZoom;

  /// False → the map UI must show a "map not configured" state.
  final bool configured;

  bool get isUsable => configured && (tileUrlTemplate?.isNotEmpty ?? false);

  factory MapConfig.fromJson(Map<String, dynamic>? json) {
    if (json == null) {
      return const MapConfig(tileUrlTemplate: null, attribution: null, maxZoom: 18, configured: false);
    }
    return MapConfig(
      tileUrlTemplate: json.stringOrNull('tileUrlTemplate'),
      attribution: json.stringOrNull('attribution'),
      maxZoom: json.intOrNull('maxZoom') ?? 18,
      configured: json.boolOr('configured', false),
    );
  }

  Map<String, dynamic> toJson() => {
    'tileUrlTemplate': tileUrlTemplate,
    'attribution': attribution,
    'maxZoom': maxZoom,
    'configured': configured,
  };
}

@immutable
class ShareConfig {
  const ShareConfig({required this.baseUrl});

  /// e.g. `https://evcar.news`.
  final String baseUrl;

  String articleUrl(String slug) => '$baseUrl/n/${Uri.encodeComponent(slug)}';
  String carUrl(String slug) => '$baseUrl/cars/${Uri.encodeComponent(slug)}';
  String comparisonUrl(String shareId) => '$baseUrl/compare/${Uri.encodeComponent(shareId)}';
}

@immutable
class LegalConfig {
  const LegalConfig({required this.privacyUrl, required this.termsUrl});

  final String? privacyUrl;
  final String? termsUrl;
}
