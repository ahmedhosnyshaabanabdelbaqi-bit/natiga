import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/settings/settings_controller.dart';

/// Line spacing presets of the article reader.
enum ReaderLineSpacing {
  compact(1.5),
  comfortable(1.75),
  relaxed(2.0);

  const ReaderLineSpacing(this.height);

  /// `TextStyle.height` of body text.
  final double height;
}

/// Colour scheme of the reader, independent of the app theme.
enum ReaderTheme { app, light, dark }

/// Reading comfort options (persisted on the device).
@immutable
class ReaderSettings {
  const ReaderSettings({
    this.fontScale = 1.0,
    this.lineSpacing = ReaderLineSpacing.comfortable,
    this.theme = ReaderTheme.app,
  });

  /// Multiplier on top of the system/app text size.
  final double fontScale;
  final ReaderLineSpacing lineSpacing;
  final ReaderTheme theme;

  static const minScale = 0.85;
  static const maxScale = 1.6;
  static const scaleStep = 0.15;

  bool get canShrink => fontScale > minScale + 0.001;
  bool get canGrow => fontScale < maxScale - 0.001;

  ReaderSettings copyWith({double? fontScale, ReaderLineSpacing? lineSpacing, ReaderTheme? theme}) => ReaderSettings(
    fontScale: fontScale ?? this.fontScale,
    lineSpacing: lineSpacing ?? this.lineSpacing,
    theme: theme ?? this.theme,
  );

  Map<String, Object> toJson() => {'fontScale': fontScale, 'lineSpacing': lineSpacing.name, 'theme': theme.name};

  /// Invalid or missing values fall back to the defaults.
  factory ReaderSettings.fromJson(Object? json) {
    if (json is! Map) return const ReaderSettings();
    final scale = json['fontScale'];
    return ReaderSettings(
      fontScale: scale is num ? scale.toDouble().clamp(minScale, maxScale) : 1.0,
      lineSpacing: ReaderLineSpacing.values.firstWhere(
        (s) => s.name == json['lineSpacing'],
        orElse: () => ReaderLineSpacing.comfortable,
      ),
      theme: ReaderTheme.values.firstWhere((t) => t.name == json['theme'], orElse: () => ReaderTheme.app),
    );
  }

  @override
  bool operator ==(Object other) =>
      other is ReaderSettings &&
      other.fontScale == fontScale &&
      other.lineSpacing == lineSpacing &&
      other.theme == theme;

  @override
  int get hashCode => Object.hash(fontScale, lineSpacing, theme);
}

class ReaderSettingsController extends Notifier<ReaderSettings> {
  static const storageKey = 'news.reader.v1';

  @override
  ReaderSettings build() {
    final raw = ref.watch(sharedPreferencesProvider).getString(storageKey);
    if (raw == null) return const ReaderSettings();
    try {
      return ReaderSettings.fromJson(jsonDecode(raw));
    } on FormatException {
      return const ReaderSettings();
    }
  }

  void _set(ReaderSettings next) {
    state = next;
    ref.read(sharedPreferencesProvider).setString(storageKey, jsonEncode(next.toJson()));
  }

  void grow() {
    if (state.canGrow) _set(state.copyWith(fontScale: _round(state.fontScale + ReaderSettings.scaleStep)));
  }

  void shrink() {
    if (state.canShrink) _set(state.copyWith(fontScale: _round(state.fontScale - ReaderSettings.scaleStep)));
  }

  void setLineSpacing(ReaderLineSpacing spacing) => _set(state.copyWith(lineSpacing: spacing));

  void setTheme(ReaderTheme theme) => _set(state.copyWith(theme: theme));

  void reset() => _set(const ReaderSettings());

  static double _round(double v) =>
      ((v * 100).round() / 100).clamp(ReaderSettings.minScale, ReaderSettings.maxScale).toDouble();
}

final readerSettingsProvider = NotifierProvider<ReaderSettingsController, ReaderSettings>(ReaderSettingsController.new);
