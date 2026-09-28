import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/painting.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;

import '../../../app/di/providers.dart';
import '../../../core/platform/platform_capabilities.dart';
import '../../../shared/widgets/image_with_fallback.dart' show isLoadableImageUrl;

/// Downloads the bytes of a public image URL.
typedef ImageDownloader = Future<Uint8List> Function(String url);

/// Images of articles saved for offline reading.
///
/// Explicitly saved content must keep working without a connection
/// (REQUIREMENTS §5/§19), so the images of a saved article are downloaded
/// into app storage instead of relying on the evictable HTTP image cache.
abstract interface class OfflineImageStore {
  /// Downloads and stores [url]; returns false when it could not be saved
  /// (the article is still saved, the image then shows its fallback offline).
  Future<bool> save(String url);

  /// Local image for [url], or null when it was not saved.
  Future<ImageProvider?> providerFor(String url);

  Future<bool> contains(String url);

  Future<void> remove(Iterable<String> urls);
}

/// Largest image accepted for offline storage.
const kMaxOfflineImageBytes = 15 * 1024 * 1024;

/// Stable file name for [url]: two 32-bit FNV-1a hashes (different offset
/// bases) → 16 hex chars. 32-bit arithmetic keeps it identical on every
/// platform (web ints are doubles).
String offlineImageFileName(String url) {
  int fnv(int basis) {
    var hash = basis;
    for (final b in utf8.encode(url)) {
      hash ^= b;
      hash = (hash * 0x01000193) & 0xFFFFFFFF;
    }
    return hash;
  }

  String hex(int v) => v.toRadixString(16).padLeft(8, '0');
  return '${hex(fnv(0x811C9DC5))}${hex(fnv(0x050C5D1F))}.img';
}

/// Files next to the offline database (`<db dir>/saved_article_images/`).
class FileOfflineImageStore implements OfflineImageStore {
  FileOfflineImageStore({required this.directory, required this.download});

  final Directory directory;
  final ImageDownloader download;

  File _file(String url) => File(p.join(directory.path, offlineImageFileName(url)));

  @override
  Future<bool> save(String url) async {
    if (!isLoadableImageUrl(url)) return false;
    final file = _file(url);
    if (file.existsSync()) return true;
    try {
      final bytes = await download(url);
      if (bytes.isEmpty || bytes.length > kMaxOfflineImageBytes) return false;
      await directory.create(recursive: true);
      // Write to a temp file first so a crash never leaves a truncated image.
      final tmp = File('${file.path}.part');
      await tmp.writeAsBytes(bytes, flush: true);
      await tmp.rename(file.path);
      return true;
    } on Object {
      return false;
    }
  }

  @override
  Future<ImageProvider?> providerFor(String url) async {
    final file = _file(url);
    return file.existsSync() ? FileImage(file) : null;
  }

  @override
  Future<bool> contains(String url) async => _file(url).existsSync();

  @override
  Future<void> remove(Iterable<String> urls) async {
    for (final url in urls) {
      final file = _file(url);
      try {
        if (file.existsSync()) await file.delete();
      } on FileSystemException {
        // Best effort; an orphan file is harmless.
      }
    }
  }
}

/// In-memory store (web preview, tests, or when the database is unavailable).
class MemoryOfflineImageStore implements OfflineImageStore {
  MemoryOfflineImageStore({required this.download});

  final ImageDownloader download;
  final Map<String, Uint8List> _images = {};

  @override
  Future<bool> save(String url) async {
    if (!isLoadableImageUrl(url)) return false;
    if (_images.containsKey(url)) return true;
    try {
      final bytes = await download(url);
      if (bytes.isEmpty || bytes.length > kMaxOfflineImageBytes) return false;
      _images[url] = bytes;
      return true;
    } on Object {
      return false;
    }
  }

  @override
  Future<ImageProvider?> providerFor(String url) async {
    final bytes = _images[url];
    return bytes == null ? null : MemoryImage(bytes);
  }

  @override
  Future<bool> contains(String url) async => _images.containsKey(url);

  @override
  Future<void> remove(Iterable<String> urls) async => urls.forEach(_images.remove);
}

/// Plain Dio for public images: no auth header, no API headers.
final offlineImageDownloaderProvider = Provider<ImageDownloader>((ref) {
  final dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      responseType: ResponseType.bytes,
      followRedirects: true,
      maxRedirects: 3,
    ),
  );
  final adapter = ref.watch(httpClientAdapterProvider);
  if (adapter != null) {
    dio.httpClientAdapter = adapter;
  }
  ref.onDispose(dio.close);
  return (url) async {
    final res = await dio.get<List<int>>(url);
    final type = res.headers.value(Headers.contentTypeHeader) ?? '';
    if (type.isNotEmpty && !type.startsWith('image/') && !type.startsWith('application/octet-stream')) {
      throw const FormatException('Not an image');
    }
    final data = res.data;
    if (data == null) throw const FormatException('Empty image');
    return data is Uint8List ? data : Uint8List.fromList(data);
  };
});

final offlineImageStoreProvider = Provider<OfflineImageStore>((ref) {
  final download = ref.watch(offlineImageDownloaderProvider);
  final db = ref.watch(cacheDatabaseProvider);
  if (db == null || !ref.watch(platformCapabilitiesProvider).offlineDatabase) {
    return MemoryOfflineImageStore(download: download);
  }
  final dir = Directory(p.join(p.dirname(db.db.path), 'saved_article_images'));
  return FileOfflineImageStore(directory: dir, download: download);
});
