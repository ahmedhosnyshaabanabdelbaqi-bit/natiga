# Remaining features data model (prep-remaining-schema) — decisions

Area: `backend/prisma/schema/*.prisma`, `backend/prisma/migrations/`,
`backend/src/cli/seed-data/*`, `backend/src/cli/seed-demo.ts`,
`backend/test/schema-remaining.e2e-spec.ts` (+ the two schema specs that used
renamed enum values). Date: 2026-09-25. Stage run before the feature agents
of stations, media/tours, personal, notifications, community, directory,
encyclopedia, trips and ads. Goal: those agents never need a schema change.

Migration: `20260928000000_remaining_features` (generated DDL, hand-edited:
enum values renamed in place, `topic` renamed instead of drop + add; then raw
SQL). Applied to `evcar_dev` + reference seed (no demo data there). The
phase-2 migration is unchanged.

## 1. Dependencies

**None added — `package.json` and `app.module.ts` unchanged.**

| Need | Covered by |
|---|---|
| Resumable uploads | Own chunked protocol on `upload_sessions` (tus-like: offset = `received_bytes`, a chunk at another offset → 409, client resumes). The body parser already accepts `application/offset+octet-stream` up to `UPLOAD_CHUNK_MAX_BYTES`. S3: each chunk is a multipart part through the existing `StorageProvider` multipart API (`multipart_upload_id`, `parts`). No tus server library: `@tus/server` would bring its own storage layer next to ours. |
| Image processing, previews, renditions, cube faces / multires tiles | `sharp` (installed). Equirectangular → cube faces needs a small pixel remap (raw buffers) in the job. |
| Opening hours / "open now" / quiet hours | `luxon` (installed) + the validated JSON format below. |
| MIME sniffing (images, video) | `file-type` (installed). |
| XMP GPano / EXIF | `sharp().metadata()` (+ `fast-xml-parser` for XMP). Output files are written without metadata by sharp (no GPS). |
| Push (FCM / APNs) | existing push provider (`google-auth-library`, `jose`, `node:http2`). |
| Geo (nearby, bbox, dedupe distance) | PostGIS (GIST indexes) + `pg_trgm` similarity. |

## 2. Gap analysis — what existed and what changed

Most of the model already existed from phase 1 / review 2 (station → point →
connector, connector types, tariffs + elements with units, provider records
unique (provider, external_id), availability observations with expiry,
reports, check-ins, media assets / licences / variants / upload sessions,
tours bound to variant + market + colour + drive side with reference-tour
approval, scenes, hotspots + translations, favorites, garage, logs,
reminders, trip plans, notification preferences / subscriptions /
notifications / device tokens / deliveries / campaigns, reviews, comments,
Q&A, content reports, moderation actions, user blocks, service providers,
encyclopedia, ad placements / campaigns / creatives).

