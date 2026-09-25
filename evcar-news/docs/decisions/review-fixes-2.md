# Review 2 — fixes and decisions

Scope: every finding of the second review (backend, database, admin, mobile,
deployment, tests). Date: 2026-09-25. No dependency was added or upgraded
(versions stay as recorded in the other decision files; GitHub Actions in CI
use the current major tags `actions/checkout@v7`, `actions/setup-node@v7`,
`subosito/flutter-action@v2`, checked with `git ls-remote`).

Deviations from `ARCHITECTURE.md` recorded here: §4.5 "one row per variant ×
spec key" became "one row per variant × spec key × market scope" (§3 below),
because REQUIREMENTS §6 puts the market before the specs.

## 1. Authentication

| Topic | Decision |
|---|---|
| Refresh-token reuse | Every rotated hash is kept in `refresh_token_history` (PK = hash, FK session, cascade). Any rotated token presented again ⇒ session revoked + `auth.refresh_token_reused`. Migration back-fills the previous hash of existing sessions. |
| Lost responses / concurrent refreshes | Grace window `AUTH_REFRESH_REUSE_GRACE_SECONDS` (60 s; 0 = strict): the immediately previous token, while its successor is unused, gets the SAME successor. The successor is `HMAC-SHA256(HKDF(JWT_ACCESS_SECRET), sessionId|token)`, so a retry can be answered without storing any usable token. A retry after the window, or with an older token, is reuse. Mobile retries a refresh that failed on the network after 1 / 3 / 8 s (inside the window). |
| Session lifetime | `JWT_SESSION_MAX_AGE_DAYS` (90): sliding refreshes never extend a session beyond `created_at + max age`. |
| Lockout DoS | The account-wide lock (5 failures, exponential) no longer applies to *known clients*: an IP (HMAC) or device id that signed in successfully to that account in the last 90 days (Redis sorted set, 20 most recent, memory fallback). Device id = httpOnly cookie `evcar_dev` (web) or header `X-Device-Id` (mobile installation id, random, in secure storage). Unknown clients are still refused even with the right password during the lock (keeps distributed guessing blind). The per-(IP, e-mail) limit applies to everyone. Re-auth of a signed-in user skips the account-wide lock. Alternatives rejected: CAPTCHA (third-party service, not configured), e-mail OTP (bigger UX change). |
| Timing enumeration | Register / resend-verification / forgot-password are padded to `AUTH_UNIFORM_RESPONSE_MS` (400 ms; 0 in tests). Measured live after the fix: 406-407 ms on all four branches (was 29.6 vs 40.0 ms and 4.1 vs 8.1 ms). The floor only hides differences while the real work (argon2 ≈ 30-60 ms) stays below it. |
| E-mail content | Auth e-mails use a fixed greeting; the user-chosen display name is never put into mail (phishing text to arbitrary addresses). |
| Account deletion audit | `AuditEntry` accepts `ip`/`userAgent` overrides; non-staff deletions store neither. |

## 2. Admin users, SSRF, proxies

- `GET /admin/users/:id/sessions` applies the same owner/admin protection as
  acting on sessions (403 `OWNER_ONLY` / `FORBIDDEN`); the admin UI does not
  request them in that case and says why.
- `users.block` alone only suspends / re-activates accounts whose only role is
  `user`; staff accounts need `users.manage` (+ the owner/admin rules).
- Safe fetcher: a redirect to another origin keeps only `accept`,
  `accept-language`, `if-none-match`, `if-modified-since`, `cache-control`,
  and becomes a GET without body. OCM, OpenRouteService and FCM calls use
  `followRedirects: false` (a 3xx is an upstream error). IPv6 is public only
  inside 2000::/3, which also rejects IPv4-compatible `::a.b.c.d` (::/96).
- `TRUST_PROXY`: documented (backend README table), compose sets
  `loopback,uniquelocal` for the dev stack, the Vite proxy forwards the client
  IP (`xfwd`), the shipped nginx overwrites `X-Forwarded-For` with
  `$remote_addr`, and production refuses `TRUST_PROXY=true`.
- Compose passes the root `.env` to the backend (`env_file`, optional), with
  the explicit `environment` block winning for hosts/drivers.

## 3. Database integrity (migrations `…0100_seeded_role_permissions`, `…0200_data_integrity`)

