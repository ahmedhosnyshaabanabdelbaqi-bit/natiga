# Decisions — mobile-community (owner reviews, comments, Q&A)

Area: `mobile/lib/features/community/**`, `mobile/lib/l10n/parts/community_{ar,en}.arb`,
tests `mobile/test/features/community/**`, this file. Date: 2026-09-28.
Backend contract: `docs/decisions/backend-community.md` §3 (checked against a
live backend on an own DB, see §7). REQUIREMENTS §15: report, block,
moderation, anti-spam; **no demo reviews shown as real opinions; no "verified
owner" badge without a real verification**.

No new dependency. No router edit (class names/constructors kept; optional
constructor parameters added). No shared-kit edit. One shared test touched (§8).

## 1. Structure

| Layer | Files |
|---|---|
| domain | `domain/community_models.dart` — `Review`, `ReviewSummary` (+`RatingBucket`, `DimensionAverage`), `ReviewDraft`, `ReviewQuery`, `Comment`, `CommentTarget`, `Question`, `Answer`, `QuestionQuery`, `Votes` (optimistic `applying`), `CommunityAuthor`, `ModerationStatus`, `ReportReason`, `CommunityStatus`/`CommunityBlock`, `MutedUser`, route-slug resolutions `CommunityCar`/`CommunityTrim`, `CommunityArticle`, `CommunityTargetTypes` |
| data | `data/community_repository.dart` — every endpoint used (§4); no caching (moderated content must not be shown stale as live) |
| application | `application/community_providers.dart` — `communityStatusProvider`, `reportReasonsProvider`, `communityCarProvider(slug)`, `communityArticleProvider(slug)`, `reviewSummaryProvider(variantId)`, `reviewsControllerProvider(ReviewQuery)`, `myReviewProvider(variantId)`, `reviewProvider(id)`, `commentsControllerProvider(CommentThreadKey)`, `questionsControllerProvider(QuestionQuery)`, `questionThreadProvider(id)`, `mutedUsersProvider`, `locallyMutedUsersProvider`; generic `PagedList` + `PagedListOps` (load more, replace, remove, prepend) |
| presentation | screens `car_reviews_screen.dart`, `write_review_screen.dart`, `article_comments_screen.dart`, `questions_screen.dart`, `ask_question_screen.dart`, `question_detail_screen.dart`, `muted_users_screen.dart` (not routed, §6); `community_routes.dart`; widgets `widgets/comments_section.dart` (**exported, reusable**), `community_ui.dart`, `community_actions.dart`, `community_composer.dart`, `review_widgets.dart` |

## 2. Screens

* **Owner reviews `/cars/:slug/reviews[?variant=<id|slug>]`** — reviews are per
  trim: car title + demo notice, trim selector (sheet), "Your review" card (own
  review in any moderation state, via `/me/community/content`), server summary
  (average, 5→1 distribution with counts in text, verified-owner count, rating
  by aspect — unrated aspects "Not available", never 0), sort pills (most
  helpful / recent / highest / lowest), filters (verified owners only, 1–5
  stars) sent to the server, review cards (stars, ownership duration, title,
  expandable body, pros/cons with icon + label, aspect pills, helpful votes,
  menu: edit/delete for mine, report/block for others), load more, honest
  empty states ("No owner reviews yet" + "Be the first"; "No matching reviews"
  + clear filters), disclaimer (opinions, moderated, not official data).
  FAB "Write a review" / "Edit my review".
* **Write / edit review `/cars/:slug/reviews/new[?variant=&review=]`** —
  `AuthGate` (guests) → `CommunityPostingGate` (e-mail not verified → verify
  CTA + "I've verified it"; moderator block → reason + end date; new account →
  "posts reviewed first, no links"). Form: trim (fixed when editing), overall
  stars (required, spoken labels), title (3–200, optional), experience
  (20–5000), pros/cons (≤2000), ownership months (0–600), optional ratings per
  aspect (8 car dimensions, clearable), moderation + guidelines note, badge
  explainer ("appears only after our team verifies ownership"). Submit →
  "Review received" sheet (pending). 409 `COMMUNITY_REVIEW_EXISTS` → offer to
  edit the existing review. Delete in edit mode. The client never sends
  `verifiedOwner` (unknown fields are 422 on the server anyway).
* **Article comments `/news/:slug/comments`** — resolves the article
  (`GET /articles/:slug` → id, title, `allowComments`, `isDemo`), link card
  back to the article, then `CommentsSection` (full mode).
