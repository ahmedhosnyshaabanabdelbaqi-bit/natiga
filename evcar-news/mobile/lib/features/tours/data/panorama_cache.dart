import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;

import '../../../app/di/providers.dart';
import '../../../core/platform/platform_capabilities.dart';
import '../domain/viewer_protocol.dart';

/// Device storage limit for downloaded panorama files (REQUIREMENTS §19:
/// "حدّد حدود تخزين البانوراما على الهاتف"). Least-recently-viewed files are
/// evicted first. Multires tiles are not stored here (the WebView's HTTP
/// cache handles them under the system's own limit).
const kPanoramaCacheMaxBytes = 150 * 1024 * 1024;

/// Byte-limited LRU store of panorama files keyed by URL.
abstract interface class PanoramaCache {
  Future<Uint8List?> read(String url);

  Future<void> write(String url, Uint8List bytes);

  /// Total bytes stored.
  Future<int> sizeBytes();

  Future<void> clear();
}

/// Stable file name for [url] (two 32-bit FNV-1a hashes → 16 hex chars).
String panoramaCacheFileName(String url) {
  int fnv(int basis) {
    var hash = basis;
    for (final b in utf8.encode(url)) {
      hash ^= b;
      hash = (hash * 0x01000193) & 0xFFFFFFFF;
    }
    return hash;
  }

  String hex(int v) => v.toRadixString(16).padLeft(8, '0');
  return '${hex(fnv(0x811C9DC5))}${hex(fnv(0x050C5D1F))}.pano';
}

/// Files in `<cache database dir>/panorama_cache/`; the modification time is
/// the "last viewed" time used for eviction.
class FilePanoramaCache implements PanoramaCache {
  FilePanoramaCache({required this.directory, this.maxBytes = kPanoramaCacheMaxBytes});

  final Directory directory;
  final int maxBytes;

  File _file(String url) => File(p.join(directory.path, panoramaCacheFileName(url)));

  @override
  Future<Uint8List?> read(String url) async {
    final file = _file(url);
    try {
      if (!file.existsSync()) return null;
      final bytes = await file.readAsBytes();
      // Touch: mark as recently viewed.
      await file.setLastModified(DateTime.now());
      return bytes;
    } on FileSystemException {
      return null;
    }
  }

  @override
  Future<void> write(String url, Uint8List bytes) async {
    if (bytes.length > maxBytes) return;
    try {
      await directory.create(recursive: true);
      final file = _file(url);
      final tmp = File('${file.path}.part');
      await tmp.writeAsBytes(bytes, flush: true);
      await tmp.rename(file.path);
      await _evict(keep: file.path);
    } on FileSystemException {
      // Caching is best effort; the panorama is still shown.
    }
  }

  Future<void> _evict({String? keep}) async {
    if (!directory.existsSync()) return;
    final files = <(File, int, DateTime)>[];
    await for (final e in directory.list()) {
      if (e is! File) continue;
      if (e.path.endsWith('.part') && e.path != keep) {
        // Left over from a crash.
        try {
          await e.delete();
        } on FileSystemException {
          // ignore
        }
        continue;
      }
      final stat = e.statSync();
      files.add((e, stat.size, stat.modified));
    }
    var total = files.fold<int>(0, (s, f) => s + f.$2);
    if (total <= maxBytes) return;
    files.sort((a, b) => a.$3.compareTo(b.$3)); // oldest first
    for (final (file, size, _) in files) {
      if (total <= maxBytes) break;
      if (file.path == keep) continue;
      try {
        await file.delete();
        total -= size;
      } on FileSystemException {
        // ignore
      }
    }
  }

  @override
  Future<int> sizeBytes() async {
    if (!directory.existsSync()) return 0;
    var total = 0;
    await for (final e in directory.list()) {
      if (e is File) total += e.statSync().size;
    }
    return total;
  }

  @override
  Future<void> clear() async {
    try {
      if (directory.existsSync()) await directory.delete(recursive: true);
    } on FileSystemException {
      // ignore
    }
  }
}

/// In-memory LRU (web preview, tests, no database).
class MemoryPanoramaCache implements PanoramaCache {
  MemoryPanoramaCache({this.maxBytes = 48 * 1024 * 1024});

  final int maxBytes;
  final LinkedHashMap<String, Uint8List> _items = LinkedHashMap();

  @override
  Future<Uint8List?> read(String url) async {
    final v = _items.remove(url);
    if (v != null) _items[url] = v; // most recent last
    return v;
  }

  @override
  Future<void> write(String url, Uint8List bytes) async {
    if (bytes.length > maxBytes) return;
    _items.remove(url);
    _items[url] = bytes;
    var total = _items.values.fold<int>(0, (s, b) => s + b.length);
    while (total > maxBytes && _items.length > 1) {
      final oldest = _items.keys.first;
      total -= _items.remove(oldest)!.length;
    }
  }

