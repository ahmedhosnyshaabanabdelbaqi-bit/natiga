import 'package:flutter/foundation.dart';

import '../../../core/json/json_readers.dart';
import '../../cars/domain/catalog_models.dart' show CatalogImage;

String? _text(Map<String, dynamic> j, String key) {
  final v = j.stringOrNull(key)?.trim();
  return (v == null || v.isEmpty) ? null : v;
}

/// Provider types of the directory (backend `service_provider_type`).
abstract final class ServiceTypes {
  static const serviceCenter = 'service_center';
  static const dealer = 'dealer';
  static const chargerInstaller = 'charger_installer';
  static const emergency = 'emergency';
  static const batteryService = 'battery_service';
  static const other = 'other';

  static const all = [serviceCenter, dealer, chargerInstaller, emergency, batteryService, other];
}

/// Open-now state computed by the server in the market's time zone.
enum ServiceOpenState {
  open,
  closed,
  unknown;

  static ServiceOpenState fromApi(String? v) => switch (v) {
    'open' => open,
    'closed' => closed,
    _ => unknown,
  };
}

/// `GET /services/types` item.
@immutable
class ServiceTypeCount {
  const ServiceTypeCount({required this.type, required this.label, this.count});

  final String type;
  final String label;
  final int? count;

  static ServiceTypeCount? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final type = _text(j, 'type');
    if (type == null) return null;
    return ServiceTypeCount(type: type, label: _text(j, 'label') ?? type, count: j.intOrNull('count'));
  }
}

/// Contact data + its verification (REQUIREMENTS §15).
@immutable
class ServiceContact {
  const ServiceContact({
    this.phone,
    this.whatsapp,
    this.email,
    this.websiteUrl,
    this.verified = false,
    this.verifiedAt,
    this.stale = false,
    this.label,
  });

  final String? phone;
  final String? whatsapp;
  final String? email;

  /// https only (enforced by the server; re-checked before opening).
  final String? websiteUrl;
  final bool verified;
  final DateTime? verifiedAt;

  /// Verified more than 12 months ago.
  final bool stale;

  /// Localized server label ("تم التحقق في 3 مارس 2026").
  final String? label;

  bool get hasAny => phone != null || whatsapp != null || email != null || websiteUrl != null;

  static ServiceContact fromJson(Map<String, dynamic>? j) {
    if (j == null) return const ServiceContact();
    return ServiceContact(
      phone: _text(j, 'phone'),
      whatsapp: _text(j, 'whatsapp'),
      email: _text(j, 'email'),
      websiteUrl: _text(j, 'websiteUrl'),
      verified: j.boolOr('verified', false),
      verifiedAt: j.dateTimeOrNull('verifiedAt'),
      stale: j.boolOr('stale', false),
      label: _text(j, 'label'),
    );
  }
}

@immutable
class ServiceBrandRef {
  const ServiceBrandRef({required this.id, required this.slug, required this.name});

  final String id;
  final String slug;
  final String name;

  static ServiceBrandRef? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final slug = _text(j, 'slug');
    final name = _text(j, 'name');
    if (slug == null || name == null) return null;
    return ServiceBrandRef(id: _text(j, 'id') ?? slug, slug: slug, name: name);
  }
}

/// One opening window `HH:MM`–`HH:MM` (end may be `24:00`).
@immutable
class HoursWindow {
  const HoursWindow(this.start, this.end);

  final String start;
  final String end;
}

/// Hours of one weekday: `windows == null` → unknown, `[]` → closed.
@immutable
class DayHours {
  const DayHours({required this.day, required this.windows});

  /// `mon` … `sun`.
  final String day;
  final List<HoursWindow>? windows;

  static DayHours? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final day = _text(j, 'day');
    if (day == null) return null;
    final raw = j['windows'];
    List<HoursWindow>? windows;
    if (raw is List) {
      windows = [
        for (final w in raw)
          if (w is Map && w['start'] is String && w['end'] is String) HoursWindow(w['start'] as String, w['end'] as String),
      ];
    }
    return DayHours(day: day, windows: windows);
  }
}

/// `ServiceProviderView` (list) / `ServiceProviderDetail` (detail).
@immutable
class ServiceProvider {
  const ServiceProvider({
    required this.id,
    required this.slug,
    required this.type,
    required this.typeLabel,
    required this.name,
    this.description,
    this.marketCode,
    this.city,
    this.address,
    this.latitude,
    this.longitude,
    this.distanceM,
    this.contact = const ServiceContact(),
    this.openNow = ServiceOpenState.unknown,
    this.isAlwaysOpen,
    this.services = const [],
    this.brands = const [],
    this.logo,
    this.isSponsored = false,
    this.sponsorLabel,
    this.isDemo = false,
    this.openingHours,
    this.timezone,
  });