| Feature | Added / changed | Why |
|---|---|---|
| stations | `provider_records`: `charging_point_id`, `connector_id` (FK SET NULL), `last_import_job_id`, `license_url`, `source_url`; CHECKs (entity type, provider key, hash, urls); trigger: point / connector belong to the record's station | a re-sync must find the local connector it created ("conn:123" → connector row) |
| | `charging_stations.duplicate_of_id` (merged → never published, CHECK), `opening_hours_text`; new `station_duplicate_candidates` (ordered pair, distance, name similarity, review) | cross-source dedupe (§10 "منع التكرار") |
| | new `station_suggestions` (user proposal kept OUT of the map, GIST location, connectors JSON, review state, created / duplicate station) | §10 "اقتراحات مستخدمين تمر بالمراجعة" |
| | `station_media.status` + `uploaded_by_id` | user photos are moderated |
| | `station_checkins.variant_id`, `wait_minutes` (0..1440) | "charged with <car>", waiting time |
| | `opening_hours` validated by `app_valid_opening_hours()` (also service providers), never together with `is_always_open = true`; `timezone` must be IANA (trigger) | "open now" must be computable |
| | enum `station_report_type`: `connector_mismatch` → **`different_connector`** | product wording |
| media & tours | `media_assets`: `multires_config` (JSON object), `processing_attempts`, `processing_started_at`, `credit_text`; `asset_licenses`: attribution text required when attribution is required, rights holder non-blank | Pannellum multires, retries, required credit |
| | `upload_sessions`: `purpose`, `multipart_upload_id`, `parts`, `metadata`, `last_chunk_at` | resumable S3 multipart, cleanup |
| | `tour_scenes.min_pitch / max_pitch`; `interior_tours.review_note` | viewer limits, review feedback |
| | enum `scene_position`: `driver_seat`→**`driver`**, `rear_seats`→**`rear`** (+ `front_passenger`, `third_row`, `cargo`, `other`) | contract names |
| | enum `hotspot_type`: `scene`→**`scene_link`**, `image`→**`detail_image`**, `spec`→**`spec_link`** (+ `info`, `video`); strict CHECK (each type uses exactly its own fields) + trigger (detail_image → image asset, video → video asset) | unambiguous clients |
| | hotspot translations: locale `ar`/`en`, title non-blank, no markup (`<` followed by a letter, `/`, `!`, `?` is refused) | §19 no HTML/JS from hotspots |
| | publishing needs every scene panorama **and hotspot image/video** ready + licensed (+ initial scene + market); edits of a PUBLISHED tour are re-checked at COMMIT (deferred triggers); a file used by live content (published tour, scheduled/published article cover) cannot leave `ready`, lose its licence or be soft-deleted (incl. deleting its licence row) | §9 "لا تنشر الجولة قبل جاهزية ملفاتها" also after publishing |
| personal | `user_vehicles.current_odometer_km`, `odometer_updated_at`; `charging_logs.current_type` + SoC end > start; `reminders.repeat_interval_km`, `notify_km_before`; enum `reminder_type`: `registration`→**`licence`**, `other`→**`custom`** (+ `maintenance`, `insurance`, `tyres`); `trip_plans.planned_departure_at` | §13–14 |
| | new `user_interests` (brand / model / category, exactly one, unique per user); **`user_preferences.interests` JSON dropped** (was unused, no FK integrity) | home personalization |
| notifications | preferences: `station_alerts_enabled`, `campaigns_enabled`, `unsubscribed_at`; time zone validated; quiet hours need a time zone | §16 unsubscribe / quiet hours |
| | subscriptions: per-topic column CHECK + `target_key` (trigger) unique per user | no duplicate subscriptions |
| | notifications / campaigns: `deep_link` must be an app path (`/…`, not `//`) or `https://…` | safe deep links |
| | device tokens: `installation_id`, `failure_count`, `last_failure_at`; deliveries: `scheduled_for`, `skip_reason` (required when skipped), partial unique indexes (per device for push, per channel otherwise) | idempotent retries |
| community | new `owner_verifications` (user, variant, optional own garage car, method, status, private evidence asset, reviewer, expiry); `reviews.owner_verification_id` → badge `is_verified_owner` maintained by trigger; old free-text `owner_verified_at` / `owner_verification_method` dropped | §15 "لا تستخدم شارة مالك موثّق دون عملية تحقق فعلية" |
| | new `review_ratings` (dimension enum, 1..5; car dims only on variant reviews, `station_*` only on station reviews) | rating dimensions |
| | new `community_votes` (+1/-1, one per user × target) → `upvote_count` / `downvote_count` on reviews, comments, questions, answers (trigger) | helpful votes |
| | `comments.model_id`, `variant_id` (car page comments); reply must have the parent's target; `questions`/`answers.edited_at`; accepted answer must belong to the question | comments on cars |
| | `content_hash` (sha256 of normalized text, trigger) on reviews/comments/questions/answers; new `spam_signals`; one open report per reporter × target; user blocks: scope `community`/`all`, one active per scope; new `user_mutes` (user hides another user) | anti-spam, abuse |
| | new `report_reasons` (scope station/content × enum code → ar/en labels, help text, order, requires details) | labelled vocabularies from the DB |
| directory / encyclopedia / ads | `service_provider_type`: `roadside_assistance`→**`emergency`**; providers: `is_always_open`, `services[]`, `logo_asset_id`, `contact_verification_note`, `sponsored_until` (needs sponsored); opening hours validated | §15 directory |
| | new `encyclopedia_categories` (key PK, ar/en names, icon, order, system flag); `encyclopedia_entries.topic` → **`category_key`** FK; `review_note`, `content_updated_at`; translation locale ar/en | categories as reference data |
| | `ad_surface` + `directory_list`, `encyclopedia` (still no map / panorama); new `ad_daily_stats` (anonymous); campaigns: disclosure labels non-blank, market codes format; creative locale ar/en | §16 |
| analytics | `content_daily_stats` entity types + `service_provider` | directory counters |
| privacy | `users_delete_scrub` trigger: deleting an account clears IP hashes of its spam signals and station reports | §19 |

