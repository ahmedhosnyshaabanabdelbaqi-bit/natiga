# Backend auth, users, RBAC, audit — decisions

Area: `backend/src/modules/{auth,users,rbac,audit}`, tests `backend/test/{auth,users,rbac,audit}-*`,
unit specs next to the code. Status date: 2026-09-25. Contract: ARCHITECTURE §4.3, §4.4, §4.4.1.

## 0. Shared API for every other backend module (read this first)

**Every route requires a valid access token unless it is marked `@Public()`.**
The global `JwtAuthGuard` (APP_GUARD in AuthModule) answers guests with
`401 UNAUTHORIZED` (`401 TOKEN_EXPIRED` for expired tokens).

```ts
import { Public, CurrentUser, ApiAccessToken, type AuthUser } from '../auth';
import { RequirePermissions, RequireAnyPermission } from '../rbac';
import { AuditService, Audit, SkipAudit } from '../audit';

@Public()                                   // guests allowed; a valid token still sets the user
@Get() list(@CurrentUser() user: AuthUser | undefined) {}

@ApiAccessToken()                           // OpenAPI: bearer scheme "access-token"
@Get('me/things') mine(@CurrentUser('id') userId: string) {}   // signed-in only (default)

@RequirePermissions('articles.publish')     // 401 guest, 403 FORBIDDEN without the permission
@Post('admin/articles/:id/publish') publish() {}
```

- `AuthUser = {id,email,displayName,locale,emailVerified,sessionId,roles[],permissions[]}`,
  resolved from the database on every request (revoked sessions, suspended
  accounts and role changes apply on the next request, not after 15 min).
- `@RequirePermissions` (all of) / `@RequireAnyPermission` (any of), on a
  controller and/or handler; both levels must pass. They also document the
  bearer scheme and 401/403 in OpenAPI. Permissions come from
  `role_permissions` (cached ≤ 15 s per instance, invalidated immediately on
  local matrix edits); `owner` always has every permission.
- **Every `/api/v1/admin/*` route MUST declare `@RequirePermissions(...)`.**
  Otherwise the global guard answers `403 ADMIN_ROUTE_WITHOUT_PERMISSION`
  (fail closed) and logs an error naming the route.
- Audit: every successful POST/PUT/PATCH/DELETE under `/api/v1/admin` is
  written to `audit_logs` automatically (actor, action, entityType, entityId,
  before/after/diff, ip, user agent, request id). Default names come from the
  route (`PUT /admin/users/:id/roles` → `users.roles.update`, entityType
  `users`, entityId = `:id`, after = the `{data}` of the response). Refine
  with `this.audit.annotate({ action?, entityType?, entityId?, before, after })`
  (diff computed; keys like password/token/secret/hash/apiKey are redacted;
  payloads > 32 KB replaced by a marker), or `@Audit({action, entityType,
  entityIdParam})`. Use `await this.audit.record({...}, tx?)` + `@SkipAudit()`
  to write your own rows (e.g. inside a transaction). Denied requests are
  audited by the permission guard as `security.permission_denied`.
- Brute-force helper for other re-authentication needs:
  `LoginAttemptsService` (exported by AuthModule).

## 1. Endpoints (all under `/api/v1`)

Contract §4.4.1 (shapes unchanged):

