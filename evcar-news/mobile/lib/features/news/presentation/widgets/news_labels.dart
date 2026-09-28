import '../../../../core/l10n/l10n.dart';
import '../../domain/article.dart';
import '../../domain/news_query.dart';

/// Display name of a content language code (`ar` / `en`); unknown codes are
/// shown as-is.
String newsLanguageName(AppLocalizations l10n, String? code) => switch (code) {
  'ar' => l10n.newsLanguageAr,
  'en' => l10n.newsLanguageEn,
  null => l10n.commonUnknown,
  _ => code.toUpperCase(),
};

/// Label of an article type (`ArticleTypes`); null for unknown types.
String? newsTypeLabel(AppLocalizations l10n, String? type) => switch (type) {
  ArticleTypes.news => l10n.newsTypeNews,
  ArticleTypes.review => l10n.newsTypeReview,
  ArticleTypes.testDrive => l10n.newsTypeTestDrive,
  ArticleTypes.buyingGuide => l10n.newsTypeBuyingGuide,
  ArticleTypes.explainer => l10n.newsTypeExplainer,
  ArticleTypes.opinion => l10n.newsTypeOpinion,
  _ => null,
};

String newsSortLabel(AppLocalizations l10n, NewsSort sort) => switch (sort) {
  NewsSort.latest => l10n.newsSortLatest,
  NewsSort.popular => l10n.newsSortPopular,
  NewsSort.oldest => l10n.newsSortOldest,
};

String newsCorrectionKindLabel(AppLocalizations l10n, String kind) => switch (kind) {
  CorrectionKinds.clarification => l10n.newsCorrectionKindClarification,
  CorrectionKinds.update => l10n.newsCorrectionKindUpdate,
  _ => l10n.newsCorrectionKindCorrection,
};
