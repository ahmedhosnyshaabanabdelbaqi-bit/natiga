# Security baseline

| Area | Implementation |
|---|---|
| Authentication | Fortify; bcrypt (12 rounds); strong password rules in production (min 12, mixed case, numbers, symbols, not compromised); login throttling (5/min per email+IP) with lockout events; disabled accounts cannot authenticate; last login recorded |
| MFA | TOTP with encrypted secret and recovery codes; mandatory for owner/super-admin/accountant and any user holding payments.approve, refunds.approve, users.manage or roles.manage; admin panel redirects until MFA is enabled |
| Sessions | database driver; list/revoke devices; revoked on password reset, account disable, critical role change; secure/HttpOnly/SameSite cookies in production |
| Authorization | RBAC (Spatie) with module-declared permissions; policies + `permission:` middleware; ownership scopes; super roles only via audited admin action; nobody can change their own roles; IDOR tests per entity; public ids are ULIDs |
| CSRF / XSS / SQLi | Laravel CSRF on every state-changing web route (no GET side effects); React escapes by default, rich text sanitised server-side (CMS/knowledge base allow-list); Eloquent/parameterised queries only; sort/filter whitelists |
| Files | MIME sniffing (finfo), extension allow-list per kind, size ceilings (images ≤ 10 MB, documents ≤ 20 MB, operator-adjustable downward), random storage names, private disk, authorised download endpoint or short-lived signed URLs, image re-encoding to WebP variants |
| Secrets | `.env` only (never in git or the settings table); `.env.example` lists names only; MFA secrets and VINs encrypted at rest; audit/logs redact password/token/secret keys |
| Rate limiting | named limiters: login, two-factor, passkeys, password-reset, locale, public-forms, search, uploads, api, webhooks (+ module limiters such as station reports and support tickets) |
| Headers | HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, Permissions-Policy, CSP (script/style self + Google Fonts + map tiles) — configured in the web server and `SecurityHeaders` middleware |
| Audit | immutable `audit_logs` (model guard + PostgreSQL trigger) with actor, action, entity, old/new, reason, request id, IP; security events table for authentication/role changes; audit is never used as the financial or inventory ledger |
| Privacy | data minimisation; VIN never public; masked member numbers in public QR verification; consent log (terms, privacy, marketing channels); deactivate ≠ delete; anonymisation keeps financial/legal records |
| Dependencies | `composer audit` / `npm audit` in CI; unsupported packages avoided |
| Logging | no passwords, MFA secrets, full tokens or payment credentials in logs; PII minimised; request id correlation |

Incident response: see `OPERATIONS.md`. Security-relevant admin alerts (super admin created, critical permission changed, large refund approved, integration credentials changed) are emitted as security events and notified to owners.