Not added on purpose: a tus server; per-field provenance on stations
(provider records + `data_license` / `attribution` cover it); a separate
opening-hours table (validated JSON is enough and imports stay simple);
guest notification preferences (guests get no personal push); community demo
content (§15 forbids showing demo reviews as real opinions); stored location
history (§12/§19 — only explicitly saved trip plans).

## 3. Rules enforced by the database (services must pre-validate)

Trigger messages start with the rule name; SQLSTATE 23514 → 422
`VALIDATION_FAILED` with `details.constraint = <rule>` (existing filter).

- Stations: `charging_stations_opening_hours_chk`, `charging_stations_timezone_chk`,
  `charging_stations_duplicate_chk`, `provider_records_{entity_type,provider,hash,urls}_chk`,
  `provider_records_station_refs_chk`, `station_checkins_wait_chk`,
  `station_suggestions_{coordinates,country_code,name,connectors,review}_chk`,
  `station_duplicate_candidates_{order,values,review}_chk`.
- Media / tours: `asset_licenses_attribution_chk`, `asset_licenses_rights_holder_chk`,
  `media_assets_{processing_attempts,multires,credit}_chk`, `upload_sessions_{purpose,json}_chk`,
  `tour_scenes_pitch_limits_chk`, `scene_hotspots_type_chk`, `scene_hotspots_media_kind_chk`,
  `scene_hotspot_translations_{locale,plain_text}_chk`,
  `interior_tours_publish_assets_chk` (on publish AND at COMMIT of scene / hotspot changes of a
  published tour), `media_assets_in_use_chk`.
- Personal: `user_vehicles_current_odometer_chk`, `charging_logs_soc_order_chk`,
  `reminders_km_chk`, `reminders_title_chk`, `user_interests_target_chk`.
- Notifications: `notification_preferences_timezone_chk`, `notification_preferences_quiet_hours_tz_chk`,
  `notification_subscriptions_target_chk`, `notification_subscriptions_target_key_chk`,
  `notifications_deep_link_chk`, `notification_campaigns_deep_link_chk`, `device_tokens_failures_chk`,
  `notification_deliveries_skip_chk`, unique `notification_deliveries_device_uq` / `_channel_uq`.
- Community: `reviews_verified_owner_chk`, `owner_verifications_{review,vehicle,immutable}_chk`,
  unique `owner_verifications_active_uq` (one pending/approved per user × variant),
  `review_ratings_{score,dimension}_chk`, `comments_target_chk`, `comments_thread_chk`,
  `questions_accepted_answer_chk`, `community_votes_{value,target}_chk`, `*_vote_counts_chk`,
  unique `content_reports_one_open_uq`, `user_blocks_{scope,expiry}_chk`, unique
  `user_blocks_one_active_uq`, `user_mutes_self_chk`, `spam_signals_{score,target,hashes,details}_chk`,
  `report_reasons_{code,labels}_chk`.
- Directory / encyclopedia / ads: `service_providers_{services,opening_hours,website,sponsored_until}_chk`,
  `encyclopedia_categories_{key,names}_chk`, `encyclopedia_entry_translations_locale_chk`,
  `ad_daily_stats_counts_chk`, `ad_campaigns_{disclosure,markets}_chk`, `ad_creatives_locale_chk`.

## 4. Conventions for the feature agents

**Opening hours** (`charging_stations.opening_hours`, `service_providers.opening_hours`):
`{"mon":[["08:00","22:00"]],"fri":[],"sat":[["10:00","14:00"],["16:00","24:00"]]}` —
keys `mon..sun`; each day ≤ 6 windows `["HH:MM","HH:MM"]` in the place's local
time (station `timezone`; providers: market time zone); `"24:00"` allowed as
end; end < start = past midnight; `[]` = closed; missing day = unknown;
`NULL` = unknown; `is_always_open = true` ⇒ `opening_hours` NULL. "Open now"
is computed at request time (luxon), never stored. Free text from a source
goes to `opening_hours_text` (never parsed).

**Station status** = 3 separate answers: `operational_status`; open now (above);
live availability = newest `availability_observations` row per connector
with `expires_at > now()`, else `unknown` (the demo observation is expired on
purpose).

