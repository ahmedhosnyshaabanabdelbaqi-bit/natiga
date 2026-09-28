import 'package:flutter/foundation.dart';

import 'station_query.dart';

/// A city the user can pick when location is off or denied (REQUIREMENTS
/// §19: "choose a city or point manually").
///
/// These are the well-known geographic centres of the launch markets'
/// largest cities — reference geography, not station data. They only set the
/// point a search is centred on; which stations exist around it comes from
/// the API. Accuracy of a few km is enough for that purpose.
@immutable
class CityPreset {
  const CityPreset({
    required this.id,
    required this.marketCode,
    required this.nameAr,
    required this.nameEn,
    required this.lat,
    required this.lng,
  });

  final String id;
  final String marketCode;
  final String nameAr;
  final String nameEn;
  final double lat;
  final double lng;

  String name(String languageCode) => languageCode == 'ar' ? nameAr : nameEn;

  GeoPoint get point => GeoPoint(lat, lng);

  SearchPlace toPlace(String languageCode, {PlaceKind kind = PlaceKind.city}) =>
      SearchPlace(point: point, kind: kind, label: name(languageCode), cityId: id);
}

const cityPresets = <CityPreset>[
  // Egypt
  CityPreset(id: 'eg-cairo', marketCode: 'EG', nameAr: 'القاهرة', nameEn: 'Cairo', lat: 30.0444, lng: 31.2357),
  CityPreset(id: 'eg-giza', marketCode: 'EG', nameAr: 'الجيزة', nameEn: 'Giza', lat: 30.0131, lng: 31.2089),
  CityPreset(id: 'eg-alexandria', marketCode: 'EG', nameAr: 'الإسكندرية', nameEn: 'Alexandria', lat: 31.2001, lng: 29.9187),
  CityPreset(id: 'eg-new-cairo', marketCode: 'EG', nameAr: 'القاهرة الجديدة', nameEn: 'New Cairo', lat: 30.0074, lng: 31.4913),
  CityPreset(id: 'eg-sheikh-zayed', marketCode: 'EG', nameAr: 'الشيخ زايد', nameEn: 'Sheikh Zayed', lat: 30.0395, lng: 30.9876),
  CityPreset(id: 'eg-hurghada', marketCode: 'EG', nameAr: 'الغردقة', nameEn: 'Hurghada', lat: 27.2579, lng: 33.8116),
  // Saudi Arabia
  CityPreset(id: 'sa-riyadh', marketCode: 'SA', nameAr: 'الرياض', nameEn: 'Riyadh', lat: 24.7136, lng: 46.6753),
  CityPreset(id: 'sa-jeddah', marketCode: 'SA', nameAr: 'جدة', nameEn: 'Jeddah', lat: 21.4858, lng: 39.1925),
  CityPreset(id: 'sa-dammam', marketCode: 'SA', nameAr: 'الدمام', nameEn: 'Dammam', lat: 26.4207, lng: 50.0888),
  CityPreset(id: 'sa-makkah', marketCode: 'SA', nameAr: 'مكة المكرمة', nameEn: 'Makkah', lat: 21.3891, lng: 39.8579),
  CityPreset(id: 'sa-madinah', marketCode: 'SA', nameAr: 'المدينة المنورة', nameEn: 'Madinah', lat: 24.5247, lng: 39.5692),
  // United Arab Emirates
  CityPreset(id: 'ae-dubai', marketCode: 'AE', nameAr: 'دبي', nameEn: 'Dubai', lat: 25.2048, lng: 55.2708),
  CityPreset(id: 'ae-abu-dhabi', marketCode: 'AE', nameAr: 'أبوظبي', nameEn: 'Abu Dhabi', lat: 24.4539, lng: 54.3773),
  CityPreset(id: 'ae-sharjah', marketCode: 'AE', nameAr: 'الشارقة', nameEn: 'Sharjah', lat: 25.3463, lng: 55.4209),
  CityPreset(id: 'ae-al-ain', marketCode: 'AE', nameAr: 'العين', nameEn: 'Al Ain', lat: 24.2075, lng: 55.7447),
];

CityPreset? cityById(String? id) {
  if (id == null) return null;
  for (final c in cityPresets) {
    if (c.id == id) return c;
  }
  return null;
}

/// Cities of [marketCode] first, then the others.
List<CityPreset> citiesFor(String marketCode) => [
  ...cityPresets.where((c) => c.marketCode == marketCode),
  ...cityPresets.where((c) => c.marketCode != marketCode),
];

/// The default reference city for a market (first listed), or Cairo.
CityPreset defaultCityFor(String marketCode) =>
    cityPresets.firstWhere((c) => c.marketCode == marketCode, orElse: () => cityPresets.first);
