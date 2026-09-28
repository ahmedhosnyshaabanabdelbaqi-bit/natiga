import 'package:flutter/painting.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:html/parser.dart' as html_parser;

import '../../../app/di/providers.dart';
import '../../../core/cache/saved_items_store.dart';
import '../domain/article.dart';
import 'offline_image_store.dart';

/// An article saved for offline reading.
class SavedArticle {
  const SavedArticle({
    required this.article,
    required this.savedAt,
    required this.lang,
    this.imageUrls = const [],
    this.imagesExpected = 0,
  });

  /// Full article JSON as it was when saved (text, credits, corrections…).
  final ArticleDetail article;

  /// UTC time of the save — always shown to the reader ("Saved on …").
  final DateTime savedAt;

  /// App language when it was saved.
  final String lang;

  /// Images stored on the device.
  final List<String> imageUrls;

  /// Images the article has (cover + inline).
  final int imagesExpected;

  bool get allImagesSaved => imageUrls.length >= imagesExpected;
}

/// Image URLs of an article worth keeping offline: the cover (default size)
/// and every inline `<img src>` of the body.
List<String> articleImageUrls(ArticleDetail article) {
  final urls = <String>{};
  final cover = article.coverImage;
  if (cover != null) urls.add(cover.url);
  if (article.bodyHtml.isNotEmpty) {
    final doc = html_parser.parseFragment(article.bodyHtml);
    for (final img in doc.querySelectorAll('img')) {
      final src = img.attributes['src']?.trim();
      if (src != null && src.isNotEmpty) urls.add(src);
    }
  }
  return urls.toList(growable: false);
}

/// Saves full articles (JSON + images) in [SavedItemsStore] (never purged
/// automatically) and [OfflineImageStore].
class SavedArticlesRepository {
  SavedArticlesRepository({required this.store, required this.images});

  final SavedItemsStore store;
  final OfflineImageStore images;

  static const type = SavedItemType.article;

  /// Saves [article]: JSON first (so text is available even if images fail),
  /// then the images. Re-saving refreshes the copy and `savedAt`.
  Future<SavedArticle> save(ArticleDetail article, {required String lang}) async {
    final urls = articleImageUrls(article);
    final saved = <String>[];
    for (final url in urls) {
      if (await images.save(url)) saved.add(url);
    }
    final item = await store.save(
      type: type,
      id: article.id,
      lang: lang,
      title: article.title,
      data: {'article': article.toJson(), 'images': saved, 'imagesExpected': urls.length},
    );
    return SavedArticle(
      article: article,
      savedAt: item.savedAt,
      lang: lang,
      imageUrls: saved,
      imagesExpected: urls.length,
    );
  }

  static SavedArticle? _fromItem(SavedItem item) {
    final article = ArticleDetail.tryParse(item.data['article']);
    if (article == null) return null;
    final images = item.data['images'];
    return SavedArticle(
      article: article,
      savedAt: item.savedAt,
      lang: item.lang,
      imageUrls: images is List ? images.whereType<String>().toList(growable: false) : const [],
      imagesExpected: item.data['imagesExpected'] is int ? item.data['imagesExpected'] as int : 0,
    );
  }

  /// Newest first; unreadable entries are skipped.
  Future<List<SavedArticle>> list() async {
    final items = await store.list(type: type);
    return [for (final i in items) ?_fromItem(i)];
  }

  /// Saved copy of the article with this slug or id; the copy in [lang] wins.
  Future<SavedArticle?> find(String slugOrId, {String? lang}) async {
    final matches = (await list()).where((s) => s.article.slug == slugOrId || s.article.id == slugOrId).toList();
    if (matches.isEmpty) return null;
    return matches.firstWhere((s) => s.lang == lang, orElse: () => matches.first);
  }

  /// Removes every saved copy of the article and the images no other saved
  /// article uses.
  Future<void> remove(String articleId) async {
    final all = await list();
    final removed = all.where((s) => s.article.id == articleId).toList();
    for (final s in removed) {
      await store.delete(type, articleId, lang: s.lang);
    }
    final stillUsed = {
      for (final s in all)
        if (s.article.id != articleId) ...s.imageUrls,
    };
    await images.remove({for (final s in removed) ...s.imageUrls}.difference(stillUsed));
  }

  /// Local images of a saved copy, by URL.
  Future<Map<String, ImageProvider>> localImages(SavedArticle saved) async {
    final out = <String, ImageProvider>{};
    for (final url in saved.imageUrls) {
      final provider = await images.providerFor(url);
      if (provider != null) out[url] = provider;
    }
    return out;
  }
}

final savedArticlesRepositoryProvider = Provider<SavedArticlesRepository>(
  (ref) =>
      SavedArticlesRepository(store: ref.watch(savedItemsStoreProvider), images: ref.watch(offlineImageStoreProvider)),
);
