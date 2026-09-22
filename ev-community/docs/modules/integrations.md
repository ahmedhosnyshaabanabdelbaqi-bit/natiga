# Integrations provider layer

Module key: `integrations` (core, cannot be disabled). Code: `app/Modules/Integrations`.

Every external vendor the platform talks to (payment gateway, maps/geocoding, email, SMS, WhatsApp,
shipping carrier, charging network, exchange rates) sits behind a **category contract**. Business
modules only ever call the contract; the configured driver decides what actually happens. Nothing is
faked: a category is either configured and health-checked, or it resolves to a `NotConfigured*` driver
that throws `IntegrationNotConfiguredException` and the UI shows the documented fallback.

## 1. Using an integration from another module

```php
use App\Modules\Integrations\Services\Integrations;

if (Integrations::isConfigured('payment')) {
    $result = Integrations::payment()->createTransaction(new PaymentIntent('PAY-2026-000001', '1500.00', 'EGP', 'Order ORD-2026-000001'));
}

$geo = Integrations::map()->geocode('12 Tahrir Square, Cairo');          // ?GeoResult, never throws
$km  = Integrations::map()->distanceKm($lat1, $lng1, $lat2, $lng2);      // haversine, straight line
Integrations::status('shipping');   // ['key','status','driver','configured','last_checked_at','last_success_at','last_error','fallback']
Integrations::matrix();             // one row per category (admin page + production readiness report)
```

Category contracts are also injectable: `public function __construct(private MapProvider $map) {}`.

| Category key | Contract (`App\Modules\Integrations\Contracts\…`) | Operations | Default driver |
|---|---|---|---|
| `payment` | `PaymentProvider` (+ `ReceivesWebhooks`) | `createTransaction(PaymentIntent)`, `verifyTransaction(string $providerRef)`, `parseWebhook(Request): WebhookEventData` | `none` |
| `map` | `MapProvider` | `geocode`, `reverseGeocode`, `distanceKm`, `directionsUrl`, `geoUri`, `publicConfig` | `osm` |
| `email` | `EmailProvider` | `sendTest(string $email)` (application mail itself goes through Laravel `Mail`) | framework mailer (`MAIL_MAILER`) |
| `sms` | `SmsProvider` | `send(SmsMessage): SendResult` | `none` |
| `whatsapp` | `WhatsAppProvider` | `sendTemplate(WhatsAppTemplateMessage): SendResult` | `none` |
| `shipping` | `ShippingProvider` (+ `ReceivesWebhooks`) | `track(string)`, `supportsWebhooks()`, `parseWebhook(Request): array` | `manual` |
| `charging` | `ChargingProvider` | `fetchStations(): iterable<StationData>`, `fetchStatus(string): ?StationStatusData` | `none` |
| `exchange_rate` | `ExchangeRateProvider` | `fetchRate(base, quote, ?date): ?RateResult`, `supportsSync()` | `manual` |

Every driver also implements `Integration`: `key()`, `driver()`, `isConfigured()`, `healthCheck(): HealthResult`
(bounded by timeouts, never throws, never reports `operational` without evidence).

Rules for callers:
- Check `Integrations::isConfigured($key)` before offering a vendor-backed action; otherwise show the fallback
  (`__('integrations.fallback.<key>')`) and never pretend (no "paid online", no "live status", no "sent").
- `SendResult::status` is `sent | queued | logged | failed`; only `sent`/`queued` count as delivered (`isDelivered()`).
- Money is always a decimal string (`"1500.00"`), never a float.

## 2. Configuration and environment variables per integration

Driver names are read from `config('ev.integrations.<category>.driver')`. Only the **names** below are shown
in the admin matrix; values are never displayed or logged.

<a id="payment"></a>
### Payment gateway (`payment`)
`PAYMENT_PROVIDER` (`none` default), `PAYMENT_API_KEY`, `PAYMENT_SECRET`, `PAYMENT_WEBHOOK_SECRET`.
Fallback: manual payments (bank transfer / collection account) reviewed by the accountant.
Webhook URL when a gateway driver is installed: `POST /webhooks/payment`.