* **Questions `/questions[?model=<car slug>]`** — car chip (removable → all
  questions), debounced search (`q`), All / Answered / Unanswered, sort
  (recent / votes / active), cards (answered pill with icon + text, answer
  count, helpful count, asker + time), load more, FAB "Ask a question".
* **Ask `/questions/ask[?model=]`** — gates as above; car chip (removable →
  general question), tips, title (10–300), details (≤5000); success →
  replaces the route with the question (snackbar says when it is held).
* **Question `/questions/:id`** — title, answered state, moderation notice for
  my held/hidden question, body, author, votes, menu; answers with the
  accepted one pinned first ("Accepted answer" pill + outlined card), asker can
  accept / remove acceptance; answer composer (gated); 404 → "Question not
  available" (removed or still under review), never an error page.

Every screen: skeleton loading, pull-to-refresh, offline/error states from
`AsyncStateView`, empty states with icon + action, sign-in / verify / blocked
states, RTL/LTR, dark mode, 200 % text (tested), 48 dp targets, Semantics
labels (votes "Helpful, 3 votes", stars "4 out of 5 stars", trim selector,
distribution rows), no colour-only signals.

## 3. Rules applied

* **Verified owner badge**: rendered only when `verifiedOwner == true` (a JSON
  boolean); `verifiedOwnerLabel` is ignored otherwise. Label from the server
  (localized), app fallback "مالك موثّق / Verified owner".
* **Demo**: the API never serves `is_demo` reviews; when the *car/article* is
  demo data the pages show `DemoBadge` + "This is demo data for testing". No
  review, comment or question is bundled; test fixtures are captured test data.
