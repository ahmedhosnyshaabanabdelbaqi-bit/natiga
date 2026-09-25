import '../json/json_readers.dart';

/// `meta` of a list response:
/// `{ "page", "pageSize", "total", "totalPages" }` or `{ "nextCursor" }`
/// for geo/infinite lists (ARCHITECTURE §4.3).
class PageMeta {
  const PageMeta({this.page, this.pageSize, this.total, this.totalPages, this.nextCursor});

  final int? page;
  final int? pageSize;
  final int? total;
  final int? totalPages;
  final String? nextCursor;

  bool get hasMore {
    if (nextCursor != null && nextCursor!.isNotEmpty) return true;
    final p = page;
    final tp = totalPages;
    return p != null && tp != null && p < tp;
  }

  factory PageMeta.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const PageMeta();
    return PageMeta(
      page: json.intOrNull('page'),
      pageSize: json.intOrNull('pageSize'),
      total: json.intOrNull('total'),
      totalPages: json.intOrNull('totalPages'),
      nextCursor: json.stringOrNull('nextCursor'),
    );
  }

  Map<String, dynamic> toJson() => {
    if (page != null) 'page': page,
    if (pageSize != null) 'pageSize': pageSize,
    if (total != null) 'total': total,
    if (totalPages != null) 'totalPages': totalPages,
    if (nextCursor != null) 'nextCursor': nextCursor,
  };
}

/// A page of items from a list endpoint.
class Paged<T> {
  const Paged({required this.items, this.meta = const PageMeta()});

  final List<T> items;
  final PageMeta meta;

  bool get isEmpty => items.isEmpty;
}