<a id="map"></a>
### Maps & geocoding (`map`)
`MAP_PROVIDER` (`osm` default, `none` disables), `MAP_NOMINATIM_URL` (default `https://nominatim.openstreetmap.org`;
point it at a self-hosted Nominatim for volume), `MAP_NOMINATIM_RATE_PER_SECOND` (default 1 — the public
instance's usage policy), `MAP_TILE_URL`, `MAP_PUBLIC_KEY` (only key ever sent to the browser), `MAP_SERVER_KEY`
(server side only), `MAP_DEFAULT_LAT`, `MAP_DEFAULT_LNG`, `MAP_DEFAULT_ZOOM`.
OSM driver behaviour: identifies the app (User-Agent with contact e-mail + Referer), at most N requests/second through
a shared rate limiter (waits once for the next slot, then gives up; a failed call — connection error, 5xx, 429 — is
retried once, no sooner than one rate-limit interval later), results cached 24 h (not-found 1 h, per locale
because Nominatim localises the display name), failures are logged and return `null` — never cached, never thrown.
Distances are straight-line (haversine, mean Earth radius 6371.0088 km) and must be labelled as estimates.
Fallback: list view without map.

<a id="email"></a>
### Email (`email`)
`MAIL_MAILER`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_SCHEME`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`
(and the vendor keys in `config/services.php` for ses/postmark/resend/mailgun).
`log` and `array` are **never** considered configured. SMTP requires host + port (+ username in production);
failover/roundrobin are configured when at least one child mailer is. Tests can force the configured state with
`config(['ev.integrations.email.force_configured' => true])`.
Fallback: in-app notifications only.

<a id="sms"></a>
### SMS (`sms`)
`SMS_PROVIDER` (`none`; `log` = development driver that writes to the log and reports `logged`, refused in
production), `SMS_API_KEY`, `SMS_SENDER_ID`. Fallback: in-app notifications and email.

<a id="whatsapp"></a>
### WhatsApp (`whatsapp`)
`WHATSAPP_PROVIDER` (`none`; `log` for development), `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.
Fallback: in-app notifications and email.

<a id="shipping"></a>
### Shipping tracking (`shipping`)
`SHIPPING_PROVIDER` (`manual` default: `track()` returns `null`, staff enter tracking events), `SHIPPING_API_KEY`.
A carrier driver that sets `supportsWebhooks() = true` receives `POST /webhooks/shipping`.
Fallback: manual tracking events (business rule 9: no "live tracking" claim without an integration).

<a id="charging"></a>
### Charging network (`charging`)
`CHARGING_PROVIDER` (`none`), `CHARGING_API_KEY`. Connector codes from vendors are normalised with
`App\Modules\Integrations\Support\ConnectorTypes::normalize()` onto `connector_types.code`.
Fallback: station data verified by staff and the community ("available now" is never shown without a live, fresh status).

<a id="exchange-rate"></a>
### Exchange rates (`exchange_rate`)
`EXCHANGE_RATE_PROVIDER` (`manual` default: reads the `exchange_rates` table only; `supportsSync() = false`),
`EXCHANGE_RATE_API_KEY`, `EXCHANGE_RATE_STALE_DAYS` (default 7: older latest rates are flagged stale and the
health check reports `degraded`). Fallback: manual rates entered by the accountant.

## 3. Exchange-rate convention and API

`exchange_rates` is **append-only** (model guards refuse update and delete).

- `base_currency` = the **foreign** currency, `quote_currency` = the local one (EGP), `rate` = how many quote
  units one base unit buys. **1 USD = 48.50 EGP → base=USD, quote=EGP, rate=48.5** (stored `decimal(18,8)`).
- Rates are dated in **Cairo calendar days**: any moment passed to `rate()` / `convertToBase()` is converted to the
  platform timezone first (`ExchangeRates::platformDay()`), so 2026-01-10 23:30 UTC uses the rate of 2026-01-11.
- `ExchangeRates::rate($base, $quote, ?$date)` returns the latest row **on or before** the date (latest `rate_date`,
  then latest id). If only the inverse pair exists the reciprocal is returned (8 decimals, HALF_UP) with source
  suffixed `:inverse`. Same currency → `['rate' => '1', 'source' => 'identity']`.
- `ExchangeRates::convertToBase($amount, $currency, ?$date)` returns the FX snapshot to store on converted records:
  `amount, currency, rate, source, rate_date, original_amount, original_currency` (business rule 1). Example:
  250 USD at 48.00 → `12000.00` EGP. No rate → `DomainException('integrations.errors.rate_missing')`.
  Historical records keep their snapshot; they are never revalued.
- `ExchangeRates::addManualRate($base, $quote, $rate, $date, $actor, $reason, correction: false)` — requires
  `exchange_rates.manage` and a reason (≥ 5 chars), active currencies, a positive rate and a date not in the future.
  The platform currency (EGP) is never accepted as the base (foreign) side: a swapped `EGP/USD` entry would feed the
  inverse lookup a wrong rate, so it is refused (`integrations.errors.base_must_be_foreign`).
  One plain entry per (pair, date, source); a duplicate returns a 409 conflict. To fix a wrong value submit it again
  with `correction: true`: a new row `source = manual:correction:<n>` with `source_reference = corrects:<id>` is
  appended and wins lookups for that date. Audited as `exchange_rates.added` / `exchange_rates.corrected`
  (old value in the audit trail).
- `ExchangeRates::sync()` pulls today's rate for every active foreign currency from a provider driver that
  supports sync (source `provider:<driver>`), logs an `integration_sync_logs` row and an `exchange_rates.synced` audit.

## 4. Webhooks

`POST /webhooks/{provider}` where `{provider}` is the category key (`payment`, `shipping`, …). Route name
`webhooks.handle`, middleware `api` + `throttle:webhooks` (120/min per IP), no session/CSRF.

1. The category must accept webhooks (configured driver implementing `ReceivesWebhooks`; shipping drivers also
   `supportsWebhooks()`); otherwise **404** and nothing is stored.
2. **Signature verification** — `verifyWebhookSignature(Request)` on the driver (HMAC of the raw body with
   `PAYMENT_WEBHOOK_SECRET`, vendor signature header, …; compare with `hash_equals`). An invalid signature is
   stored for forensics as `status = ignored`, `signature_valid = false`, answered **401**, and never processed or
   retryable. Its identity is not trusted, and its fingerprint lives in a separate namespace so a forged request can
   never occupy the fingerprint of a legitimate event.
3. **Idempotency** — `fingerprint = sha256(provider|external_event_id)` (or of the raw body when the vendor sends no
   id), unique on `(provider, fingerprint)`. A repeated delivery answers `200 {"duplicate": true}` and queues nothing.
4. Headers and payload are stored after `Sanitizer` redaction (authorization, cookies, signatures, tokens, secrets,
   api keys, passwords, card data, OTPs); bodies > 256 KB are truncated. The admin views redact again at display time.
5. `ProcessWebhookEventJob` (queued) locks the row, moves `received|failed → processing → processed|failed` and calls
   every handler registered for the provider.

### Registering a handler (other modules)

```php
// In your module ServiceProvider::boot()
WebhookHandlers::register('payment', fn (WebhookEvent $event) => app(HandleGatewayWebhook::class)->execute($event));
WebhookHandlers::register('shipping', CarrierTrackingWebhook::class);          // invokable class
WebhookHandlers::register('shipping', [CarrierTrackingWebhook::class, 'handle']);
```

Handlers must be **idempotent** (the same event can be retried) and throw to signal failure. Rebuild the vendor
request with `$event->asRequest()` and parse it with `Integrations::payment()->parseWebhook(...)`. Never trust the
redirect/return page for payments: verify with `verifyTransaction()` (business rule 3).

### Retry / failure behaviour

- Handler throws → event `failed`, `retry_count + 1`, error stored (sanitised); the queue retries the job
  (`tries = 5`, backoff 30 s / 60 s / 300 s).
- No handler registered → `failed` immediately without queue retries (a deploy must register one); the admin can
  retry afterwards.
- Admin retry (`integrations.manage`): only `failed` + `signature_valid = true` events; the row is locked and
  re-checked so concurrent clicks queue the event once; audited as `integrations.webhook_retried`.
- While a job works on an event it holds a per-event cache lock (`integrations:webhook-event:<id>`, 150 s; job
  timeout 60 s). A second job for the same event that finds the lock taken is released back to the queue (60 s)
  instead of processing concurrently.
- A worker that dies while `processing` (timeout kill, OOM, deploy restart) leaves the event in `processing` with an
  expired lock: the queue's redelivery reclaims it (logged as `integration.webhook.stale_processing_reclaimed`) and
  processes it, so it never stays stuck. When the job has used all its tries, `failed()` marks it `failed` (admin
  retry available).
- An event stored but never picked up (queue unreachable at arrival → the provider got a 5xx) stays `received`. A
  provider redelivery of the same event more than `WebhookIngest::STALE_RECEIVED_MINUTES` (5) after it first
  arrived queues it again; quicker duplicates do not.

## 5. Health checks, status matrix and the Exception Center

- `php artisan integrations:check [key] [--json]` — runs the checks, upserts `integration_providers`
  (status, last check, last success, last error, public config), logs an `integration_events` row
  (`health_check`). Exit code 1 when any integration is unavailable. Scheduled **hourly** (`withoutOverlapping`).
- `Integrations::status($key)`: `not_configured` when the driver is not configured, `unknown` when configured but
  never checked, otherwise the last check's status (`operational | degraded | unavailable`).
- Unknown driver names and `log` drivers in production resolve to the NotConfigured driver with a visible note
  (driver shown as `name ✕`, note in `last_error`).
- `OperationsExceptionsBridge` (only when `App\Modules\Reports\Operations\Services\OperationsExceptions` exists):
  `unavailable` raises a **p1**, `degraded` a **p2** exception in category `integrations` with dedup key
  `integration:<key>` (recurrences increment `occurrences`); `operational`/`not_configured` auto-resolve it.
  A failure of the Exception Center never breaks the health check.
- `IntegrationCall::run($provider, $operation, fn () => ..., reference: ..., meta: [...])` wraps every outbound call:
  duration, `integration_events` row (`success | failed | timeout`), sanitised error. `IntegrationCall::http($provider)`
  gives a client with timeouts (10 s / connect 5 s) and bounded retries on connection errors, 5xx and 429 —
  **use `retries: 0` for non-idempotent financial calls** (createTransaction, refunds).

## 6. Adding a vendor driver

1. Implement the category contract (e.g. `final class PaymobPaymentProvider implements PaymentProvider`) in the
   integration module or a vendor package. Read credentials from config (add keys to `config/ev.php`
   `integrations.<category>` or `config/services.php`), never `env()` at runtime, never log them.
2. `isConfigured()` returns true only when every credential is present; `healthCheck()` makes one cheap, bounded call.
3. Wrap every outbound call in `IntegrationCall::run()` and use `IntegrationCall::http()`; map vendor states to the
   DTO enums (`TransactionState`, `SendStatus`, `StationStatus`).
4. Register it: `Integrations::extend('payment', 'paymob', PaymobPaymentProvider::class);` in a ServiceProvider
   `register()`/`boot()` (or add it to `IntegrationsServiceProvider::DRIVERS`). `extend()` rejects classes that do not
   implement the contract.
5. Set `PAYMENT_PROVIDER=paymob`, run `php artisan integrations:check payment`, and verify the admin matrix.
6. Tests: fake the vendor with `Http::fake()` and `Http::preventStrayRequests()`; cover success, 4xx (no retry),
   5xx (retried then failed), timeouts (`ConnectionException` → `timeout` event), signature verification and
   webhook idempotency. See `tests/Feature/Integrations/Support/FakePaymentProvider.php` for a complete webhook driver.

## 7. Testing with `Http::fake`

```php
Http::preventStrayRequests();
Sleep::fake();                                     // retries/backoff and the Nominatim slot wait do not sleep
RateLimiter::clear('integrations:map:osm:nominatim');
config(['ev.integrations.map.nominatim_rate_per_second' => 100]);
Http::fake([OsmMapProvider::NOMINATIM_URL.'/search*' => Http::response([['lat' => '30.0444', 'lon' => '31.2357', 'display_name' => 'Tahrir Square']])]);

$this->assertNotNull(Integrations::map()->geocode('Tahrir Square, Cairo'));
Http::assertSentCount(1);
```

- Http fakes are first-match-wins: to change a response mid-test use one closure stub reading a variable.
- Swap a driver: `Integrations::extend('payment', 'fake', FakePaymentProvider::class); config(['ev.integrations.payment.driver' => 'fake']); Integrations::manager()->forget('payment');`
- Reset webhook handlers between tests with `WebhookHandlers::reset()`.
- Suites: `DB_DATABASE=ev_test_3 php artisan test tests/Feature/Integrations tests/Unit/Integrations`.

## 8. Admin pages, routes and permissions

| Method | Path | Route name | Permission |
|---|---|---|---|
| GET | `/admin/integrations` | `admin.integrations.index` | `integrations.view` |
| POST | `/admin/integrations/check/{key}` (`key` = category or `all`) | `admin.integrations.check` | `integrations.manage` (+ `throttle:integrations-tests`) |
| POST | `/admin/integrations/test-email` | `admin.integrations.test-email` | `integrations.manage` (+ `throttle:integrations-tests`: 10/min per user, shared by the three tool endpoints) |
| POST | `/admin/integrations/geocode-test` | `admin.integrations.geocode-test` | `integrations.manage` (+ throttle) |
| GET | `/admin/integrations/webhook-events` (`?provider=&status=&q=&event=`) | `admin.integrations.webhook-events.index` | `integrations.view` |
| GET | `/admin/integrations/webhook-events/{event}` | `admin.integrations.webhook-events.show` | `integrations.view` |
| POST | `/admin/integrations/webhook-events/{event}/retry` | `admin.integrations.webhook-events.retry` | `integrations.manage` |
| GET | `/admin/integrations/exchange-rates` (`?base=&source=manual\|provider`) | `admin.integrations.exchange-rates.index` | `exchange_rates.view` |
| POST | `/admin/integrations/exchange-rates` | `admin.integrations.exchange-rates.store` | `exchange_rates.manage` |
| POST | `/admin/integrations/exchange-rates/sync` | `admin.integrations.exchange-rates.sync` | `exchange_rates.manage` |
| POST | `/webhooks/{provider}` | `webhooks.handle` | signature (no session) |

Every admin route has `permission:` middleware **and** a `Gate::authorize()` / FormRequest check. Webhook events are
internal operational records (no member data is keyed by them), so they are addressed by numeric id.

Permissions: `integrations.view` (operations-manager), `integrations.manage` (owner/super-admin only) — declared in
`app/Modules/System/Permissions.php`; `exchange_rates.view` (accountant, procurement-officer) and
`exchange_rates.manage` (accountant) — declared in `app/Modules/Integrations/Permissions.php`.

Pages (`resources/js/pages/admin/integrations/`):
- `index.tsx` — summary cards, status matrix (integration, category, driver, configured, status + last check,
  last success, last error, fallback, docs anchor; details sheet with webhook URL, env variable names and public
  config), "Run check" per row and "Run all checks", email test (disabled with an explanation when not configured),
  geocoding test with result, directions link and `geo:` link, webhook status summary, recent activity.
- `webhook-events/index.tsx` — filterable list (provider, status, external id / event type search), detail drawer
  (`?event=<id>`, partial reload of the `selected` prop) with sanitised payload/headers, retry with confirmation.
- `webhook-events/show.tsx` — the same detail as a full page.
- `exchange-rates/index.tsx` — convention note, latest rate card per currency (stale flag), add manual rate /
  correction form, provider sync card, filterable history.

Shared UI for the module lives in `resources/js/features/integrations/`.

## 9. Tables

`integration_providers` (one row per category: status, last check/success/error, public config),
`integration_events` (append-only call log, sanitised meta), `integration_sync_logs` (bulk sync runs),
`webhook_events` (unique `(provider, fingerprint)`), `currencies`, `exchange_rates` (unique
`(base_currency, quote_currency, rate_date, source)`, append-only).
