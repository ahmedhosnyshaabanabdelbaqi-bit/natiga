# Performance & load testing

Never quote a performance number without the environment it was measured on. Fill this template into `docs/performance/results/<date>.md`.

## Environment template
| Item | Value |
|---|---|
| Application version / commit | |
| App server CPU / RAM / storage | |
| PHP-FPM workers, OPcache | |
| PostgreSQL version / CPU / RAM / storage / shared_buffers | |
| Redis | |
| Network (same VPC? latency) | |
| Dataset (members / vehicles / products+variants / orders / ledger entries / movements / bookings / stations / audit events) | 4,000 / 6,000 / 10,000 / 50,000 / 100,000 / 100,000 / 25,000 / 1,000 / 250,000 (generate with `php artisan demo:generate-large-dataset`) |
| Cache state (cold / warm) | |
| Concurrency profile | 100 → 250 concurrent users, then event-day scenario |

## Targets (see docs/GO_LIVE_CHECKLIST.md)
- Authenticated common pages: P95 ≤ 500 ms, P99 ≤ 1,000 ms (server processing, excluding third-party APIs)
- Public cached pages: P95 ≤ 300 ms warm cache
- No single query > 500 ms unexplained; anything > 1 s analysed (`EXPLAIN ANALYZE`) and documented
- Error rate < 1 %, 5xx < 0.5 % within target capacity; critical transaction errors caused by the system: 0
- Event day (50 concurrent operational sessions scanning/delivering): duplicate deliveries 0, inventory corruption 0, P95 ≤ 1 s
- Core Web Vitals on public pages (mobile emulation, documented connection): LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms

## Running k6
```bash
k6 run -e BASE_URL=https://staging.example.com -e MEMBER_EMAIL=... -e MEMBER_PASSWORD=... docs/performance/k6/normal-load.js
k6 run -e BASE_URL=... -e STAFF_EMAIL=... -e STAFF_PASSWORD=... docs/performance/k6/event-day.js
```
Use a staging environment with a production-like dataset and **test-safe** accounts. The scripts never create real financial transactions: they browse, search, view dashboards and (event-day) perform QR verification against a dedicated test event with demo orders.

Record: throughput, P50/P95/P99, error rate, CPU/RAM/DB load, slow query log excerpts, and the exact k6 summary output.
