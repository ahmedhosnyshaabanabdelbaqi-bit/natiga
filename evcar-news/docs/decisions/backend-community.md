# Backend — Community (REQUIREMENTS §15)

Owner: backend-community. Code: `backend/src/modules/community/**`, tests
`backend/test/community-*.e2e-spec.ts`, `backend/test/community-helpers.ts`,
unit tests `src/modules/community/common/community-rules.spec.ts`.
No schema change was needed (tables from `prep-remaining-schema`).

## 1. Scope

Owner reviews per variant (and per station) with rating dimensions, comments
(articles, reviews, car model pages, variant pages; one reply level), questions
and answers (accepted answer), helpful votes, user reports, a moderation queue and
actions (approve / reject / hide / restore / delete), moderator blocks ("ban") and
warnings, user mutes ("block this user" for me), anti-spam, and the
verified-owner flow. **No seeded reviews** (demo seed adds none; `is_demo`
reviews are never served).

## 2. Rules (binding)

| Rule | How |
|---|---|
| Posting needs a verified e-mail and no active block (`community` or `all`, not revoked, not expired) | `CommunityGuardService.assertCanPost` → 403 `EMAIL_NOT_VERIFIED` / 403 `COMMUNITY_USER_BLOCKED` `{scope, reason, expiresAt}`. It applies to posts, edits, votes, reports and verification requests. |
| Per-user sliding-window limits (on top of the per-IP route throttles `comments` / `reports` / `write`) | `RATE_RULES` in `common/community-rules.ts`: review 5/day (new account 1); comment 10/10 min + 100/day (3 + 15); question 5/h + 20/day (1 + 3); answer 10/10 min + 60/day (3 + 10); report 30/day (10); vote 300/h (60). 429 `COMMUNITY_RATE_LIMITED` + `Retry-After` + `details {kind, windowSeconds, limit, newAccount, retryAfterSeconds}`. |
| New account = younger than 3 days | stricter limits, **no links** (422, rule `maxLinks`), every post held (`pending`). |
| Links | at most 2 per text (URLs, `www.`, bare domains with common TLDs); any link → held for review. |
| Duplicates | `content_hash` computed exactly like the DB trigger (`app_normalize_text`). Same author, same text within 7 days → 409 `COMMUNITY_DUPLICATE_CONTENT {existingId}`. Another author posted the same text (≥ 40 normalized chars) within 24 h → held. |
| Reviews are pre-moderated | every new or edited review is `pending` until a moderator approves it. Comments, questions and answers are published at once unless held. |
| Reports | one open report per reporter and target (409 `COMMUNITY_REPORT_DUPLICATE`), no self-reports (422 `COMMUNITY_SELF_REPORT`), details required when `report_reasons.requires_details` (e.g. `other`). **3 distinct open reports** move approved content back to `pending` (hidden) until a moderator decides. |
| Evidence | every hit is written to `spam_signals` (`rate_limited`, `link_spam`, `duplicate_content`, `new_account`, `user_reports`), IP only as an HMAC. |
| Visibility | public = `status='approved' AND deleted_at IS NULL` (+ reviews `is_demo=false`), minus authors the viewer muted. Authors also see their own pending / hidden / rejected items by id and in `/me/community/content`. Deleted items: staff only. Replies of a non-visible comment and answers of a non-visible question are not public. |
| Verified owner | badge = `reviews.owner_verification_id` → an **approved, unexpired** `owner_verifications` row of the author for that variant. The DB trigger keeps `is_verified_owner` equal to the link; the API also checks `expires_at`. Clients can never send it (unknown field → 422). |
| Votes | +1 / -1, one per user and target, changeable; `value: 0` removes it; no votes on your own posts (422 `COMMUNITY_SELF_VOTE`) or on non-visible content (404). Counters are kept by the DB trigger. |
| Mutes | `PUT /me/mutes/:userId` hides that user's reviews, comments, questions and answers for the caller only. |
| Blocks ("ban") | moderators cannot block themselves, owners or admins (403 `COMMUNITY_CANNOT_BLOCK_STAFF`). One active block per scope (409 `COMMUNITY_BLOCK_EXISTS`); an expired block is closed automatically when a new one is created. `hideContent: true` sets all the user's approved / pending posts to `hidden`. Unblocking does **not** unhide them (restore item by item). |
| Caching | guest GETs: `public, max-age=15..300`; signed-in GETs: `private, no-store` (they contain `myVote`, mutes and own items). |

## 3. Public API (`/api/v1`)

Shared shapes:
```
Author   = { id: uuid|null, displayName: string, isDeleted: boolean }   // deleted account → id null, "مستخدم محذوف / Deleted user"
Votes    = { up: number, down: number, score: number, myVote: 1|-1|null }
Target   = { type: string, id: uuid }
status   ∈ pending | approved | rejected | hidden
```

