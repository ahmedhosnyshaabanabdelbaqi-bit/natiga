import 'dart:async';

/// Session-level events raised by the networking layer.
enum SessionEvent {
  /// The refresh token was rejected or the session was revoked server-side;
  /// tokens have already been cleared.
  expired,
}

/// Broadcast bus between the API layer (which detects expiry) and the auth
/// controller (which updates UI state). Avoids a provider dependency cycle.
class SessionEvents {
  final _controller = StreamController<SessionEvent>.broadcast();

  Stream<SessionEvent> get stream => _controller.stream;

  void emit(SessionEvent event) {
    if (!_controller.isClosed) _controller.add(event);
  }

  Future<void> dispose() => _controller.close();
}
