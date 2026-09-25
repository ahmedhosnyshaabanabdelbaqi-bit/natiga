import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Reports whether the device has a network interface up.
///
/// This is a hint, not proof of internet access: API calls still map
/// transport failures to `ApiErrorKind.network`, which the UI treats as
/// "offline" too.
abstract interface class ConnectivityService {
  Future<bool> isOnline();
  Stream<bool> get onlineChanges;
}

class PlusConnectivityService implements ConnectivityService {
  PlusConnectivityService([Connectivity? connectivity]) : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  static bool _online(List<ConnectivityResult> results) => results.any((r) => r != ConnectivityResult.none);

  @override
  Future<bool> isOnline() async {
    try {
      return _online(await _connectivity.checkConnectivity());
    } on PlatformException {
      return true; // unknown → do not block the UI; requests will tell.
    } on MissingPluginException {
      return true;
    }
  }

  @override
  Stream<bool> get onlineChanges => _connectivity.onConnectivityChanged
      .map(_online)
      .handleError((Object _) {}, test: (e) => e is PlatformException || e is MissingPluginException);
}

/// Fixed-value implementation for tests.
class FakeConnectivityService implements ConnectivityService {
  FakeConnectivityService({this._online = true});

  bool _online;
  final _controller = StreamController<bool>.broadcast();

  void setOnline(bool value) {
    _online = value;
    _controller.add(value);
  }

  @override
  Future<bool> isOnline() async => _online;

  @override
  Stream<bool> get onlineChanges => _controller.stream;
}

final connectivityServiceProvider = Provider<ConnectivityService>((ref) => PlusConnectivityService());

/// `true` while a network interface is available.
final isOnlineProvider = StreamProvider<bool>((ref) async* {
  final service = ref.watch(connectivityServiceProvider);
  yield await service.isOnline();
  yield* service.onlineChanges.distinct();
});