### Reviews
- `GET /community/reviews?variantId=|stationId=` (exactly one) `&sort=recent|helpful|rating_high|rating_low&rating=1..5&verifiedOnly=true&page&pageSize` → list of `Review`. 404 if the variant / station is not published.
- `GET /community/reviews/summary?variantId=|stationId=` →
  `{ target, count, average: number|null, distribution: [{rating:5..1, count}], verifiedOwnerCount, dimensions: [{dimension, label, average: number|null, count}] }` (car dimensions for variants, `station_*` for stations; **null, never 0** when nothing is rated).
- `GET /community/reviews/:id` → `Review`.
- `POST /community/reviews` (auth) `{ variantId | stationId, rating 1..5, title? 3..200, body 20..5000, pros? ≤2000, cons? ≤2000, ownershipMonths? 0..600, ratings?: [{dimension, score 1..5}], locale?: ar|en }` → 201 `Review` (status `pending`). 409 `COMMUNITY_REVIEW_EXISTS {existingId}`.
- `PATCH /community/reviews/:id` (author) same fields except target; `ratings` replaces all; goes back to `pending`. Hidden reviews → 409 `COMMUNITY_NOT_EDITABLE`.
- `DELETE /community/reviews/:id` (author) → 204.

```
Review = { id, target: {type: variant|station, id}, rating, title|null, body, pros|null, cons|null,
  ownershipMonths|null, ratings: [{dimension, label, score}], author: Author,
  verifiedOwner: boolean, verifiedOwnerLabel: "مالك موثّق"|"Verified owner"|null,
  locale, marketCode|null, votes: Votes, commentCount, status, isMine, createdAt, updatedAt }
```
Dimensions: `range_real_world, charging, comfort, technology, build_quality, value_for_money, reliability, after_sales` (variants); `station_reliability, station_access, station_price, station_amenities` (stations).

### Comments
- `GET /comments?targetType=article|review|model|variant&targetId=&sort=newest|oldest|top&page` → top-level `Comment`s, each with `replyCount` and the first 3 `replies` (oldest first).
- `GET /comments/:id`, `GET /comments/:id/replies?page` (oldest first).
- `POST /comments` (auth) `{ targetType, targetId, parentId?, body 1..2000 }` → 201 `Comment` (`approved` or `pending` when held). A reply to a reply is attached to the thread root. 409 `COMMUNITY_COMMENTS_CLOSED` (article `allow_comments=false`); 422 when the target is not published.
- `PATCH /comments/:id` `{ body }` (author; `editedAt` set), `DELETE /comments/:id` → 204.

```
Comment = { id, target: {type, id}, parentId|null, body, author, votes, status, isMine,
  replyCount, replies: Comment[], editedAt|null, createdAt }
```

### Questions & answers
- `GET /questions?targetType=model|variant|station&targetId=&answered=true|false&q=&sort=recent|votes|active&page` → `Question[]` (targetType and targetId together; both omitted = all, including general questions).
- `GET /questions/:id` → `QuestionDetail` = `Question & { acceptedAnswer: Answer|null }`.
- `GET /questions/:id/answers?page` → `Answer[]` (most helpful, then oldest).
- `POST /questions` (auth) `{ targetType?, targetId?, title 10..300, body? ≤5000, locale? }` → 201 `QuestionDetail`.
- `PATCH /questions/:id` `{ title?, body? }`, `DELETE /questions/:id`.
- `POST /questions/:id/accept` (asker only) `{ answerId: uuid|null }` → `QuestionDetail`.
- `POST /questions/:id/answers` (auth) `{ body 2..5000 }` → 201 `Answer`.
- `PATCH /answers/:id` `{ body }`, `DELETE /answers/:id` (clears the accepted answer).

```
Question = { id, target: {type: model|variant|station, id}|null, title, body|null, locale, author,
  votes, answerCount, acceptedAnswerId|null, status, isMine, editedAt|null, createdAt }
Answer   = { id, questionId, body, author, votes, isAccepted, status, isMine, editedAt|null, createdAt }
```

### Votes & reports
- `POST /community/votes` (auth) `{ targetType: review|comment|question|answer, targetId, value: 1|-1|0 }` → 200 `{ targetType, targetId, votes: Votes }`.
- `GET /community/report-reasons` → list `{ code, label, description|null, requiresDetails }` (from `report_reasons`, scope content, active, ordered).
- `POST /community/reports` (auth) `{ targetType: review|comment|question|answer|user, targetId, reason: spam|abuse|off_topic|misinformation|personal_data|copyright|other, details? 3..1000 }` → 201 `{ id, targetType, targetId, reason, reasonLabel, details|null, status, createdAt }`.

### Me
- `GET /me/community/status` → `{ canPost, emailVerified, isNewAccount, newAccountUntil|null, block: {scope, reason|null, expiresAt|null}|null }`.
- `GET /me/community/content?type=review|comment|question|answer&page` → `{ type, id, target|null, title|null, excerpt, status, votes, createdAt }[]` (every moderation state except deleted).
- `GET /me/community/reports?page` → my content reports.
- `GET /me/mutes`, `PUT /me/mutes/:userId` (idempotent, 422 for self, 404 unknown user) → `{ userId, displayName, mutedAt }`, `DELETE /me/mutes/:userId` → 204.
- `GET /me/owner-verifications`, `POST /me/owner-verifications` `{ variantId, method: document_review|dealer_confirmation, userVehicleId?, evidenceAssetId? }` → 201 `{ id, variantId, variantName, userVehicleId, method, status, hasEvidence, evidenceDeletedAt, reviewedAt, decisionNote, expiresAt, createdAt }` (409 `OWNER_VERIFICATION_EXISTS`; 5 requests / 24 h), `DELETE /me/owner-verifications/:id` (pending only; the evidence is deleted).

