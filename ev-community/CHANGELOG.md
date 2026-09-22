# Changelog

All notable changes to EV Community Egypt are documented here. Versioning: semantic (`vMAJOR.MINOR.PATCH`), one entry per release with date, commit reference, migration range and operational notes. Security fixes are described without exploitable detail.

## [Unreleased]

### Added
- Platform foundation: Laravel 13 + Inertia 3 + React 19 modular monolith, PostgreSQL schema (core, RBAC, settings, audit, files, integrations), bilingual AR/EN with RTL, portal-aware authentication with TOTP MFA, registration modes, security events, immutable audit log.
- Documentation set: conventions, domain contracts, architecture, business rules, deployment, backup/restore, operations, security, testing, go-live checklist, traceability matrix, generated database dictionary.
- Security headers middleware (nonce-based CSP, HSTS, frame/nosniff/referrer/permissions policies).

### Database changes
- Migrations `0001_01_01_*` and `2026_01_01_*` (core). Module migrations follow the domain-day scheme (`docs/CONVENTIONS.md §5`).

### Operational notes
- Requires PostgreSQL 16 and Redis; run `php artisan migrate --seed` then `php artisan ev:install`.