  @override
  Future<int> sizeBytes() async => _items.values.fold<int>(0, (s, b) => s + b.length);

  @override
  Future<void> clear() async => _items.clear();

  @visibleForTesting
  List<String> get keys => _items.keys.toList();
}

/// Downloads [url]; [onProgress] gets (received, total or null).
typedef PanoramaDownloader =
    Future<Uint8List> Function(String url, {void Function(int received, int? total)? onProgress, CancelToken? cancel});

/// Why a panorama file was not loaded.
class PanoramaLoadException implements Exception {
  const PanoramaLoadException(this.reason);

  /// `origin`, `size`, `format`, `network`.
  final String reason;

  @override
  String toString() => 'PanoramaLoadException($reason)';
}

/// Whether [url] may be loaded for a tour served from [mediaOrigin]: https
/// (http only in debug builds, for a local backend) and on that origin.
bool isAllowedPanoramaUrl(String url, {String? mediaOrigin, bool allowInsecure = kDebugMode}) {
  final uri = Uri.tryParse(url);
  if (uri == null || uri.host.isEmpty || uri.userInfo.isNotEmpty) return false;
  if (uri.scheme != 'https' && !(allowInsecure && uri.scheme == 'http')) return false;
  if (mediaOrigin == null) return true;
  final origin = Uri.tryParse(mediaOrigin);
  if (origin == null || origin.host.isEmpty) return false;
  return uri.origin == origin.origin;
}

/// Cache-first loader with origin / size / signature checks.
class PanoramaLoader {
  PanoramaLoader({required this.cache, required this.download, this.allowInsecure = kDebugMode});

  final PanoramaCache cache;
  final PanoramaDownloader download;
  final bool allowInsecure;

  Future<Uint8List> load(
    String url, {
    String? mediaOrigin,
    void Function(int received, int? total)? onProgress,
    CancelToken? cancel,
  }) async {
    if (!isAllowedPanoramaUrl(url, mediaOrigin: mediaOrigin, allowInsecure: allowInsecure)) {
      throw const PanoramaLoadException('origin');
    }
    final cached = await cache.read(url);
    if (cached != null && sniffImageMime(cached) != null) return cached;
    Uint8List bytes;
    try {
      bytes = await download(url, onProgress: onProgress, cancel: cancel);
    } on PanoramaLoadException {
      rethrow;
    } on Object {
      throw const PanoramaLoadException('network');
    }
    if (bytes.isEmpty || bytes.length > kMaxPanoramaBytes) throw const PanoramaLoadException('size');
    if (sniffImageMime(bytes) == null) throw const PanoramaLoadException('format');
    await cache.write(url, bytes);
    return bytes;
  }
}

/// Plain Dio for public media (no auth / API headers), streamed with a size
/// cap so a wrong file can never exhaust memory.
final panoramaDownloaderProvider = Provider<PanoramaDownloader>((ref) {
  final dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 60),
      followRedirects: false,
    ),
  );
  final adapter = ref.watch(httpClientAdapterProvider);
  if (adapter != null) dio.httpClientAdapter = adapter;
  ref.onDispose(dio.close);
  return (url, {onProgress, cancel}) async {
    final res = await dio.get<ResponseBody>(
      url,
      cancelToken: cancel,
      options: Options(responseType: ResponseType.stream),
    );
    final body = res.data;
    if (body == null) throw const PanoramaLoadException('network');
    final type = res.headers.value(Headers.contentTypeHeader) ?? '';
    if (type.isNotEmpty && !type.startsWith('image/') && !type.startsWith('application/octet-stream')) {
      throw const PanoramaLoadException('format');
    }
    final total = int.tryParse(res.headers.value(Headers.contentLengthHeader) ?? '');
    if (total != null && total > kMaxPanoramaBytes) throw const PanoramaLoadException('size');
    final builder = BytesBuilder(copy: false);
    await for (final chunk in body.stream) {
      builder.add(chunk);
      if (builder.length > kMaxPanoramaBytes) throw const PanoramaLoadException('size');
      onProgress?.call(builder.length, total);
    }
    return builder.takeBytes();
  };
});

final panoramaCacheProvider = Provider<PanoramaCache>((ref) {
  final db = ref.watch(cacheDatabaseProvider);
  if (db == null || !ref.watch(platformCapabilitiesProvider).offlineDatabase) return MemoryPanoramaCache();
  return FilePanoramaCache(directory: Directory(p.join(p.dirname(db.db.path), 'panorama_cache')));
});

final panoramaLoaderProvider = Provider<PanoramaLoader>(
  (ref) => PanoramaLoader(cache: ref.watch(panoramaCacheProvider), download: ref.watch(panoramaDownloaderProvider)),
);
