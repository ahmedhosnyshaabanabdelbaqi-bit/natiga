# Production readiness gate & go-live checklist

Go-live is blocked if any of the following is true: P0 bugs > 0, P1 critical bugs > 0, known financial or inventory corruption, critical authorization failure, backup not tested, restore not tested, production secrets missing, HTTPS missing, owner account not secured with MFA, critical monitoring missing.

## Readiness report (fill before launch — `docs/readiness/<date>.md`)
- Functional status per module (module status matrix: not started / in development / testing / ready / disabled / deferred; completion computed from deliverables, not estimated)
- Test results (critical automated tests 100 %, P0/P1 100 %, regression ≥ 98 %, no flaky tests counted as passing)
- Security status (0 critical/high vulnerabilities or formal risk acceptance; dependency audit; secrets scan; MFA acceptance)
- Performance results with environment, dataset (4,000 members / 6,000 vehicles / 10,000 products / 50,000 orders / 100,000 ledger entries / 100,000 movements / 25,000 bookings / 1,000 stations / 250,000 audit events), concurrency, cache state; targets: authenticated P95 ≤ 500 ms, P99 ≤ 1 s, public cached P95 ≤ 300 ms, no single query > 500 ms unexplained, load test at 100/250 concurrent users with error rate < 1 % and 5xx < 0.5 %, event-day scenario with 50 operational sessions and 0 duplicate deliveries
- Backup/restore: last backup, last restore test date, measured RTO, RPO adopted
- Known issues and deferred features (each with reason, dependency, proposed resolution — never silently dropped)
- Integration status matrix (from `/admin/integrations`): configured? tested? production credentials? last successful test, fallback, owner
- UAT sign-off per role (owner, accountant, warehouse, delivery, maintenance manager, service center, member)

## Pre-launch checklist
- [ ] Owner account created with `ev:install`, MFA enabled; no default/test credentials
- [ ] Roles reviewed; least privilege verified; staff accounts have MFA
- [ ] Branding, organisation details, contact info, policies (terms/privacy reviewed by the business owner and legal counsel), currencies, governorates
- [ ] Membership registration mode, referral settings
- [ ] Products, prices, stock imported and reconciled (import report: imported + rejected + skipped = source rows)
- [ ] Bank/collection accounts configured; deposit and refund thresholds set
- [ ] Service centers, partners, charging stations imported with sources and verification dates
- [ ] Email domain (SPF/DKIM/DMARC) and provider tested; maps provider tested; other integrations either configured & tested or marked Not Configured
- [ ] HTTPS only, secure cookies, security headers, rate limits verified
- [ ] Backups scheduled, encrypted, off-site; restore test passed; monitoring (errors, DB, queue, storage, backups) with an on-call recipient
- [ ] No demo data in the production database (`demo:*` refuse to run)
- [ ] Documentation delivered (README, architecture, database, deployment, backup/restore, admin/member/partner guides, integrations, troubleshooting)

## Pilot & rollout
1. Pilot with 20–50 members, one group buy, a limited catalogue, one or two service centers, one small pickup event. Monitor registration, orders, payment matching, receipt accuracy, inventory accuracy, pickup time, bookings, feedback, tickets. P0 bugs must be 0 before expanding.
2. Expand to ~100, then ~500, then all members, with measurable checkpoints at each step (or another split the operating model requires).
3. Feature flags/module toggles allow deploying features disabled and enabling them gradually.
