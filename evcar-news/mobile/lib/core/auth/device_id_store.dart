import 'dart:convert';
import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Random per-installation id sent as `X-Device-Id` when signing in.
///
/// The server remembers devices (and IPs) that signed in successfully and
/// exempts them from the account-wide login lock that failed attempts from
/// other clients trigger — so strangers guessing a password cannot lock the
/// owner out. The id is random (not derived from hardware), never leaves the
/// app except in sign-in requests, and is only stored hashed by the server.
abstract interface class DeviceIdStore {
  Future<String> read();
}

/// 256-bit random id, base64url without padding (43 characters).
String generateDeviceId([Random? random]) {
  final r = random ?? Random.secure();
  final bytes = List<int>.generate(32, (_) => r.nextInt(256));
  return base64Url.encode(bytes).replaceAll('=', '');
}

final _shape = RegExp(r'^[A-Za-z0-9_-]{16,128}$');

/// Keeps the id in the platform keystore/keychain.
class SecureDeviceIdStore implements DeviceIdStore {
  SecureDeviceIdStore({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
          );

  static const _key = 'evcar.device.id.v1';

  final FlutterSecureStorage _storage;
  String? _cached;

  @override
  Future<String> read() async {
    final cached = _cached;
    if (cached != null) return cached;
    var id = await _storage.read(key: _key);
    if (id == null || !_shape.hasMatch(id)) {
      id = generateDeviceId();
      await _storage.write(key: _key, value: id);
    }
    return _cached = id;
  }
}

/// For tests and platforms without a keystore.
class InMemoryDeviceIdStore implements DeviceIdStore {
  InMemoryDeviceIdStore([String? id]) : _id = id ?? generateDeviceId();

  final String _id;

  @override
  Future<String> read() async => _id;
}