  final String id;
  final String slug;
  final String type;
  final String typeLabel;
  final String name;
  final String? description;
  final String? marketCode;
  final String? city;
  final String? address;
  final double? latitude;
  final double? longitude;
  final double? distanceM;
  final ServiceContact contact;
  final ServiceOpenState openNow;
  final bool? isAlwaysOpen;
  final List<String> services;
  final List<ServiceBrandRef> brands;
  final CatalogImage? logo;

  /// Paid placement — always shown with its label, never reorders results.
  final bool isSponsored;
  final String? sponsorLabel;
  final bool isDemo;

  /// Detail only: null when the detail was not loaded or hours are unknown.
  final List<DayHours>? openingHours;
  final String? timezone;

  bool get hasLocation => latitude != null && longitude != null;

  static ServiceProvider? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final id = _text(j, 'id');
    final name = _text(j, 'name');
    final type = _text(j, 'type');
    if (id == null || name == null || type == null) return null;
    final hours = j['openingHours'];
    return ServiceProvider(
      id: id,
      slug: _text(j, 'slug') ?? id,
      type: type,
      typeLabel: _text(j, 'typeLabel') ?? type,
      name: name,
      description: _text(j, 'description'),
      marketCode: _text(j, 'marketCode'),
      city: _text(j, 'city'),
      address: _text(j, 'address'),
      latitude: j.doubleOrNull('latitude'),
      longitude: j.doubleOrNull('longitude'),
      distanceM: j.doubleOrNull('distanceM'),
      contact: ServiceContact.fromJson(j.objectOrNull('contact')),
      openNow: ServiceOpenState.fromApi(j.stringOrNull('openNow')),
      isAlwaysOpen: j.boolOrNull('isAlwaysOpen'),
      services: [
        for (final s in j.stringList('services'))
          if (s.trim().isNotEmpty) s.trim(),
      ],
      brands: [for (final b in (j['brands'] is List ? j['brands'] as List : const [])) ?ServiceBrandRef.tryParse(b)],
      logo: CatalogImage.tryParse(j['logo']),
      isSponsored: j.boolOr('isSponsored', false),
      sponsorLabel: _text(j, 'sponsorLabel'),
      isDemo: j.boolOr('isDemo', false),
      openingHours: hours is List ? [for (final d in hours) ?DayHours.tryParse(d)] : null,
      timezone: _text(j, 'timezone'),
    );
  }
}

/// Filters of `GET /services`.
@immutable
class ServiceFilters {
  const ServiceFilters({this.type, this.city, this.q, this.lat, this.lng, this.openNow = false});

  final String? type;
  final String? city;
  final String? q;

  /// "Near me" point (rounded; kept in memory only).
  final double? lat;
  final double? lng;
  final bool openNow;

  bool get nearMe => lat != null && lng != null;

  int get activeCount => [type != null, city != null, nearMe, openNow].where((b) => b).length;

  ServiceFilters copyWith({
    String? Function()? type,
    String? Function()? city,
    String? Function()? q,
    ({double lat, double lng})? Function()? point,
    bool? openNow,
  }) {
    final p = point == null ? (lat != null && lng != null ? (lat: lat!, lng: lng!) : null) : point();
    return ServiceFilters(
      type: type == null ? this.type : type(),
      city: city == null ? this.city : city(),
      q: q == null ? this.q : q(),
      lat: p?.lat,
      lng: p?.lng,
      openNow: openNow ?? this.openNow,
    );
  }

  Map<String, dynamic> toQuery({required int page, required int pageSize}) => {
    'type': ?type,
    'city': ?city,
    if (q != null && q!.trim().isNotEmpty) 'q': q!.trim(),
    if (nearMe) 'lat': lat!.toStringAsFixed(3),
    if (nearMe) 'lng': lng!.toStringAsFixed(3),
    if (openNow) 'openNow': 'true',
    'page': page,
    'pageSize': pageSize,
  };

  /// Cache discriminator (without the point — near-me lists are not cached).
  String get cacheKey => 'type=${type ?? ''}&city=${city ?? ''}&open=$openNow';

  @override
  bool operator ==(Object other) =>
      other is ServiceFilters &&
      other.type == type &&
      other.city == city &&
      other.q == q &&
      other.lat == lat &&
      other.lng == lng &&
      other.openNow == openNow;

  @override
  int get hashCode => Object.hash(type, city, q, lat, lng, openNow);
}
