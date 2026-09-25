# Admin panel — decisions (area: `admin/`)

Owner: admin foundation agent. Scope: `admin/` only. Status date: 2026-09-25.

## 1. Versions (checked with `npm view` on 2026-09-25, pinned exactly in `admin/package.json`, lockfile committed)

| Package | Version | Note |
|---|---|---|
| react / react-dom | 19.3.0 | Mantine 9 and React Router 8 require ≥ 19.2 |
| vite | 8.3.1 | Rolldown-based; `@vitejs/plugin-react` 6.1.1 |
| typescript | **6.0.3** | **Not TS 7.0.2 (latest).** `typescript-eslint` 8.70.1 (latest) declares `typescript >=4.8.4 <6.1.0`; TS 7 (native compiler) is not supported by the lint toolchain. 6.0.3 is the newest version every tool accepts. |
| openapi-typescript | 7.13.0 | Peer dep is `typescript ^5.x`; an npm `overrides` entry lets it use TS 6.0.3. Verified: generating types from a sample OpenAPI 3 document works with TS 6.0.3. |
| react-router | 8.4.0 | Data router (`createBrowserRouter`); `react-router-dom` no longer exists in v8, `RouterProvider` comes from `react-router/dom`. Requires Node ≥ 22.22 (container has 22.22.2). |
| @mantine/* (core, hooks, form, dates, notifications, modals, dropzone, tiptap) | 9.6.2 | `DirectionProvider` for RTL; dates use `YYYY-MM-DD` strings. |
| @tiptap/* | 3.31.3 | StarterKit (incl. Link/Underline), TableKit, Image, Youtube |
| @tanstack/react-query | 5.103.2 | |
| i18next / react-i18next | 26.4.2 / 17.0.15 | |
| eslint / typescript-eslint | 10.11.0 / 8.70.1 | flat config, `strict` preset, react-hooks 7, react-refresh |
| prettier | 3.9.9 | |
| vitest / jsdom / @testing-library/react | 5.0.1 / 30.1.1 / 16.3.3 | |
| @dnd-kit/core + sortable | 6.3.1 + 10.0.0 | keyboard-accessible drag sorting (home sections); also up/down buttons |
| @fontsource/ibm-plex-sans-arabic | 5.3.0 | **OFL-1.1**, self-hosted (no Google Fonts CDN); licence ships in the package |
| pannellum | 2.5.7 | MIT; vendored to `admin/public/vendor/pannellum/` (`npm run vendor:pannellum`, licence + VERSION.json copied) |

## 2. Architecture decisions

- **Layout** (ARCHITECTURE §5): `src/app/` (providers, routes, layout, auth, i18n, theme, permissions), `src/api/` (fetch wrapper, contract types, generated `schema.d.ts`), `src/features/<feature>/` (routes.ts, api.ts, hooks, pages, components), `src/components/` (shared UI), `src/lib/` (pure helpers), `src/locales/{ar,en}/<namespace>.json`.
- **Feature isolation**: every section is a `FeatureDefinition` exported from `src/features/<folder>/routes.ts` (key = i18n namespace, path, nav group/order, icon, permission requirement, status, lazy routes). `src/features/registry.ts` is the only shared list (one import line per feature). Locale namespaces are discovered with `import.meta.glob`, so adding a namespace never touches a shared file.
- **All 24 sections exist**; 17 are honest placeholders (`status: 'placeholder'`) that render "هذا القسم قيد التنفيذ / Not implemented yet" plus the planned scope, show a "قريبًا / Soon" badge in the sidebar, and never show sample data.
- **Auth (web contract §4.4.1)**: access token only in memory; refresh token only as the httpOnly `evcar_rt` cookie (`X-Client-Type: web`, `credentials: 'include'`). On load the app calls `POST /auth/refresh` to restore the session.
  - `401 TOKEN_EXPIRED` → one refresh (single-flight: concurrent requests share it) → one retry; a second 401 is surfaced, never looped.
  - Refreshes are serialised across browser tabs with the Web Locks API (`navigator.locks`), so two tabs never rotate the same refresh cookie concurrently (which rotation-reuse detection would treat as theft).
  - Proactive refresh when the in-memory token is already (almost) expired.
  - Any other 401 while signed in (revoked session, suspended account) ends the session → `/login?reason=expired&next=…`.
  - Refresh rejected (400/401/403) → session expired; network/5xx during refresh do **not** log the user out (login page offers "retry").
  - Logout waits for an in-flight refresh first (found by a test: otherwise a refresh started at page load could re-authenticate after logout).
  - `next` redirects are restricted to same-app paths (no open redirect).
- **Permissions** are cosmetic in the UI (server enforces). All permission strings used by the admin are in `src/app/permissions.ts` (`PERMISSIONS`). Matching supports exact keys, a granted `*`, granted `resource.*`, and required `resource.*` ("any action on resource"). Sections use prefix requirements (e.g. `users.*`), write buttons use exact keys (`users.manage`, `settings.write`, …). Accounts with no staff role and no admin permission get a "no admin access" page.
- **Lists**: server-side pagination/sort/filter; state lives in the URL (reload/back/share keep it). `page`/`pageSize` match the backend `PaginationQueryDto`. `sort` is `field` / `-field` and is **only sent when the user picks a non-default order** (so list endpoints work even before they support sorting; a custom sort against an endpoint without it shows the 422 in the table).
- **Error envelope** parsed into `ApiError {status, code, message, details, requestId}`; 422 `details` `[{field, constraints}]` (backend `validation.pipe.ts`) are mapped onto form fields (`applyServerErrors`). Mutations show a toast unless the form shows the error inline.
- **Missing values**: `null` is rendered as "غير متوفر / Not available", never 0. `MoneyInput` keeps decimal strings (no floats) and accepts Arabic-Indic digits; `UnitInput` returns `null` for empty input and keeps original value/unit when converting from alternative units. Range test cycles are never converted.
- **Theme/branding** comes from public `GET /app-config` (`branding.*`); default electric blue `#0A5CFF` / cyan `#00C2E0`; light by default, dark mode toggle (Mantine colour-scheme manager, localStorage); the Branding settings tab shows a WCAG contrast check.
- **Settings** are edited per key (`PUT /admin/settings/:key {value}`) and saving always merges into the stored value, so unknown sub-keys written by other teams are preserved.
- **Rich text** (`src/components/RichTextEditor/`): Mantine TipTap; headings, lists, quote, https/mailto links (`rel=noopener noreferrer nofollow`), tables, https images with mandatory alt text (no data: URIs), video embeds allow-listed to YouTube and emitted via `youtube-nocookie.com`. The backend sanitizer remains the real gate.
- **Drawers** use Mantine's logical `position="right"` (renders on the left in RTL).
- **Deployment**: `admin/Dockerfile` (node build → nginx) + `nginx.conf` (SPA fallback, same-origin `/api` proxy so the refresh cookie stays first-party, CSP and security headers via an included snippet).

## 3. API shapes the admin codes against (aligned with the real backend on 2026-09-25)

Originally inferred from the Prisma schema; aligned by the integration pass
(`docs/decisions/integration.md`) against the running backend and
`backend/openapi.json`. Feature types now come from the generated
`src/api/schema.d.ts` (`components['schemas'][...]`), so a backend DTO change
breaks `npm run typecheck` instead of failing silently. Only JSON columns
(settings values, audit before/after) stay `unknown`.

| Feature file | Calls (real) |
|---|---|
| `features/users/api.ts` | `GET /admin/users?page&pageSize[&sort=createdAt\|email\|displayName\|lastLoginAt][&q][&role][&status]` → `AdminUserListItemDto`; `GET /admin/users/:id` → `AdminUserDetailDto`; `PUT /admin/users/:id/roles {roles}` (users.manage; owner/admin roles need owner / users.manage_admins); `PATCH /admin/users/:id/status {status,reason?}` (**users.block**); `GET/DELETE /admin/users/:id/sessions[/:sid]` (DELETE all → `{data:{revoked}}`); `GET /admin/roles` → `RoleDto` (`permissionsEditable`, `userCount`); `GET /admin/permissions`; `PUT /admin/roles/:key/permissions {permissions}` (roles.manage **and** owner) |
| `features/audit-log/api.ts` | `GET /admin/audit-logs?…[&sort=createdAt\|-createdAt]` → `AuditLogDto`; `GET /admin/audit-logs/:id`. Only `createdAt` is sortable server-side (the other sort headers were removed). |
| `features/settings/api.ts` | `GET /admin/settings` → `SettingDto[]` (`isDefault`, `warnings[]`); writes are **one route per key with the raw value as body**: `PUT /admin/settings/branding` (name, logoUrl **and colours** — there is no `theme.colors` key), `PUT …/defaults`, `PUT …/home-sections {sections}`, `PATCH …/features`, `PUT …/map` (maxZoom 1–22 required), `PUT …/share`, `PUT …/legal`, `PUT …/app-links`; `POST …/:key/reset`; `POST/DELETE …/branding/logo` (multipart `file`). |
| `features/markets/api.ts` | `GET/POST /admin/markets`, `PATCH /admin/markets/:code` (`isDefault` market cannot be disabled → 409); `GET/POST /admin/currencies`, `PATCH/DELETE /admin/currencies/:code` (409 `CURRENCY_IN_USE`). The market form only offers registered currencies. |
| `features/translations/api.ts` | `GET /admin/translations?…[&sort=namespace\|key\|locale\|updatedAt (±)]`; `POST` (create, 409 when the key exists → the admin then PATCHes the existing row); `PATCH /admin/translations/:id {value}`; `DELETE /:id`. |
| `features/system/api.ts` | `GET /admin/system/integrations` → `{items: IntegrationStatusDto[], capabilities, note}`; `POST …/integrations/:id/check` (settings.write or integrations.write); `GET /admin/system/jobs` → `{redis, workersEnabledHere, queues:[{name,counts,isPaused,workers}]}` + `GET /admin/system/jobs/:queue?state=failed` for recent failures; `GET /admin/system/overview` → `SystemOverviewDto` (per-status counts, staleData, imports, warnings, demo rows); public `GET /health` for version/uptime/dependency checks. |

Permission strings (single file `src/app/permissions.ts`, all exist in the
backend seed): `users.read`, `users.manage`, `users.manage_admins`,
`users.block`, `roles.read`, `roles.manage`, `audit.read`, `settings.read`,
`settings.write`, `markets.write`, `translations.write`, `integrations.read`,
`integrations.write`, `system.read`, `system.jobs`, `imports.read`. There is
no `markets.read` / `translations.read`: reading those sections needs
`settings.read` (or the write permission), exactly as the API checks.

## 4. Not done / not verified

- Verified against the real backend on 2026-09-25: Playwright/Chromium run
  (throwaway script, not committed) of login → reload (cookie restore) →
  dashboard → users + drawer → roles → settings save verified through the
  public `/app-config` → system → markets → audit log → logout, in Arabic RTL
  and English LTR, 31/31 checks, no console errors, no unexpected API errors.
  Screenshots: `docs/screenshots/phase1/`.
- Role *definitions* (create/delete roles) are not editable — the API has no
  such endpoint; permission sets of existing roles are editable by owners.
- Logo upload works (server re-encodes to PNG); there is still no general
  media library (later phase).
- Docker image/nginx config were not built or run (no Docker daemon, no nginx in the container).
- Provider `reason`/`notes` texts on the System page are server strings in English.
