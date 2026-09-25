# EV Car News — backend

NestJS 12 modular monolith · Prisma 7 on PostgreSQL 16 + PostGIS · Redis/BullMQ · OpenAPI.
Decisions and schema overview: [`../docs/decisions/backend-core.md`](../docs/decisions/backend-core.md).
Binding contract: [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

## Quick start (local)

```bash
cp ../.env.example .env          # adjust DATABASE_URL / REDIS_URL if needed
npm ci                           # also runs `prisma generate`
npm run prisma:deploy            # apply migrations
npm run db:seed                  # reference data (idempotent)
npm run db:seed:demo             # optional FICTIONAL demo data (never in production)
npm run create-owner -- --email you@example.com   # prints a one-time setup link
npm run start:dev                # http://localhost:3000/api/v1 · docs at /api/docs
```

## Scripts

| Script | What it does |
|---|---|
| `build`, `start`, `start:dev`, `start:prod` | Compile / run (`dist/main.js`). |
| `lint`, `format`, `format:check`, `typecheck` | ESLint (type-aware) + Prettier + `tsc --noEmit`. |
| `test` | Unit tests (`src/**/*.spec.ts`). |
| `test:e2e` | e2e tests (`test/**/*.e2e-spec.ts`) — creates and drops its own databases. |
| `prisma:migrate` | `prisma migrate dev` (use `-- --create-only --name <x>` to review SQL first). |
| `prisma:deploy`, `prisma:status`, `prisma:generate` | Apply migrations / status / regenerate client. |
| `prisma:check-drift` | Fails (exit 2) if `prisma/schema` and the migrations disagree. |
| `db:seed`, `db:seed:demo` | Reference seed / demo seed. |
| `openapi:export` | Writes `openapi.json` (no DB needed). |
| `create-owner -- --email x [--name y]` | First owner + one-time password-setup link. |

Production image: `Dockerfile` (entrypoint runs `prisma migrate deploy` and the reference seed when
`RUN_MIGRATIONS=true` / `RUN_REFERENCE_SEED=true`). CLIs in the image: `node dist/cli/<name>.js`.
The reference seed never overwrites admin decisions (settings, markets, currencies, permissions an
owner removed from a role); it only adds what is new in code.

### Behind a reverse proxy (`TRUST_PROXY`) — required

Rate limits, the login lockout, session IPs and audit IPs use the client IP. Behind nginx
(`admin/nginx.conf`), the Vite dev proxy, a load balancer or a CDN, **set `TRUST_PROXY`**, otherwise
every client shares the proxy's address (one client's failed logins would lock out all admins):

| Setup | `TRUST_PROXY` |
|---|---|
| API reachable only through one proxy (e.g. the admin's nginx) | `1` (or the proxy's IP/subnet) |
| Load balancer → nginx → API | `2`, or the list of both subnets |
| `docker-compose.yml` (dev) | `loopback,uniquelocal` (default in the compose file) |
| API exposed directly, no proxy | `false` (default) |

Never use `true` (it trusts any `X-Forwarded-For` a client sends; refused in production) and do not
publish the API port directly while trusting a proxy. The shipped nginx overwrites
`X-Forwarded-For` with the peer address, the Vite proxy forwards it (`xfwd`).

## Conventions for module authors

- Work inside `src/modules/<name>/` (the module is already registered in `AppModule` via
  `src/modules/feature-modules.ts`). Provider adapters go in `src/providers/<type>/`.
- Config: inject `AppConfig` (typed, validated). New env vars → `src/config/env.schema.ts`,
  `src/config/app-config.ts` and `/.env.example` (a unit test enforces they match).
- Database: inject `PrismaService`; import types/enums from `src/generated/prisma/client`.
  Geo queries: `src/prisma/geo.ts` / `prisma.findNearby()`. Schema changes: see the decisions doc §3.
- Responses: `ok(data)` → `{ data }`, `paginated(rows, total, page)` → `{ data, meta }`,
  `PaginationQueryDto` + `toPageRequest()`; Swagger helpers `ApiDataResponse`, `ApiPaginatedResponse`,
  `ApiErrorResponses`, `ApiLocale`.
- Errors: throw `AppException` (`AppException.notFound('ARTICLE_NOT_FOUND', { ar, en })`,
  `AppException.integrationNotConfigured('routing')` → 503, `AppException.notImplemented(...)` → 501).
- Locale: `@Lang()`, `@Market()`, `@ReqLocale()`; anywhere: `RequestContext.get()`
  (requestId, ip, userAgent, lang, market, userId — auth sets `RequestContext.set({ userId, userLabel })`).
  After changing markets or the default market call `MarketResolverService.invalidate()`.
- Rate limits: `@RateLimit('auth' | 'authEmail' | 'search' | 'reports' | 'uploads' | 'comments' | 'write')`,
  `@SkipThrottle()` for health-like routes.
- Utilities: `normalizeSearchText`/`slugify` (Arabic-aware), `convertUnit`/`roundTo`, money helpers
  (`toMoney`, `convertMoneyEstimate` → always labelled estimate), `sanitizeArticleHtml`,
  `htmlToPlainText`, `sanitizePlainText`, `escapeHtml`, `generateToken`/`hashToken` (store hashes only),
  `SafeFetchService` for every server-side request to a URL an admin/user can influence.
- Jobs: queue names in `src/jobs/queues.ts`; register with `BullModule.registerQueue`, and provide
  processors via `jobsEnabledProviders([...])` so e2e tests and API-only instances run no workers.
- e2e: `const t = await createTestApp({ imports?, env?, override? })` → `t.http().get(...)`, `t.prisma`,
  `await t.close()`. Every app gets its own cloned, migrated, reference-seeded database.