| Finding | Change |
|---|---|
| Ports as free text, no market | `variant_market_inlets` (variant × market × connector type × AC/DC, max kW, source, reliability); `charging.ac_port` / `charging.dc_port` retired (deleted when unused). |
| Specs without market | `vehicle_specifications.market_code` (NULL = all markets), uniqueness by two partial unique indexes. Lookup rule for the future catalog service: market row first, then the global row. |
| Comparison metadata | Battery capacity `better_direction = none` (context, not "bigger wins"). Consumption moved to `consumption_measurements` with `cycle` (+ note for OTHER), `kind` (electricity Wh/km / fuel L/100km) and hybrid `mode`; the two consumption spec keys are retired. |
| Prices | CHECK: official MSRP and dealer prices need a source; trigger: they must use the market's currency (anything converted is a labelled `market_estimate`); `EXCLUDE USING gist` (btree_gist) forbids overlapping official-MSRP periods per variant × market. |
| Tours | `scene_hotspots.tour_id` + composite FKs (scene and target scene must belong to that tour); trigger: the initial scene belongs to the tour; triggers: scene assets must be `panorama` with equirectangular/cubemap projection (also when an asset is edited later); publishing requires ready + licensed assets, an initial scene and a market where the variant is available / coming soon / discontinued. |
| Stations | `charging_stations.published_point_count`, `usage_cost_text`; `connectors.station_id` (back-filled) + nullable `charging_point_id` (grouping unknown) with composite FK (station, point) and `quantity`; trigger AC/DC vs connector type; trigger: tariffs, availability observations, reports and check-ins only reference points/connectors of their station; station of a point/connector is immutable. |
| Personal data | `UNIQUE(user_id, id)` on `user_vehicles`; composite FKs for charging logs and reminders; trigger for trip plans (their FK is SET NULL, which a composite FK cannot express). |
| Value conditions | charging time needs `charger_power_kw` or a written condition; spec unit must be the definition's canonical unit (NULL is completed) and only the value column of its type is set; a BEV has only electric range, no fuel consumption, and a variant with such data cannot become a BEV. |

Triggers raise `check_violation` (23514) with a message that starts with the
rule name; the exception filter maps 23514 → 422 `VALIDATION_FAILED`
(`details.constraint`), 23P01 → 409 `CONFLICT`, invalid text (NUL) → 422, so a
service that forgets a rule never produces a 500. Prisma ignores triggers,
CHECKs, partial and exclusion indexes when diffing (verified: drift check
"in sync"); `btree_gist` is declared in the Prisma `extensions` list.
Upgrade path verified on a copy of the dev database with old-style rows
(connector back-fill, retired spec kept while in use, role-permission adoption).

## 4. Seeds

- Role permissions: `seeded_role_permissions` records every pair the seed
  granted. Existing roles only receive pairs NEW in code (audited as
  `roles.permissions.seed_grant`, actor `seed:reference`); the first run on an
  older database adopts the current state without granting anything.
- Currencies are created when missing and never overwritten (admins edit them).
- Feature flags: all off by default, and `/app-config` announces a flag only
  when its module is listed in `IMPLEMENTED_FEATURES` (empty today) — stored
  flags that cannot be honoured produce the admin warning
  `features_not_implemented_hidden`.
- Demo station: open water ~150 km off the Egyptian coast, not a real place.

## 5. API conventions

- Every list (also small reference lists) answers `{data, meta}`; complete
  lists are page 1 of 1 (`listOf()`), documented as such in OpenAPI.
- Validation messages are translated (request language) from the constraint
  name + its arguments; DTOs can pass `context: localizedMessage({ar, en})`.
  Constraint names stay stable for clients.
- `OptionalNotNull()` (and `PartialType(..., { skipNullProperties: false })`)
  turn an explicit `null` on a NOT NULL field into 422.
- Free-text query parameters go through `CleanText()` (control characters,
  NUL); `page` ≤ 1 000 000.
- Arabic and English cannot be removed from `defaults.languages`; requests
  without `?lang` / `Accept-Language` use the configured default language
  (same value `/app-config` announces).

## 6. Apps

- Mobile: tabs, account tiles, home actions and routes of features the server
  does not announce are hidden (links land on Home); `visibleHomeSections()`
  maps home sections to their feature for the future home screen. The admin
  logo is shown in the Home app bar (disk-cached image, falls back to the name).
- Admin: suspend button and sessions list follow the new server rules; new
  warning texts; `EVCAR_API_PROXY_TARGET` is read from `admin/.env*` via
  `loadEnv`; Testing Library `asyncUtilTimeout` 10 s and Vitest test/hook
  timeout 30 s (lazy route modules are slow to transform under load).

## 7. Tests and CI

- e2e global setup drops its template database when setup fails; specs that
  change shared state use their own app/database or restore in `finally`;
  verified with `--randomize` (3 seeds) and single-test runs.
- `.github/workflows/evcar-ci.yml` at the repository root: backend
  (PostGIS + Redis services: typecheck, lint, format, build, unit, drift, e2e,
  OpenAPI up to date), admin (types up to date, typecheck, lint, format,
  tests, build), mobile (merge_arb check, analyze, tests). Not run here
  (no GitHub runner access from this environment).

## 8. Not done / limits

- The grace window cannot save a device that stays offline for more than
  60 s after a lost refresh response (it signs in again).
- Known-client exemption: a user on a new network with a new device during an
  attack must wait for the lock (≤ 15 min) or reset the password.
- The timing floor hides branch differences only while the work stays below
  400 ms (an overloaded server can still leak).
- Consumption / inlets / tours / prices have no services or admin screens yet
  (feature modules not started); the rules live in the database.
