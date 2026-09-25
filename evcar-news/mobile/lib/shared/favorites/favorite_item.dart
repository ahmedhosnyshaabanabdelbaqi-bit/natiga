import 'package:flutter/foundation.dart';

/// What can be a favorite — mirrors the backend enum `favorite_target_type`
/// (`backend/prisma/schema/personal.prisma`).
enum FavoriteType {
  article,
  model,
  variant,
  station,
  comparison,
  tour;

  /// Value used by the API.
  String get apiValue => name;

  static FavoriteType? fromApi(String? value) {
    for (final t in values) {
      if (t.name == value) return t;
    }
    return null;
  }
}

/// Identity of a favorite: type + target id (UUID of the article, model,
/// variant, station, comparison or tour).
@immutable
class FavoriteKey {
  const FavoriteKey(this.type, this.id);

  final FavoriteType type;
  final String id;

  String get storageKey => '${type.name}:$id';

  @override
  bool operator ==(Object other) => other is FavoriteKey && other.type == type && other.id == id;

  @override
  int get hashCode => Object.hash(type, id);

  @override
  String toString() => storageKey;
}

/// A favorite with a display snapshot, so the favorites list works offline
/// and without one request per item. The target screen always loads fresh
/// data when opened.
@immutable
class FavoriteItem {
  const FavoriteItem({
    required this.key,
    required this.title,
    this.subtitle,
    this.imageUrl,
    this.route,
    this.savedAt,
    this.localOnly = true,
  });

  final FavoriteKey key;
  final String title;
  final String? subtitle;
  final String? imageUrl;

  /// In-app location that opens the target (e.g. `AppRoutes.car(slug)`).
  final String? route;
  final DateTime? savedAt;

  /// Saved on this device only (guest, or not yet pushed to the account).
  final bool localOnly;

  FavoriteItem copyWith({bool? localOnly, DateTime? savedAt}) => FavoriteItem(
    key: key,
    title: title,
    subtitle: subtitle,
    imageUrl: imageUrl,
    route: route,
    savedAt: savedAt ?? this.savedAt,
    localOnly: localOnly ?? this.localOnly,
  );

  Map<String, Object?> toJson() => {
    'type': key.type.apiValue,
    'id': key.id,
    'title': title,
    'subtitle': subtitle,
    'imageUrl': imageUrl,
    'route': route,
    'savedAt': savedAt?.toUtc().toIso8601String(),
    'localOnly': localOnly,
  };

  /// Null for malformed entries (dropped, never crash).
  static FavoriteItem? tryFromJson(Object? json) {
    if (json is! Map) return null;
    final type = FavoriteType.fromApi(json['type'] as String?);
    final id = json['id'];
    final title = json['title'];
    if (type == null || id is! String || id.isEmpty || title is! String) return null;
    String? str(String k) => json[k] is String ? json[k] as String : null;
    return FavoriteItem(
      key: FavoriteKey(type, id),
      title: title,
      subtitle: str('subtitle'),
      imageUrl: str('imageUrl'),
      route: str('route'),
      savedAt: DateTime.tryParse(str('savedAt') ?? ''),
      localOnly: json['localOnly'] != false,
    );
  }
}
