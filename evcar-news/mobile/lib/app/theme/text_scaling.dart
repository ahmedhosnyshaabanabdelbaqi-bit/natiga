import 'package:flutter/widgets.dart';

/// A [TextScaler] that multiplies another scaler (normally the system one)
/// by a user factor, preserving the platform's non-linear scaling.
///
/// Used for the in-app text size setting (applied on top of — never instead
/// of — the device font size) and the article reader's size control.
class MultipliedTextScaler extends TextScaler {
  const MultipliedTextScaler(this.base, this.factor);

  final TextScaler base;
  final double factor;

  @override
  double scale(double fontSize) => base.scale(fontSize) * factor;

  @override
  // ignore: deprecated_member_use
  double get textScaleFactor => base.textScaleFactor * factor;

  @override
  bool operator ==(Object other) => other is MultipliedTextScaler && other.base == base && other.factor == factor;

  @override
  int get hashCode => Object.hash(base, factor);

  @override
  String toString() => 'MultipliedTextScaler($base × $factor)';
}