* **Moderation visibility**: public lists contain only approved items. The
  author's own non-public items show a `ModerationNotice` (icon + title +
  explanation): pending ("Only you can see this until a moderator approves
  it"; reviews: "Moderators check every review…"), hidden, rejected. Votes and
  reports are disabled on non-public items; edit is disabled on hidden ones.
  A freshly posted held comment/answer is inserted with its state.
* **Block user = mute** (`PUT /me/mutes/:userId`): confirmation sheet explains
  the effect (only for me, they are not told), content disappears at once
  (`locallyMutedUsersProvider` filter) and every community list reloads (the
  server excludes muted authors); snackbar with Undo (`DELETE`).
  Moderator bans are a server feature; the app shows them via `/me/community/status`.
* **Report**: reasons + labels from `GET /community/report-reasons` (server
  localized); details field required when `requiresDetails`; 409 duplicate /
  self report explained.
* **Votes**: optimistic, rolled back with a message on failure; guests get a
  sign-in sheet; own posts cannot be voted (explained in the tooltip). Zero
  counts are hidden visually ("Helpful" instead of "Helpful (0)"), but spoken.
* **Errors**: `communityErrorMessage` — server messages (already localized)
  plus app wording for `EMAIL_NOT_VERIFIED`, `COMMUNITY_RATE_LIMITED` (minutes
  from `details.retryAfterSeconds`), `COMMUNITY_REPORT_DUPLICATE`,
  `COMMUNITY_SELF_VOTE`, `COMMUNITY_SELF_REPORT`, `COMMUNITY_COMMENTS_CLOSED`,
  401, and 422 field messages. Form text is kept on failure.
* **Feature flag**: the router already guards the routes (`community`);
  `CommentsSection` renders nothing when the flag is off.

## 4. API shapes used (exact, verified live)

`GET /cars/:slug` (id, title, `defaultVariantId`, `generations[].years[].variants[]{id,slug,name,localName,modelYear,powertrainType,isDemo}`, `isDemo`),
`GET /articles/:slug` (id, slug, title, `allowComments`, `isDemo`),
`GET /community/reviews/summary?variantId=`, `GET /community/reviews?variantId=&sort=&rating=&verifiedOnly=true&page&pageSize=20`,
`GET|PATCH|DELETE /community/reviews/:id`, `POST /community/reviews {variantId,rating,title?,body,pros?,cons?,ownershipMonths?,ratings?[{dimension,score}],locale}`
(PATCH sends `title/pros/cons/ownershipMonths: null` to clear, `ratings` replaces all),
`GET /comments?targetType=&targetId=&sort=newest|oldest|top&page&pageSize=20`, `GET /comments/:id/replies?page`,
`POST /comments {targetType,targetId,parentId?,body}`, `PATCH /comments/:id {body}`, `DELETE /comments/:id`,
`GET /questions?targetType=model&targetId=&q=&answered=true|false&sort=&page`, `GET /questions/:id`, `GET /questions/:id/answers?page`,
`POST /questions {targetType?,targetId?,title,body?,locale}`, `PATCH /questions/:id {title,body|null}`, `DELETE /questions/:id`,
`POST /questions/:id/accept {answerId|null}`, `POST /questions/:id/answers {body}`, `PATCH|DELETE /answers/:id`,
`POST /community/votes {targetType,targetId,value:1|-1|0}` → `{votes}`,
`GET /community/report-reasons`, `POST /community/reports {targetType,targetId,reason,details?}`,
`GET /me/community/status`, `GET /me/community/content?type=review&pageSize=50`,
`GET /me/mutes`, `PUT|DELETE /me/mutes/:userId`.

## 5. For other teams — embedding `CommentsSection`

```dart
import 'package:evcar_news/features/community/presentation/widgets/comments_section.dart';
import 'package:evcar_news/features/community/domain/community_models.dart' show CommunityTargetTypes;

// Inside any scroll view (it is a non-scrolling Column; it pages with "Load more"):
CommentsSection(
  targetType: CommunityTargetTypes.variant, // article | review | model | variant
  targetId: variant.id,                     // uuid, not the slug
  allowComments: true,                       // article: article.allowComments
);

// Preview (first N threads) + link to a full page:
CommentsSection(targetType: 'article', targetId: a.id, allowComments: a.allowComments,
    previewCount: 3, onViewAll: () => context.push(AppRoutes.articleComments(a.slug)));
```

It needs no provider setup (uses the app's `apiClientProvider`), hides itself
when the `community` flag is off, and handles sign-in, e-mail verification,
bans, moderation states, votes, report and block itself. Use
`padding: EdgeInsets.zero` when the host already applies page gutters.

* **Cars team**: link with the trim preselected —
  `CommunityRoutes.carReviews(slug, variant: variantId)` and
  `CommunityRoutes.writeReview(slug, variant: variantId)` (the current links
  without `variant` still work: the server's default trim is used). Model-page
  Q&A: `AppRoutes.questions(model: slug)` / `CommunityRoutes.ask(modelSlug: slug)`.
* **Account team**: "Blocked users" screen is ready as `MutedUsersScreen`
  (`presentation/muted_users_screen.dart`); push it or register a route (e.g.
  `/account/blocked-users`), not done here to avoid editing the router.
* **Charging team**: station reviews use the same API with `stationId`; the
  widgets (`ReviewCard`, `ReviewSummaryCard`) are reusable, but no station
  review screen was built (not in this task).

## 6. Not done / limits

* No owner-verification request flow in the app: the badge is display-only.
  `POST /me/owner-verifications` exists, but document evidence needs a user
  upload route the backend does not have yet (`backend-community.md` §6).
* No "my community content" / "my reports" screens (API exists).
* No notifications for replies/answers (backend does not send them yet).
* `MutedUsersScreen` is not reachable from the UI until a route is added.
* Community data is not cached offline (by design: moderation changes it);
  offline shows the offline state.
* The `community` flag stays off in `/app-config` until the integrator adds
  `'community'` to `IMPLEMENTED_FEATURES` (backend).
* No APK built here (no Android SDK); verified with widget tests and the web
  design preview only.

## 7. Verification (2026-09-28)

| Command | Result |
|---|---|
| Backend on own DB `evcar_mcomm` (migrate deploy, `db:seed`, `db:seed:demo`, `ts-node src/main.ts` on :3117), two test users, curl of every endpoint above | shapes match the contract; responses saved as fixtures in `test/features/community/fixtures/` (test data only) |
| `dart run tool/merge_arb.dart --check && flutter gen-l10n` | 44 parts, 2 locales OK (community: 235 keys) |
| cleanup | backend and proxy stopped, `evcar_mcomm` dropped |
| `flutter analyze` (whole app) | No issues found |
| `flutter test test/features/community test/app/routes_test.dart` | all passed (17 model tests + 25 screen tests incl. a 4-config matrix ar/en × light/dark × 100/200 % text) |
| `flutter test` (whole app) | 621 passed, 7 skipped (live-API tests), 0 failed |
| `flutter build web` into the scratchpad + a local proxy turning the flags on + Playwright/Chromium (390×844 @2x, ar + en) | reviews, comments, questions, question detail render correctly in RTL/LTR; fixed from screenshots: "★" glyph missing in the web font (filter chips), noisy "(0)" vote counts |

Bugs found by the tests and fixed: unbounded-height form inside the posting
gate (full-page mode), two 200 %-text overflows (aspect rows, demo notice),
spinner kept running behind the success sheet.

## 8. Changes outside the area

* `mobile/test/app/routes_test.dart`: the four community routes moved from
  `_public` (placeholder expected) to `_implemented` (still checked for the
  feature flag) — the pattern the news/cars teams used.
