import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../domain/station_query.dart';

/// Result of asking for / checking location access.
enum LocationAccess {
  /// While-in-use (or always) granted.
  granted,

  /// Not asked yet, or denied once (the OS may ask again).
  denied,

  /// Denied permanently — only the OS settings can change it.
  deniedForever,

  /// Location services are switched off on the device.
  serviceDisabled,

  /// The platform cannot provide a position (e.g. unsupported / error).
  unavailable,
}

/// Device location, behind an interface so tests never touch the plugin.
///
/// Privacy (REQUIREMENTS §19): the app asks for **while-in-use** access only
/// when the user taps "use my location" / "near me"; positions are kept in
/// memory for the current session and never written to storage or sent
/// anywhere except as the rounded search point of a stations request.
abstract interface class LocationService {
  /// Current status without prompting.
  Future<LocationAccess> check();

  /// Prompts for while-in-use access if the OS still allows it.
  Future<LocationAccess> request();

  /// One position fix (requires [LocationAccess.granted]); `null` on failure.
  Future<GeoPoint?> currentPosition();

  Future<bool> openAppSettings();

  Future<bool> openLocationSettings();
}

class GeolocatorLocationService implements LocationService {
  const GeolocatorLocationService();

  static LocationAccess _map(LocationPermission p) => switch (p) {
    LocationPermission.always || LocationPermission.whileInUse => LocationAccess.granted,
    LocationPermission.denied => LocationAccess.denied,
    LocationPermission.deniedForever => LocationAccess.deniedForever,
    LocationPermission.unableToDetermine => LocationAccess.unavailable,
  };

  @override
  Future<LocationAccess> check() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return LocationAccess.serviceDisabled;
      return _map(await Geolocator.checkPermission());
    } on Object {
      return LocationAccess.unavailable;
    }
  }

  @override
  Future<LocationAccess> request() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return LocationAccess.serviceDisabled;
      var p = await Geolocator.checkPermission();
      if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
      return _map(p);
    } on Object {
      return LocationAccess.unavailable;
    }
  }

  @override
  Future<GeoPoint?> currentPosition() async {
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 15)),
      );
      return GeoPoint(pos.latitude, pos.longitude);
    } on Object {
      return null;
    }
  }

  @override
  Future<bool> openAppSettings() async {
    try {
      return await Geolocator.openAppSettings();
    } on Object {
      return false;
    }
  }

  @override
  Future<bool> openLocationSettings() async {
    try {
      return await Geolocator.openLocationSettings();
    } on Object {
      return false;
    }
  }
}

/// Overridden in tests with a fake.
final locationServiceProvider = Provider<LocationService>((ref) => const GeolocatorLocationService());
