# QA strategy

## Suites
| Suite | Location | Runs | Purpose |
|---|---|---|---|
| Unit | `tests/Unit/**` | CI, local | money, allocation, balances, capacity, warranty dates, settlement math, compatibility engine |
| Feature | `tests/Feature/<Module>/**` | CI, local | HTTP flows per module (happy path + validation) on PostgreSQL |
| Authorization / IDOR | `tests/Feature/<Module>/*AuthorizationTest.php` | CI | cross-account access, permission enforcement, role escalation |
| Concurrency / idempotency | `*ConcurrencyTest.php`, `*IdempotencyTest.php` | CI | last unit, last slot, duplicate approval/delivery/webhook |
| Database integrity | `tests/Feature/Database/**` | CI | constraints, triggers (audit immutability), reconciliation commands on seeded scenarios |
| Localization | `tests/Feature/Localization/**` | CI | AR/EN key parity, no raw keys rendered, RTL attributes, PDFs in both locales |
| Security | `tests/Feature/Security/**` | CI | rate limits, CSRF, upload validation, headers, XSS payloads escaped |
| Smoke | `tests/Smoke/**` + `ev:health` | after deploy | pages load, login works, queue/storage/DB reachable — never creates financial records |
| Performance / load | `docs/performance/` (k6 scripts) | before release | documented environment + dataset; targets in `GO_LIVE_CHECKLIST.md` |
| Accessibility / browser / mobile | manual checklists in `docs/qa/` | before release | WCAG 2.1 AA critical pages, Chrome/Safari/Edge/Firefox, iOS Safari camera/QR/uploads, 360/390/tablet widths, RTL review |

Run everything: `php artisan test` (PostgreSQL `ev_community_test`). CI: `.github/workflows/tests.yml`.

## Critical user flows (each has a documented test case)
Registration/login · membership approval · add vehicle · product search · vehicle compatibility · cart · checkout · order creation · payment submission · payment approval · receipt generation · member balance · group buy · purchase order · shipment allocation · warehouse receiving · inventory reservation · event booking · pickup · partial delivery · maintenance booking · additional work approval · service completion · warranty · charging station search · support ticket · refund · admin permission management.

## Acceptance scenarios (from the product brief)
- Financial: order 12,000, approved 7,000 → outstanding 5,000; new proof 1,000 keeps 5,000 until approved → 4,000.
- Duplicate approval: same approval twice → one approval, one ledger entry, one receipt.
- Webhook duplication: same external transaction id many times → one payment effect.
- Refund: full/partial/failed/duplicate/after closing/dual approval; approved ≠ paid.
- Money precision: 0.1 + 0.2; allocation of 100.00 across 3 items sums to 100.00.
- Multi-currency: USD purchase with FX snapshot; later rate change does not alter the transaction.
- Inventory: 1 unit, 2 concurrent orders → one reservation, never −1; ledger sequence receive 10 / reserve 4 / release 1 / deliver 3 / return 1 / damage 1 consistent.
- Shipment split 6 + 4; partial delivery 3 of 5; duplicate delivery scan from two devices → once.
- Event capacity 50 with 100 concurrent registrations → 50 confirmed, rest waiting list.
- Booking with 1 bay → no double booking; additional work 2,000 not approved until member approval; quote snapshot 1,500 stays after center price 1,800; product snapshot 5,000 stays after 5,500.
- Compatibility: verified / needs verification / not compatible workflows; CCS2 car never shown compatible with GB/T DC without a verified rule.
- Charging: community report never becomes "available now"; stale status → unknown.
- Files: user A cannot open user B's private document; executable/fake-extension uploads rejected.
- Login security, session invalidation on password change/disable/role change, role escalation rejected, CSRF, XSS, SQL injection on search/filters/sort, rate limits.
- Audit coverage for payment approval/rejection, refund, adjustment, inventory adjustment, price override, permission/role change, delivery override, supplier payment, period closing; audit tampering impossible.
- Import report completeness; export permission scoping; notification dedup; email failure does not fail the order.