**Station import / dedupe**: upsert by `provider_records (provider, external_id)`
(`payload_hash` unchanged → skip); set `station_id` / `charging_point_id` /
`connector_id` of the rows produced and `last_import_job_id`. Cross-source
duplicates: `ST_DWithin(location, :point, 50–150 m)` + `similarity(search_text, …)`
→ insert `station_duplicate_candidates` with `station_id < other_station_id`;
confirming = set the loser's `duplicate_of_id` + `publication_status='hidden'`
and mark the candidate `merged`.

**Suggestions**: users write `station_suggestions` only (never
`charging_stations`); approving creates / completes a station
(`data_source='user_suggestion'`, `publication_status` per review) and sets
`created_station_id`; duplicates set `duplicate_of_station_id`; decisions
need `reviewed_at` (+ `reviewed_by_id`). Permission: `stations.write`.

**Tours**: public API only serves `status='published' AND deleted_at IS NULL`.
Seat positions `driver | front_passenger | rear | third_row | cargo | other`.
Hotspot fields per type: `info` (texts only), `detail_image` (`media_asset_id`
image), `video` (`media_asset_id` video), `spec_link` (`spec_key`),
`scene_link` (`target_scene_id` [+ `target_yaw/pitch`]). Preview =
`asset_variants(kind='preview')`, device sizes = `kind='rendition'` label =
width, tiles = `kind='tile'` + `media_assets.multires_config`. To replace a
file of a published tour: create a new asset version (`previous_version_id`)
and swap `tour_scenes.asset_id` in one transaction, or unpublish first.

**Uploads**: create `upload_sessions` (purpose e.g. `tour_scene`,
`hotspot_media`, `station_photo`, `report_photo`, `suggestion_photo`,
`owner_evidence`, `license_proof`, `import_csv`; `expires_at`), then chunks at
`received_bytes`; completion creates the `media_assets` row (`uploading` →
`uploaded` → `processing` → `ready|failed|rejected`, `processing_progress`
0..100, `processing_attempts`).

**Notifications**: `target_key` = `"<topic>:<id>@<market|*>"` (market topic:
`"market:<CODE>"`), e.g. `brand:<uuid>@*`, `price_alert:<variantId>@EG` —
subscribe = insert, P2002 = already subscribed. Topic columns: brand →
`brand_id`, model → `model_id`, variant → `variant_id`, category →
`category_id` (each + optional `market_code`), station → `station_id` only,
market → `market_code` only, price_alert → `variant_id` + `market_code`.
Notifications are deduped by `(user_id, dedupe_key)`, e.g.
`article.published:<articleId>`, `reminder.due:<reminderId>:<dueDate>`.
Deliveries: one row per (notification, device) for push, per (notification,
channel) otherwise; quiet hours → `scheduled_for`; not attempted →
`status='skipped'` + `skip_reason` (`channel_not_configured`, `quiet_hours`,
`opted_out`, `unsubscribed`, `token_revoked`). `unsubscribed_at` set = send
nothing but account/security mail.

**Community**: badge = `reviews.owner_verification_id` (never write
`is_verified_owner`; the trigger does). Verification flow: user creates
`owner_verifications` (pending, evidence as a PRIVATE asset, purpose
`owner_evidence`); a holder of `community.verify_owners` approves / rejects
(`reviewed_at`, `reviewed_by_id`, `decision_note`), then deletes the evidence
file and sets `evidence_deleted_at`; revoking / expiring removes badges.
Votes: insert/update/delete `community_votes`; never touch the counters.
Duplicate text: compare `content_hash` (normalized like search) within a time
window; record `spam_signals`. Hide muted users' content for the muting user
(`user_mutes`). Report reason labels: `GET` from `report_reasons` (scope,
code, labels, `requires_details`, order, active).

**Encyclopedia**: categories from `encyclopedia_categories` (active, ordered);
seeded system rows are re-created if deleted — deactivate instead.
Publishing still needs `technical_reviewed_at` (phase-1 CHECK).

**Ads**: all seeded placements are disabled; creatives are always shown with
the campaign's disclosure label; counters via
`INSERT … ON CONFLICT (creative_id, day) DO UPDATE` (no per-user data). Map
and 360° views are not surfaces (no enum value).

