import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sensors_plus/sensors_plus.dart';

/// One 3-axis sensor reading in device coordinates (x → right, y → top of
/// the device, z → out of the screen).
@immutable
class Vec3Sample {
  const Vec3Sample(this.x, this.y, this.z, this.timestamp);

  final double x;
  final double y;
  final double z;
  final DateTime timestamp;
}

/// Motion sensors used by the optional "look around by moving the phone"
/// mode. Implemented natively (sensors_plus) instead of the WebView's
/// DeviceOrientation API: iOS only grants that API to a user gesture inside
/// the page, and a native stream can be stopped reliably whenever the
/// viewer is hidden or the app goes to the background.
abstract interface class MotionSource {
  /// Angular velocity (rad/s).
  Stream<Vec3Sample> gyroscope();

  /// Acceleration including gravity (m/s²).
  Stream<Vec3Sample> accelerometer();
}

class SensorsPlusMotionSource implements MotionSource {
  const SensorsPlusMotionSource();

  @override
  Stream<Vec3Sample> gyroscope() => gyroscopeEventStream(
    samplingPeriod: SensorInterval.gameInterval,
  ).map((e) => Vec3Sample(e.x, e.y, e.z, e.timestamp));

  @override
  Stream<Vec3Sample> accelerometer() => accelerometerEventStream(
    samplingPeriod: SensorInterval.gameInterval,
  ).map((e) => Vec3Sample(e.x, e.y, e.z, e.timestamp));
}

final motionSourceProvider = Provider<MotionSource>((ref) => const SensorsPlusMotionSource());

/// Turns raw sensor samples into viewer motion (pure; unit tested).
///
/// * **Pitch** is absolute, from gravity: the camera looks out of the back
///   of the phone (−z); `sin(pitch) = −ẑ·â` where â is the low-pass
///   filtered accelerometer direction (points "up" at rest). Upright phone →
///   0°, phone facing the floor (screen down) → +90° (looking up).
/// * **Yaw** is relative: the gyroscope's rotation about the "up" axis is
///   integrated (`yawRate = −ω·â`), so it works in portrait and landscape
///   without knowing the screen rotation, and drag gestures keep working.
class MotionLookFilter {
  MotionLookFilter({this.smoothing = 0.15, this.deadZone = 0.015});

  /// Low-pass factor for the accelerometer (0..1, higher = faster).
  final double smoothing;

  /// Gyro rates below this (rad/s) are treated as noise.
  final double deadZone;

  double? _ax;
  double? _ay;
  double? _az;
  DateTime? _lastGyro;
  double _pendingYaw = 0;

  /// Feed an accelerometer sample.
  void addAccelerometer(Vec3Sample s) {
    if (_ax == null) {
      _ax = s.x;
      _ay = s.y;
      _az = s.z;
      return;
    }
    _ax = _ax! + smoothing * (s.x - _ax!);
    _ay = _ay! + smoothing * (s.y - _ay!);
    _az = _az! + smoothing * (s.z - _az!);
  }

  /// Feed a gyroscope sample; yaw accumulates until [takeYawDelta].
  void addGyroscope(Vec3Sample s) {
    final last = _lastGyro;
    _lastGyro = s.timestamp;
    final g = _gravityUnit();
    if (last == null || g == null) return;
    final dt = s.timestamp.difference(last).inMicroseconds / 1e6;
    if (dt <= 0 || dt > 0.25) return; // gap (paused / backgrounded)
    final rate = -(s.x * g.$1 + s.y * g.$2 + s.z * g.$3);
    if (rate.abs() < deadZone) return;
    _pendingYaw += rate * dt * 180 / math.pi;
  }

  (double, double, double)? _gravityUnit() {
    final x = _ax, y = _ay, z = _az;
    if (x == null || y == null || z == null) return null;
    final n = math.sqrt(x * x + y * y + z * z);
    if (n < 1e-3) return null;
    return (x / n, y / n, z / n);
  }

  /// Current pitch in degrees (−90..90), or null before the first sample.
  double? get pitch {
    final g = _gravityUnit();
    if (g == null) return null;
    return math.asin((-g.$3).clamp(-1.0, 1.0)) * 180 / math.pi;
  }

  /// Yaw change (degrees, positive = turn right) since the last call.
  double takeYawDelta() {
    final d = _pendingYaw;
    _pendingYaw = 0;
    return d;
  }

  void reset() {
    _ax = _ay = _az = null;
    _lastGyro = null;
    _pendingYaw = 0;
  }
}