| Method + path | Body | Success | Notable errors |
|---|---|---|---|
| POST `/auth/register` | `{email,password,displayName,locale?}` | 201 `{data:{user}}` | 422 (field errors, password policy) |
| POST `/auth/verify-email` | `{token}` | 200 `{data:{verified:true}}` | 400 `INVALID_OR_EXPIRED_TOKEN` |
| POST `/auth/resend-verification` | `{email}` | 202 (empty) | 422, 429 |
| POST `/auth/login` | `{email,password,deviceName?}` (+ optional header `X-Device-Id`; web gets the `evcar_dev` cookie) | 200 `{data:{accessToken,accessTokenExpiresIn,refreshToken?,user}}` | 401 `INVALID_CREDENTIALS`, 403 `EMAIL_NOT_VERIFIED` / `ACCOUNT_DISABLED`, 429 `TOO_MANY_ATTEMPTS` (+`Retry-After`) |
| POST `/auth/refresh` | `{refreshToken?}` (or cookie) | 200, login shape, **rotated** | 401 `INVALID_REFRESH_TOKEN` / `REFRESH_TOKEN_REUSED` / `ACCOUNT_DISABLED` |
| POST `/auth/logout` | `{refreshToken?}` (or cookie / bearer) | 204 always | — |
| POST `/auth/forgot-password` | `{email}` | 202 always | 422, 429 |
| POST `/auth/reset-password` | `{token,password}` | 204 | 400 `INVALID_OR_EXPIRED_TOKEN`, 422 on `password` (token NOT consumed) |
| POST `/auth/oauth/google` | `{idToken,deviceName?}` | 200 login shape | 503 `INTEGRATION_NOT_CONFIGURED` (`details.integration="oauth.google"`), 401 `OAUTH_TOKEN_INVALID`, 403 `OAUTH_EMAIL_UNVERIFIED` / `ACCOUNT_DISABLED` |
| POST `/auth/oauth/apple` | `{identityToken,deviceName?}` | 200 login shape | same, `oauth.apple` |
| GET `/me` | — | `{data:user}` | 401 |
| PATCH `/me` | `{displayName?,locale?}` | `{data:user}` | 422 |
| GET `/me/sessions` | — | `{data:[{id,clientType,deviceName,userAgent,ip,createdAt,lastUsedAt,expiresAt,current}], meta}` (meta = page 1 of 1) | |
| DELETE `/me/sessions/:id` | — | 204 | 404 `SESSION_NOT_FOUND` (also for other users' sessions) |
| DELETE `/me` | `{password}` | 204 | 422 on `password` (wrong/none set), 409 `LAST_OWNER`, 429 |

`user = {id,email,displayName,emailVerified,locale,roles[],permissions[],createdAt}`.
`deviceName` (login/OAuth) is an additive optional field. All auth responses send `Cache-Control: no-store`.

Additions (not in §4.4.1, do not change it):

| Method + path | Permission | Notes |
|---|---|---|
| POST `/me/password` `{currentPassword,newPassword}` | signed in | 204; signs out all OTHER sessions; 422 on `currentPassword` / `newPassword`; e-mail notice |
| GET `/admin/users?page&pageSize&q&role&status&sort` | `users.read` | items `{id,email,displayName,emailVerified,locale,roles[],status,createdAt,lastLoginAt,isDemo}`; sort `createdAt|email|displayName|lastLoginAt` with optional `-` (default `-createdAt`) |
| GET `/admin/users/:id` | `users.read` | list item + `permissions[],updatedAt,hasPassword,oauthProviders[],activeSessions,failedLoginCount,lockedUntil` |
| PUT `/admin/users/:id/roles` `{roles}` | `users.manage` | full role set, `user` always kept; returns detail |
| POST / DELETE `/admin/users/:id/roles/:role` | `users.manage` | grant / remove one role; returns detail |
| PATCH `/admin/users/:id/status` `{status:'active'|'suspended',reason?}` | `users.block` (+ `users.manage` for staff accounts) | suspension revokes every session; returns detail |
| GET `/admin/users/:id/sessions` | `users.read` (+ owner for owners, `users.manage_admins` for admins) | `{data: Session[], meta}` |
| DELETE `/admin/users/:id/sessions/:sessionId` | `users.manage` | 204 |
| DELETE `/admin/users/:id/sessions` | `users.manage` | 200 `{data:{revoked:n}}` |
| GET `/admin/roles`, GET `/admin/roles/:key` | `roles.read` | `{id,key,nameAr,nameEn,description,isSystem,permissions[],permissionsEditable,userCount}`; owner lists every permission, `permissionsEditable:false` |
| PUT `/admin/roles/:key/permissions` `{permissions}` | `roles.manage` **and owner role** | replaces the role's set; 403 `OWNER_ONLY`, 409 `ROLE_NOT_EDITABLE` (owner), 422 `UNKNOWN_PERMISSION` |
| GET `/admin/permissions` | `roles.read` | `{key,group,descriptionAr,descriptionEn}[]` |
| GET `/admin/audit-logs?page&pageSize&q&entityType&entityId&action&actorId&from&to&sort` | `audit.read` | items `{id,createdAt,actorId,actor{id,email,displayName}|null,actorLabel,action,entityType,entityId,before,after,diff,ip,userAgent,requestId}`; `action` exact or prefix `auth.*`; `from` inclusive / `to` exclusive ISO; `sort=createdAt|-createdAt` (default newest first); `q` matches action/entity/actor label, or an exact request id |
| GET `/admin/audit-logs/:id` | `audit.read` | 404 `AUDIT_LOG_NOT_FOUND` |

These match what the admin team inferred in `docs/decisions/admin.md` §3
(users + audit-log api), plus the single-role and permissions endpoints.

Owner / privilege rules (admin users): granting or removing `owner`, and
acting on an owner (roles, status, sessions — including LISTING their
sessions, which expose IPs and devices), requires the actor to be an
owner (`403 OWNER_ONLY`); `users.block` alone (community moderator) only
changes the status of plain accounts (role `user` only), staff accounts need
`users.manage` too; granting/removing `admin` or acting on an admin
requires `users.manage_admins` (owner-only by default); the last active owner
can never lose the role, be suspended or delete the account (`409 LAST_OWNER`,
serialized with a Postgres advisory lock so two owners cannot demote each
other concurrently); nobody can suspend themselves (`409 CANNOT_TARGET_SELF`).

## 2. Security design

- **Passwords**: argon2id, m = 19 MiB, t = 2, p = 1 (OWASP minimum); rehash on
  login when parameters change. Policy (NIST 800-63B style, matches the
  clients' 8-char minimum): 8–128 characters (code points), ≥ 4 distinct
  characters, not in a blocklist of common passwords, must not contain the
  e-mail / its local part / the display name. No forced character classes.
  Violations → `422 VALIDATION_FAILED` on the field (`password`, or
  `newPassword` for the change endpoint).
- **Access token**: HS256 JWT (`JWT_ACCESS_SECRET`), `iss`/`aud` checked,
  `typ:"access"`, `sub` = user id, `sid` = session id, 15 min
  (`JWT_ACCESS_TTL_SECONDS`), 5 s clock tolerance, only HS256 accepted (alg
  `none`/confusion rejected). Every request re-checks the session row
  (revoked/expired → `401 SESSION_REVOKED`) and account status
  (`401 ACCOUNT_DISABLED`), one indexed PK query.
- **Refresh token** (revised after review 2, see `review-fixes-2.md` §1):
  256-bit value, only SHA-256 stored (`user_sessions.refresh_token_hash`).
  Each refresh rotates it (compare-and-set on the current hash); the old hash
  moves to `previous_refresh_token_hash` AND is appended to
  `refresh_token_history` (the whole token family, kept until the session is
  purged). Presenting ANY rotated token again — however many rotations ago —
  is reuse: the session is revoked (`revoked_reason = refresh_token_reuse`),
  audited (`auth.refresh_token_reused`) and `401 REFRESH_TOKEN_REUSED`
  returned. **Grace window** (`AUTH_REFRESH_REUSE_GRACE_SECONDS`, default
  60 s, 0 = strict): the immediately previous token, while its successor is
  still unused, answers with the SAME successor (the successor is derived
  deterministically: HMAC-SHA256 with an HKDF key from `JWT_ACCESS_SECRET`,
  so no usable token is stored) — a lost response or two concurrent
  refreshes no longer sign the device out. Sessions slide by
  `JWT_REFRESH_TTL_DAYS` but never live longer than
  `JWT_SESSION_MAX_AGE_DAYS` (default 90) after sign-in. The mobile client
  retries a refresh that failed on the network after 1 s / 3 s / 8 s.
- **Web cookie mode** (`X-Client-Type: web`): refresh token only in the
  `evcar_rt` cookie (`HttpOnly; SameSite=Strict; Path=/api/v1/auth; Secure`
  when `AUTH_COOKIE_SECURE`, required in production), omitted from the body.
  The cookie is read **only** when the `X-Client-Type: web` header is present
  (a custom header cannot be sent cross-site without a CORS preflight →
  CSRF defence in depth). Failed refresh and logout clear the cookie.
- **Brute force**: route throttles (foundation presets: `auth` 10/min/IP for
  login/register/verify/reset/OAuth/delete/password; `authEmail` 5/15 min/IP
  for resend/forgot; `write` 60/min/IP for refresh/logout) plus
  `LoginAttemptsService` in Redis (memory fallback): ≤ 10 failures per
  (IP, e-mail) per 15 min, and per e-mail across all IPs an exponential lock
  after 5 consecutive failures (30 s, 1 min, 2 min … max 15 min) →
  `429 TOO_MANY_ATTEMPTS` with `Retry-After`, even for the right password —
  **except for known clients** (review 2): an IP or device id (`evcar_dev`
  httpOnly cookie for web, `X-Device-Id` installation id for mobile) that
  signed in successfully to that account in the last 90 days is exempt from
  the account-wide lock (the per-(IP, e-mail) limit still applies), so
  anonymous requests cannot keep the owner locked out. Re-authentication of
  a signed-in user (`DELETE /me`, `POST /me/password`) skips the account-wide
  lock too (the caller holds a valid session).
  Keys are HMACs (IP_HASH_SALT) of the e-mail/IP, never raw values. Counters
  are keyed by e-mail whether or not an account exists. The same limiter
  protects the password re-checks of `DELETE /me` and `POST /me/password`.
  `users.failed_login_count` / `locked_until` mirror the state for admins.
- **No user enumeration**: identical `401 INVALID_CREDENTIALS` for unknown
  e-mail and wrong password (unknown e-mails and password-less accounts still
  pay one argon2 verification against a dummy hash); resend/forgot always
  `202`; `EMAIL_NOT_VERIFIED`/`ACCOUNT_DISABLED` only after a correct password.
  **Register** for an address that already has an account answers exactly
  like a new sign-up (`201 {data:{user}}` built from the submitted values with
  a random, **non-persisted** id and `emailVerified:false`) and e-mails the
  real owner an "account exists" notice. This is the only way to satisfy both
  the fixed contract (the response contains a `user`) and "no enumeration";
  the id is never usable (login is required next). Concurrent sign-ups with
  one address get the same answer (a lost unique-index race is not surfaced
  as 409). Timing (review 2 measured 4-10 ms differences, enough to
  enumerate): register, resend-verification and forgot-password never answer
  before `AUTH_UNIFORM_RESPONSE_MS` (default 400 ms, 0 in tests) — measured
  live afterwards: ~406 ms on every branch. Auth e-mails never contain the
  user-chosen display name (anyone can register any address with any name).
- **Constant-time comparisons**: passwords via argon2.verify; refresh and
  e-mail tokens are looked up by the SHA-256 of a 256-bit random value (an
  attacker cannot steer hash prefixes, so index lookups leak nothing useful).
- **E-mail tokens** (`email_tokens`): 256-bit, SHA-256 stored, purpose-bound,
  expiring (verify `EMAIL_TOKEN_TTL_MINUTES`, reset/setup
  `PASSWORD_RESET_TTL_MINUTES`), single use (atomic `used_at IS NULL`
  update), a new token invalidates older unused ones of the same purpose,
  and a token only works while the account still has the address it was sent
  to. Resend/forgot have a 60 s per-account cool-down. A reset proves mailbox
  control: it marks the e-mail verified, clears lockout counters and revokes
  every session; the new password is checked **before** the token is burned.
- **Login requires a verified e-mail** (`403 EMAIL_NOT_VERIFIED`, only after a
  correct password). Reason: stops spam accounts and pre-account-hijacking.
- **E-mail links**: verification and app reset links use `SHARE_BASE_URL`
  (`/verify-email?token=`, `/reset-password?token=`, both mapped to app routes
  by the mobile deep-link table); web (`X-Client-Type: web`) resets use
  `ADMIN_BASE_URL/reset-password?token=`. The admin-editable `share.baseUrl`
  setting is deliberately NOT used: whoever controls that URL receives
  one-time tokens (an admin could otherwise harvest an owner's reset link).
  Mails also contain the raw code for manual entry (the mobile verify screen
  has a code field). Sent through the platform `MAIL_SENDER`
  (console/SMTP), asynchronously; failures are logged without the body.
- **Google / Apple**: ID tokens verified with `jose` against the provider JWKS
  (URLs, issuers and accepted client ids from the platform `OAUTH_CONFIG`),
  RS256/ES256, `aud` ∈ client ids, 30 s skew. Unconfigured →
  `503 INTEGRATION_NOT_CONFIGURED`. New accounts need a provider-verified
  e-mail. Linking: by `(provider, sub)`; else by e-mail — a verified local
  account is linked; an UNVERIFIED local account with that e-mail is taken
  over safely (its unproven password is dropped and its sessions revoked).
- **Account deletion** (`DELETE /me`, password re-auth): one transaction;
  personal data is removed by FK cascades (sessions, e-mail tokens,
  preferences, OAuth links, roles, favorites, garage, charging logs,
  reminders, trips, comparisons, notifications, device tokens…); public
  contributions (reviews, comments, Q&A, station reports/check-ins, uploads)
  stay with `user_id = NULL`; reporter IP hashes of the user's station
  reports are cleared; the user's own security events in `audit_logs` lose
  e-mail/IP/user agent unless the account held a staff role (kept for
  accountability); an `auth.account_deleted` row without personal data (no
  IP / user agent either, since review 2) is written. OAuth-only accounts must first set a password ("Forgot password").
  Admin audit annotations reference users by id only (no e-mail copies).
- **Audit**: automatic for successful mutating `/api/v1/admin` requests;
  security events: `auth.login`, `auth.login_failed`,
  `auth.refresh_token_reused`, `auth.password_reset`, `auth.password_setup`,
  `auth.password_changed`, `auth.reauth_failed`, `auth.oauth_linked`,
  `auth.account_deleted`, `security.permission_denied`, `users.roles.update`,
  `users.suspend`, `users.reactivate`, `users.sessions.revoke[_all]`,
  `roles.permissions.update`. Admin-route detection is case-insensitive and
  uses the matched route pattern (Express matches `/API/V1/ADMIN/...` too —
  a regression test covers it).
- **Housekeeping**: daily cron (only when `JOBS_ENABLED`) deletes sessions and
  e-mail tokens that ended more than 30 days ago.

## 3. Libraries / versions

No new dependencies (package.json untouched). Access/ID tokens use `jose`
6.2.12 directly instead of `@nestjs/jwt`/passport (one library for HS256
access tokens and Google/Apple JWKS verification, typed errors such as
`JWTExpired` for `TOKEN_EXPIRED`); passwords use `argon2` 0.45.1.

## 4. create-owner

`npm run create-owner -- --email x@y [--name "N"]` is implemented by the
foundation in `backend/src/cli/create-owner.ts` + `owner-setup.ts` (the npm
script in package.json points there; this area was told
`src/scripts/create-owner.ts`, but a second copy would be dead code, so none
was created). It creates or promotes the account (owner + user roles), stores a
SHA-256-hashed `setup_password` token (24 h, older ones invalidated) and
prints a one-time link `ADMIN_BASE_URL/reset-password?token=…`; nothing is
redeemable except through `POST /auth/reset-password`, which this area
implements (it accepts `reset_password` and `setup_password` tokens, audits
`auth.password_setup`). Verified by `test/auth-create-owner.e2e-spec.ts` and a
manual run of the real CLI + built server (see report). Suggested follow-ups
for the CLI owner: link to `/setup-password` (the admin's setup page) and
re-activate a suspended account being promoted (today it stays suspended and
login answers `ACCOUNT_DISABLED`).

## 5. Cross-area edits (minimal, required by the default-deny guard)

- `backend/src/modules/health/health.controller.ts`: `@Public()` on the
  controller (health must stay reachable without a token).
- `backend/test/utils/probe.module.ts`: `@Public()` on the two test probe
  controllers (foundation e2e tests call them anonymously).

## 6. Tests (all passing on 2026-09-25)

- Unit (`npm test`, next to the code): token service (claims, expiry,
  wrong secret/aud/iss, alg none, typ), session service (hash-only storage,
  rotation, reuse → family revoked + audit, lost CAS race, revoked/expired/
  disabled), JwtAuthGuard (public/optional auth, 401/TOKEN_EXPIRED,
  fail-closed admin), PermissionsGuard (all/any, class+method, owner, denial
  audit), RbacService (owner = all, cache, invalidate, TTL), password policy
  and argon2id, login-attempt limiter (backoff, cross-IP lock, pair window,
  no raw keys), audit redaction/diff/naming, OAuth verifier, housekeeping.
- e2e (`npm run test:e2e`, own cloned DB per spec): `auth-flow` (register →
  verify → login → refresh → logout, web cookie mode, reuse detection,
  concurrent refresh, expired/tampered tokens, logout by bearer, reset
  password, admin reset links, expired e-mail tokens), `auth-security`
  (enumeration, lockout, policy, suspended accounts, hashes only, cool-down,
  concurrent sign-up), `auth-oauth` (503 unconfigured; Google/Apple with local
  JWKS: create, link, takeover protection, invalid tokens), `users-me`
  (profile, sessions, password change, deletion isolation, last owner),
  `rbac-admin` (401 guests / 403 normal users on every admin endpoint,
  permissions, privileged roles, owner protections, matrix editing,
  fail-closed and case-variant admin routes), `audit-logs` (automatic
  records, annotate/@Audit/@SkipAudit, redaction, filters, 403 without
  audit.read), `auth-create-owner` (setup token → reset-password → owner).

## 7. Schema change requests

Done in review 2: `refresh_token_history` (migration
`20260926000000_refresh_token_family`, back-filled from
`previous_refresh_token_hash`).

## 8. Not done / limitations

- Apple `nonce` is not checked (the contract body has no nonce); Apple's
  real-name on first sign-in is not captured (not in the contract).
- No change-e-mail flow (`email_tokens.purpose = change_email` is unused) and
  no admin endpoint to delete another user's account (`users.delete` exists
  in the seed but nothing uses it yet).
- A lost refresh response is recovered only when the client retries within
  the 60 s grace window (the mobile client retries after 1/3/8 s); a device
  offline for longer than that after a lost response signs in again.
- `user_sessions.last_used_at` is updated on login/refresh, not on every
  request (≈15 min granularity).
- Auth e-mails are sent once, asynchronously; there is no retry queue. SMTP
  delivery was not tested against a real server here (console driver).
- The multi-instance RBAC cache is eventually consistent (≤ 15 s) for matrix
  edits made on another instance; user-role changes are immediate everywhere.