**Account deletion** (existing users service): new personal tables cascade
(interests, votes, mutes, owner verifications, preferences…); suggestions,
station photos and spam signals keep their rows with `user_id` NULL; the
`users_delete_scrub` trigger clears their IP hashes; anonymized reviews lose
the verified-owner badge automatically.

## 5. Seeds

- Reference (idempotent, every deploy): connector types 8 → **12** (+ `chaoji`
  DC, `schuko`, `bs1363`, `iec60309` AC domestic/industrial; aliases for
  Open Charge Map names; typical power informational, ChaoJi NULL); **9
  encyclopedia categories** (ar/en names + descriptions, `is_system`,
  created when missing; migration placeholders named key=key are adopted and
  named); **13 report reasons** (6 station + 7 content, "other" requires
  details); **5 ad placements, all disabled**; permission
  **`community.verify_owners`** (→ community_moderator; owner/admin by the
  matrix), granted through the tracked/audited path (71 permissions).
- Demo (`npm run db:seed:demo`, refuses production): demo station 1 renamed
  in Arabic to **"محطة تجريبية (Demo)"** with a "not a real place" address
  (still in open sea), provider record `demo/demo-station-1`, one **expired**
  `available` observation (must show "unknown"); **demo station 2** (AC only,
  customers only, weekly hours closed Friday, 2 points); demo encyclopedia
  entry (published, `[DEMO]`); demo service centre at sea (no contact data,
  not verified); **demo 360° tour** of the fictional BEV (EG, LHD, "Demo
  grey"): 2 scenes (driver, rear) with **synthetic generated** 4096×2048
  equirectangular panoramas (grid + "DEMO — not a real car interior" in
  en/ar), preview 1024×512 and 2048 rendition written to storage under
  `public/demo/panoramas/<assetId>/`, demo licence (owned, synthetic), 4
  hotspots (info, spec_link → `battery.usable_kwh`, scene links both ways).
  Stable ids in `DEMO_IDS`. `runDemoSeed(prisma, { storage })` — without
  storage the tour is skipped (never a row without files); the CLI builds
  storage from the environment.

## 6. Other files touched (outside the prisma folder)

- `backend/src/modules/markets/markets.service.ts`: `MARKET_RELATIONS` +
  `stationSuggestions` (its guard test lists every Market relation so a
  market delete answers 409 instead of nulling data).
- `backend/test/data-integrity.e2e-spec.ts` (4 renamed enum literals),
  `backend/test/database.e2e-spec.ts` (connector code list).

## 7. Verification (2026-09-25)

- `npm run prisma:check-drift` → in sync; `prisma migrate status` on
  `evcar_dev` → up to date.
- Upgrade path on a copy of `evcar_dev` with old-style rows (entries with
  topics `warranty` and an unknown topic, a `connector_mismatch` report, a
  `registration` reminder, a market subscription): migrate + seed OK —
  values renamed, entries kept their category, placeholder adopted and
  named, unknown topic kept as placeholder, `target_key` back-filled,
  `community.verify_owners` granted to 3 roles with audit rows.
- `typecheck`, `lint`, `format:check` clean; `npm test` 38 suites / 416
  tests; `npm run test:e2e` (all) 17 suites / 248 tests incl. the new
  `schema-remaining` spec (32 tests; it found a cascade-order bug in the
  first version of the provider-record trigger, fixed before applying);
  build config compiled with `tsc -p tsconfig.build.json` into a scratch
  directory (shared `dist/` not touched while other agents work).
- Reference seed run twice on the scratch and dev DBs (second run adds
  nothing); demo seed run twice with local storage (files written once,
  identical summary). No leftover test / scratch databases.
- `openapi:export` not re-run (no endpoint changed here; other agents are
  adding endpoints in parallel).

## 8. Not done / limits

- No services, endpoints, admin or mobile screens (feature agents).
- The demo panorama has no multires tiles (`multires_config` NULL): the
  media agent's job can generate them; the viewer must work from preview +
  rendition.
- Licence validity dates (`asset_licenses.valid_until`) are not enforced by
  the database (time-dependent): the media/tours services must refuse
  publishing with an expired licence and list expiring ones.
- Owner-verification expiry (`expires_at`) is applied by a job setting
  `status='expired'` (which removes badges), not by the database clock.
- The admin panel permission list (`admin/src/...permissions.ts`) does not
  know `community.verify_owners` yet (admin UI deferred).
- `REQUIREMENTS_TRACKER.md` not edited (outside this area).

## 9. Schema change requests

None pending.