## 4. Admin API (`/api/v1/admin/community`, all audited)

| Route | Permission |
|---|---|
| `GET overview` → `{ pending: {review, comment, question, answer}, openReports, pendingVerifications, activeBlocks }` | `community.read` or `community.moderate` |
| `GET :collection` (`reviews|comments|questions|answers`) `?status=pending,hidden…&includeDeleted&reported&userId&q&sort=newest|oldest|most_reported` → items `{ type, id, status, deletedAt, title, body, excerpt, rating, verifiedOwner, target, parentId, author {id, displayName, email, createdAt}|null, votes {up, down}, openReports, spamScore, createdAt, updatedAt }` | read |
| `GET :collection/:id` → item + `reports[]`, `history[]` (moderation actions), `spamSignals[]` | read |
| `POST :collection/:id/moderate` `{ action: approve|reject|hide|restore|delete, reason?, reportId? }` → detail. Transitions: approve / reject from pending; hide from approved / pending; restore from hidden / rejected / deleted; delete from any non-deleted. 409 `COMMUNITY_INVALID_TRANSITION`. Open reports on the item are closed (`resolved` for reject / hide / delete, `rejected` for approve / restore). | `community.moderate` |
| `GET reports?status&targetType&reason&targetId` (default open + in_review, oldest first) with a `target` snapshot; `PATCH reports/:id { status }` | read / moderate |
| `GET blocks?active=true|false&userId`; `POST users/:userId/block { scope?: community|all, reason, expiresAt?, hideContent? }` → 201 `{ id, user, blockedBy, scope, reason, expiresAt, revokedAt, active, createdAt, hiddenPosts }`; `POST users/:userId/unblock { scope?, reason? }`; `POST users/:userId/warn { reason }`; `GET users/:userId` (content per status, blocks, history, 30-day spam signals, open reports against the user, verifications) | read / moderate |
| `GET owner-verifications?status&userId&variantId` (default pending); `GET owner-verifications/:id` (includes `evidence.url`, a 5-minute signed URL of the private file); `POST …/:id/approve { decisionNote?, expiresAt? }` (document_review needs evidence → 422 `OWNER_VERIFICATION_NO_EVIDENCE`; other methods need `decisionNote`); `POST …/:id/reject { decisionNote }`; `POST …/:id/revoke { decisionNote }` | `community.verify_owners` |

Approval links all the user's non-deleted reviews of that variant (the trigger
validates) and later reviews get the badge automatically. After every decision
(approve / reject / revoke / withdraw) the evidence file and its derived files
are deleted from storage, the asset is marked deleted and
`evidence_deleted_at` is set. Approved rows past `expires_at` are set to
`expired` lazily (my / admin reads); the public badge also checks `expires_at`
so no stale badge is ever shown.

## 5. Decisions

- Route prefixes follow the task contract: `/community/reviews`, `/comments`,
  `/questions`, `/answers`, `/community/votes`, `/community/reports`.
- Staff with `community.read` / `community.moderate` also see non-public items
  through the public `GET …/:id` routes (preview); the admin API is the normal path.
- Blocks with scope `all` are enforced by the community area only; the auth
  module does not read `user_blocks` (account suspension = `users.status`).
- Anti-spam thresholds are code constants (`COMMUNITY_POLICY`, `RATE_RULES`),
  not settings, so they are unit-tested; moving them to `app_settings` needs the
  settings module.
- No word blocklist: a reliable Arabic / English one needs moderation input;
  duplicates, links, rate limits and reports cover the main spam patterns.

## 6. Not done / notes for other teams

- **Settings (integrator)**: add `'community'` to `IMPLEMENTED_FEATURES` in
  `src/modules/settings/settings.types.ts` so `/app-config` can switch the
  feature on. The API itself does not check the flag.
- **Media**: there is no user-facing (non-admin) upload endpoint yet, so users
  cannot attach an ownership document from the app. `POST /me/owner-verifications`
  accepts `evidenceAssetId` only for an asset from an `upload_sessions` row of
  the caller with `purpose = 'owner_evidence'`. Until a user upload route exists,
  use `dealer_confirmation` (staff note required) or attach evidence another way.
  Nobody gets a badge without an approved verification.
- **Notifications**: no notifications are sent yet (reply to my comment, answer
  to my question, moderation decision, warning, verification decision).
- **Admin UI** (deferred): permissions are enforced server-side; the admin
  permission list needs `community.verify_owners`.
- `openapi.json` was not re-exported (other agents are changing endpoints in
  parallel); the controllers carry full Swagger decorators.
- Comments on an article that is later unpublished stay readable by id (the list
  endpoint checks that the target is public).
