# EV Car News — Admin panel

React 19 + TypeScript (strict) + Vite 8 + Mantine 9, React Router 8, TanStack Query 5,
react-i18next (Arabic RTL / English LTR). Decisions and versions:
[`docs/decisions/admin.md`](../docs/decisions/admin.md).

## Quick start

```bash
cd admin
npm ci
npm run dev            # http://localhost:5173 — /api is proxied to http://localhost:3000
```

The first owner account is created by the backend CLI (`npm run create-owner -- --email you@example.com`
in `backend/`); open the printed link — it lands on `/setup-password?token=…` (or
`/reset-password?token=…`) in this admin.

| Script                            | What it does                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm run dev`                     | Vite dev server with `/api` proxy (`EVCAR_API_PROXY_TARGET`, default `http://localhost:3000`) |
| `npm run build`                   | `tsc -b` + production build into `dist/`                                                      |
| `npm run typecheck`               | TypeScript project build without emit                                                         |
| `npm run lint`                    | ESLint (zero warnings allowed)                                                                |
| `npm test`                        | Vitest + Testing Library (jsdom)                                                              |
| `npm run format` / `format:check` | Prettier                                                                                      |
| `npm run api:types`               | `openapi-typescript ../backend/openapi.json -o src/api/schema.d.ts`                           |
| `npm run vendor:pannellum`        | copies Pannellum from `node_modules` to `public/vendor/pannellum/`                            |

Environment (see `.env.example`): `VITE_API_BASE_URL` (default `/api/v1`, same origin),
`EVCAR_API_PROXY_TARGET` (dev/preview proxy only). Nothing secret belongs in `VITE_*`.

## Structure

```
src/
  app/          providers, routes, layout (AppShell), auth (provider, guards, pages), i18n, theme, permissions
  api/          client.ts (fetch wrapper + refresh), errors, contract types, schema.d.ts (generated)
  components/   DataTable (+ URL table state), ConfirmDialog, FormFields/formUtils, StatusBadge,
                LocalizedTextInputs, State views, PermissionGate, SourceReliabilityBadge,
                MoneyInput, UnitInput, SearchInput, RichTextEditor, NotImplementedPage
  features/     one folder per section: routes.ts, api.ts, hooks.ts, pages/, components/, tests
  locales/      {ar,en}/<namespace>.json — one namespace per feature (+ common, auth)
  lib/          pure helpers (units, numbers, diff, format, colour, intl, storage)
  test/         setup, fetch mock, render helpers, fixtures
```

## Adding or replacing a section

1. Work inside `src/features/<folder>/` and your namespace files `src/locales/{ar,en}/<key>.json`
   (each must have `title` and `description`; ar/en keys must match — a test checks it).
2. Export a `FeatureDefinition` from `routes.ts` (path, nav group/order, icon, permission
   requirement, `status: 'implemented'`, lazy routes). Placeholders already exist for every
   planned section — replace the page and flip `status`.
3. Keep every endpoint call of the feature in its `api.ts`.
4. Use permission strings from `src/app/permissions.ts` (add new ones there).
5. Tests next to the code; `renderApp(path)` in `src/test/render.tsx` renders the real app
   with a mocked `fetch` (`mockFetch`).

## Auth model (web)

The access token lives only in memory; the refresh token is the httpOnly `evcar_rt` cookie
(`X-Client-Type: web`). `401 TOKEN_EXPIRED` triggers one shared refresh and one retry;
refreshes are serialised across tabs with the Web Locks API. Hiding UI is cosmetic — the
backend enforces every permission.
