# Decisions — mobile news (Flutter)

Area: `mobile/lib/features/news/**`, `mobile/lib/l10n/parts/news_{ar,en}.arb`,
tests in `mobile/test/features/news/**` and `mobile/test/live/live_news_test.dart`.
Date: 2026-09-25. API contract: `docs/decisions/backend-articles.md` §1.1.
No dependency added. No router change (class names/constructors kept).

## 1. Screens

| Route | Class | What it does |
|---|---|---|
| `/news` (`?type=`, `?category=`) | `NewsListScreen` | Large title, filter bar (Filters sheet, "All" + top-level category chips from `GET /categories`, "Saved offline" chip), hero + list feed, infinite scroll, pull-to-refresh, cached-copy notice |
| `/news/category/:slug` | `NewsCategoryScreen` | Same feed scoped to the category (sub-categories included by the API); title/description from `GET /categories/:slug`; demo badge |
| `/news/tag/:slug` | `NewsTagScreen` | Same feed scoped to the tag; title `#name` from `GET /tags/:slug` |
| `/news/:slug` (deep link `https://evcar.news/n/<slug>`) | `ArticleDetailScreen` | Reader (below) |

All three list screens share `NewsBrowser` (`presentation/widgets/news_browser.dart`).
Filters sheet: sort (latest / most read / oldest), type (news, review,
test drive, buying guide, explainer, opinion), **all markets** switch
(`allMarkets=true`; default is the user's market + every-market news) and
**only my language** (`languageMode=strict`; default shows untranslated
articles in their original language with an "In English/بالعربية" pill).

States everywhere: skeleton shaped like the content, empty (specific message,
"Clear filters" when filtered), error with retry, offline (list: offers
"Open saved articles"; reader: says the article is not on the device),
404 → "Article not available" + "Browse all news". Permission-denied does not
apply to news (no device permission is used).

## 2. Reader

* Header: category chip (→ category page), type pill, sponsored label with
  sponsor name, demo badge + demo explanation, title, summary, **event date
  pill ("Event date: …") separate from "Published …"**, "Updated …"
  (`contentUpdatedAt`), author, reading time (only when > 0). Relative times
  with the exact date/time in tooltip and screen-reader label.
* Notices: fallback language ("Not available in Arabic yet, shown in
  English"), reviewed machine translation, market mismatch (`marketMatch=false`).
* Text of the article is laid out in **its own language direction**
  (`language`), so an English fallback text in the Arabic UI reads LTR.
* Cover image (best variant for the screen width) with caption, credit, and
  licence/source links in the zoom viewer.
* Body (`ArticleBody`): `flutter_widget_from_html_core`, native (no WebView,
  no JS), after the in-app `HtmlSanitizer` (defence in depth):
  - images: natural aspect ratio, skeleton, fallback, **credit from the
    `<img title>`** under the image, tap → full-screen `photo_view` viewer;
  - tables: bordered cells, header background, horizontal scroll;
  - video: the sanitizer turns the allowed iframes into links; links whose
    href is a `youtube-nocookie.com/embed/ID`, `youtube.com/embed/ID` or
    `player.vimeo.com/video/ID` become a **video card** (branded poster + play
    button) that opens `https://www.youtube.com/watch?v=ID[&t=Ns]` /
    `https://vimeo.com/ID` externally. **No third-party thumbnail is
    loaded** (i.ytimg.com etc.) — nothing reaches the video site until the
    reader taps; the card says so.
  - links: evcar.news pages (`/n/`, `/news/`, `/cars/`, `/brands/`,
    `/variants/`, `/compare/`) open in the app; other web links open in the
    external browser **after a sheet showing the real host** (and an
    "unencrypted http" warning); `mailto:` opens mail; everything else ignored.
* Reading comfort (`readerSettingsProvider`, SharedPreferences
  `news.reader.v1`): text size 85–160 % in 15 % steps (multiplies the
  system/app scale, never replaces it), line spacing compact/comfortable/
  relaxed (1.5/1.75/2.0), reader theme like-app/light/dark (wraps the reader
  in `AppTheme.light/dark` with the server branding colours). Live preview in
  the sheet.
* Below the body: source card (name, attribution, "Open the original
  source" — https only), corrections & updates (newest first, kind pill +
  date + note in its language direction), topics (→ tag page), cars in this
  article (brand → `/brands/:slug`, model → `/cars/:slug`, variant →
  `/variants/:slug`; not tappable while the cars flag is off), comments button
  (only when `allowComments` and the community flag is on), related articles
  carousel.
* App bar: reader settings, save offline (toggle; spinner while saving),
  favorite (`FavoriteButton`, `FavoriteType.article`, route
  `/news/<slug>`), share.
* Share text: `"<title>\n<url>"`, url = server `shareUrl` if it is https on
  `evcar.news`/`www.evcar.news` or the configured share host, else
  `<share.baseUrl>/n/<slug>` (so a bad server value can never share a
  foreign link). iPad popover origin passed.
* View counter: `POST /articles/:slug/view` once per opening, only after a
  **live** load (not for offline copies), best effort (errors ignored).

## 3. Offline

* Lists and articles use `fetchWithCache` (network first; cached copy on
  connectivity/timeout/5xx, keys include language + market + filters). A
  cached first page cannot load more pages (`hasMore=false`) and shows
  `CachedDataNotice`.
* **Save for offline** (`SavedArticlesRepository`): full article JSON
  (`ArticleDetail.toJson()`, same shape as the API) in `SavedItemsStore`
  (type `article`, id = article id, lang = app language; never purged) plus
  the images (cover default size + every inline `<img src>`) downloaded with a
  plain Dio (no auth/API headers, https only — http only in debug builds, ≤ 15
  MB, image content type) into `<db dir>/saved_article_images/<fnv>.img`
  (`FileOfflineImageStore`; memory store on the web preview / when the DB is
  unavailable). Text is saved even if images fail; the snackbar and the saved
  list say how many images are missing.
* Reader offline: the newer of the saved copy and the automatic cache wins;
  the page shows "Saved copy from …; it may not be up to date" with the exact
  time. Saved images are used before the network even online.
* When a saved article is opened online and the server copy changed
  (`updatedAt`, `contentUpdatedAt`, number of corrections or served
  language), the saved copy is refreshed in the background so corrections
  reach offline readers.
* Saved list: "Saved offline" chip on `/news` (also offered by the offline
  state). Each row: compact card, "Saved <time>" (exact time in semantics),
  missing-images warning, remove (confirmation). Works with no connection.
  `SavedArticlesSliver` / `SavedArticleTile` / `savedArticlesProvider` are
  public so the favorites feature can reuse them on `/saved`.
* Removing an article deletes its images unless another saved article uses
  the same URL.

## 4. Feed behaviour

* `NewsFeedController` (`AsyncNotifierProvider.autoDispose.family` keyed by
  `NewsQuery`): page size 20; the next page is requested when one of the last
  4 items is built; duplicates across pages (new articles shift pages) are
  dropped by id; a load-more failure keeps the list and shows an inline retry
  row; "You're all caught up" at the end. Language/market changes refetch
  (providers watch `requestLocaleProvider`).
* Card rhythm: hero first (latest, unfiltered feed), compact rows, every 6th
  item a standard card. Cards: cover + credit, category, relative time,
  sponsored/demo labels, type pill for non-news, "In <language>" pill for
  fallback texts, favorite toggle.
* Unknown filter values give an empty page (API contract), shown as the empty
  state — never an error.

## 5. Parsing rules (hand-written, `domain/article.dart`)

Only `slug` + `title` are required; a list item without them is skipped
(the page still renders). Missing/invalid optional values stay `null`/empty:
no invented dates, `readingMinutes: 0` → unknown (not "0 min read"),
unparsable `eventDate` → none. `eventDate` is a calendar date kept at local
noon so it never shifts a day across time zones. `toJson()` reproduces the API
shape (round-trip tested) for offline copies.

## 6. Tests

* `test/features/news/news_parsing_test.dart` (19): full/minimal/junk
  payloads, round trip, page/category parsing, image variants, calendar
  dates, query parameters, video embed mapping, in-app link mapping, share
  URL safety, reader settings clamp, image URL collection, file names.
* `test/features/news/news_offline_test.dart` (9): real SQLite (ffi) + temp
  directory: save/list/find/remove with `savedAt`, image failures, shared
  images kept, non-https refused; providers: live → saved fallback offline
  with local images, offline without copy → error, pagination + dedupe +
  cached first page, inline load-more error + retry, background refresh of a
  saved copy after a correction.
* `test/features/news/news_screens_test.dart` (12, full app + fake API):
  list and reader in **ar and en**; deep link `/n/<slug>` + one view count;
  share text; save → offline read with notice → saved list via the offline
  state; reader settings; 404 state; **200 % text in Arabic** for the list and
  for the whole article scrolled to the end, in light and dark — no overflow.
* `test/live/live_news_test.dart` (skipped unless `EVCAR_LIVE_API`): ran
  against a real backend (own DB `evcar_newsmob_chk`, reference + demo seed,
  dropped afterwards): list/detail/categories/strict+popular/view/404/unknown
  category all parse — 3/3 passed.
* Shared tests adjusted (minimal, because the placeholders are gone):
  `test/app/routes_test.dart` — news routes moved from the placeholder list
  to a new `_implemented` map (still checked for their flag and for
  "disabled → Home"); `test/app/shell_navigation_test.dart` — the `/n/<slug>`
  deep-link case now expects the real reader (path + "Article not
  available" from the fake server) instead of the placeholder text.

## 7. Notes / requests for other teams

* **Backend (articles):** inline image credits — the reader shows the
  `<img title>` as the credit line. Please have the editor (or the server
  when rendering `bodyHtml`) put the licence credit of each library image in
  `title` (or a `<figcaption>`), otherwise inline images show no credit.
  Per-language slugs (backend §12) will need nothing in the app: routes accept
  slug or id.
* **Favorites team:** articles are favorited as
  `FavoriteItem(key: FavoriteKey(FavoriteType.article, id), title, subtitle:
  category, imageUrl: cover url, route: /news/<slug>)` (`articleFavoriteItem`).
  `/saved` can render `SavedArticlesSliver()` (or `SavedArticleTile`) — it reads
  only the device.
* **Home team:** reuse `ArticleCard(article: ArticleSummary, variant: …)` and
  `newsFeedProvider(NewsQuery(...))` / `NewsRepository.feedPage`; top story =
  `?featured=true&pageSize=1` (not wrapped here; `NewsQuery` has no
  `featured` field yet — add it in the news feature if needed).
* **Community team:** the reader links to `AppRoutes.articleComments(slug)`
  only when `allowComments` is true and the `community` flag is on.

## 8. Not done / not verified

* No APK built here (no Android SDK in this environment); runs only in
  `flutter test`. No manual test on a device, so real scrolling performance,
  photo_view gestures, the share sheet and file storage on Android/iOS are
  unverified.
* Visual check was done with widget-test screenshots (real fonts, 390×844,
  ar/en, light/dark); images in those were fallbacks (no network in tests).
* No text search box inside the news list (the app bar opens the unified
  `/search` when a searchable feature is on).
* `featured` top-story filter not exposed in `NewsQuery`.
* Saved images are stored per URL; if the server later serves a different
  variant URL for the same image, the offline copy falls back to the other
  saved size or the placeholder.
