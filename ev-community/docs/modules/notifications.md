# Notifications

Module key: `notifications` (core, cannot be disabled). Code: `app/Modules/Notifications`.

The module owns every message the platform sends to a person: the in-app notification center (member, admin,
partner portals), email, SMS and WhatsApp deliveries, member notification preferences and channel consent,
admin announcements, and admin-editable email templates. Nothing is faked: a channel that has no configured
provider is recorded as `skipped: not_configured`, never as sent.

## 1. Sending a notification from another module

```php
use App\Modules\Notifications\Services\Notify;

Notify::send(
    $order->user,                          // recipient (App\Models\User)
    'orders.confirmed',                    // notification key (also the email template key)
    ['order_number' => $order->order_number, 'amount' => Money::format($order->total_amount, 'EGP', $order->user->preferredLocale())],
    'orders',                              // category (see §2)
    transactional: true,                   // false = marketing (opt-in rules, see §2)
    dedupKey: 'orders.confirmed:'.$order->id,
    url: '/account/orders/'.$order->public_id,
    channels: ['in_app', 'email'],         // null = in_app + email; in_app is always added
);

Notify::sendMany($usersOrBuilder, 'offers.group_buy_update', [...], 'offers', dedupKey: 'gb:'.$gb->id.':opened'); // chunked (500)
```

Signature: `Notify::send(User $user, string $key, array $data = [], string $category = 'system', bool $transactional = true, ?string $dedupKey = null, ?string $url = null, ?array $channels = null): ?Notification`.
It returns the stored in-app notification, or `null` only when a marketing notification was suppressed because the
member switched off in-app marketing notifications.

Rules for callers:

- **Call it after commit.** Inside an Action, use `DB::afterCommit(fn () => Notify::send(...))` or a queued listener.
  If it is called inside a transaction anyway, the notification and its delivery rows roll back with it and no job is
  dispatched (jobs use `afterCommit()`).
- **Always pass a dedup key** for anything that can be retried (listeners, jobs, webhooks). The pair
  `(user_id, dedup_key)` is unique in the database: a second call returns the existing row and creates no new
  deliveries, even under a race. Recommended shape: `<module>.<event>:<entity id>[:<version>]`.
- **Text.** Title/body are rendered once, in the recipient's locale (`users.preferred_locale`), in this order:
  1. `$data['_title']` / `$data['_body']` literals (string, or `['ar' => …, 'en' => …]`);
  2. `$data['_title_key']` / `$data['_body_key']` — translation keys in your module's lang file
     (recommended for wave-2 modules: `orders.notifications.confirmed.title`);
  3. `notifications.templates.<key>.title|body` in `lang/{ar,en}/notifications.php` (keys may be nested:
     `members.status.active`);
  4. `$data['title']` / `$data['body']`, then a generic translated title.
  Placeholders are Laravel `:name` style, filled from `$data` (+ `member_name`, `member_number`, `site`). A
  placeholder you do not pass renders empty (never a literal `:reason`). Keys starting with `_` are meta and are not
  stored; everything else in `$data` is stored in `notifications.data` (never put secrets there).
- **Links.** `$url` (or `$data['_url']`, or an internal `$data['url']`) must be an internal path (`/account/...`) or an
  `https://` URL. Anything else (`javascript:`, `//host`, `http://`) is dropped. Emails/SMS make internal paths absolute
  with `APP_URL`.

## 2. Categories, preferences and channel rules

Categories: `orders payments shipping pickup maintenance warranty charging offers support system`
(`NotificationCategory`). Preferences use the same categories plus the pseudo-category `marketing`, which covers every
notification sent with `transactional: false`.

| Channel | Transactional notification | Marketing notification (`transactional: false`) |
|---|---|---|
| `in_app` | always delivered (`sent`, becomes `read` when opened) | preference `marketing.in_app` (default on) — off suppresses the notification |
| `email` | provider configured → always (locked on, cannot be disabled) | provider configured AND preference `marketing.email` (default off) AND marketing email consent |
| `sms` / `whatsapp` | provider configured AND preference `<category>.<channel>` (default on) AND channel consent | provider configured AND preference `marketing.<channel>` (default off) AND channel consent |

- "Configured" comes from the Integrations module (`Integrations::isConfigured('email'|'sms'|'whatsapp')`);
  `config('ev.integrations.email.force_configured') === true` forces email on for tests/staging.
- Consent lives in the core append-only `consent_logs` table (`marketing_email`, `marketing_sms`, `marketing_whatsapp`;
  latest row wins) and is shared with the Members privacy page. On `/account/notification-preferences` switching
  marketing email on/off records/withdraws the email consent; SMS/WhatsApp have explicit "I agree to receive…" switches.
- Every requested channel gets a `notification_deliveries` row; skipped rows carry the reason in `error`:
  `not_configured`, `preference_disabled`, `no_consent`, `no_email`, `no_mobile`, `logged_only` (development `log`
  driver: written to the log, never delivered).
- `NotificationPreferences::allows($user, $category, $channel)` answers the preference question (locked pairs are
  always true; consent is checked separately by the pipeline).
- Disabling a locked pair (`in_app`/`email` of a transactional category) is rejected with 422 and nothing is saved.
  Preference changes are audited as `notifications.preferences_updated` (old/new per `category.channel`).

## 3. Delivery jobs and retry semantics

`SendEmailNotification`, `SendSmsNotification`, `SendWhatsAppNotification` (base `DeliveryJob`), one per delivery row,
dispatched `afterCommit`:

- only `queued` deliveries are processed — a duplicated or late job is a no-op;
- a short cache lock per delivery prevents two workers from sending the same row concurrently;
- the channel rules are re-evaluated right before sending (provider disconnected, consent withdrawn, preference
  changed → `skipped` with the reason);
- 3 attempts, backoff 30 s / 2 min / 10 min; the last failure marks the delivery `failed` with the provider error and
  raises a `notifications` exception in the Exception Center (dedup key `notifications:delivery_failed:<channel>`,
  occurrences accumulate while it is open);
- staff with `notifications.manage` retry failed deliveries at `/admin/notifications/deliveries` (the channel must be
  configured again); retries are audited (`notifications.delivery_retried`).

Email: `NotificationMail` renders `resources/views/mail/notification.blade.php` (layout `mail/layout.blade.php`: RTL for
Arabic, branding colours/logo/site name from Settings, sender name from `notifications.email_from_name_ar|en`) plus a
plain-text alternative (`mail/notification-text.blade.php`). Marketing emails carry an opt-out footer.
SMS: title + body + link, max 480 characters. WhatsApp: the pre-approved template
`config('ev.integrations.whatsapp.notification_template')` with parameters `[title, body, link]`.

## 4. Email templates

`/admin/notifications/templates` lists every key known to `TemplateRegistry`: all `notifications.templates.*` lang
entries (any depth) plus keys registered by modules. Admin overrides live in `email_templates` (one row per key, only
while customized) and win over the defaults per field and locale; an empty field falls back to the default.

Register your module's keys in your ServiceProvider `boot()` so they appear in the admin list with their variables:

```php
use App\Modules\Notifications\Services\TemplateRegistry;

TemplateRegistry::register('orders.confirmed', ['order_number', 'amount'], module: 'orders');
// Defaults from your own lang file instead of notifications.php:
TemplateRegistry::register('group_buying.closed', ['reference', 'deadline'], 'group_buying',
    subjectKey: 'group_buying.notifications.closed.title', bodyKey: 'group_buying.notifications.closed.body');
```

Every template may also use `member_name`, `member_number`, `site`, `url`, `title`, `body`.
Template syntax: plain text with line breaks, `**bold**`, `[text](https://… or /path)`, `{{variable}}` placeholders
(lang defaults use `:variable`). Security model (`EmailTemplateRenderer`): the template is tokenised, HTML-escaped,
the markdown subset applied, and variable values substituted last and always escaped — values are never interpreted as
markup; unknown `{{variables}}` render blank; links are validated after substitution. Saving rejects HTML tags,
HTML entities, `javascript:` and undeclared `{{variables}}` (422). Previews use sample data only
(`notifications.sample.*`) and are shown in a sandboxed iframe. Updates/resets are audited
(`notifications.template_updated`, `notifications.template_reset`).

## 5. Announcements

`/admin/notifications` (list/detail: `notifications.view` read-only; create/edit/send: `notifications.manage`).
A campaign has bilingual title/body, optional link, category, marketing flag, channels (email/SMS/WhatsApp selectable
only when configured) and an audience. Lifecycle: `draft → scheduled → sending → sent | failed`,
`draft|scheduled → cancelled` (final). The recipient count is computed on the server (never listed); an AR/EN preview
shows the in-app card and the email.

Sending always happens in `SendAnnouncementJob`: the audience is chunked by 500, each recipient gets a unique
`announcement_recipients` row (`(campaign_id, user_id)` unique) and the notification is sent with dedup key
`announcement:<campaign id>`, so a re-run (duplicate job, admin retry, crash recovery) never duplicates anything.
Counters (`recipients_count`, `sent_count`, `failed_count`) are recomputed from the recipient rows. A failed campaign can
be retried; only recipients not yet reached are processed. `notifications:dispatch-scheduled` (every minute) claims due
scheduled campaigns atomically and also resumes campaigns stuck in `sending` without progress for 90 minutes.
Audit: `notifications.campaign_created|updated|deleted|scheduled|sent|retried|cancelled|dispatched|resumed|completed|failed`.

### Registering an audience

Built-in: `all_members` (active user + active membership), `vehicle_make`, `vehicle_model` (owners of an active
vehicle), `specific_members` (member numbers, resolved server-side, only active memberships, max 2000).
Other modules register theirs in their ServiceProvider:

```php
use App\Modules\Notifications\Services\AnnouncementAudiences;

AnnouncementAudiences::register(
    'group_buy_participants',
    'group_buying.audiences.participants',                    // translation key of the label
    fn (array $params) => AnnouncementAudiences::activeMembersQuery()
        ->whereHas('groupBuyOrders', fn ($q) => $q->where('group_buy_id', $params['group_buy_id'])),
    module: 'group_buying',
    fields: [[
        'name' => 'group_buy_id', 'type' => 'select', 'label' => 'group_buying.labels.group_buy',
        'rules' => ['required', 'integer', 'exists:group_buys,id'],
        'options' => fn () => GroupBuy::query()->open()->get()->map(fn ($g) => ['value' => $g->id, 'label' => $g->title()])->all(),
    ]],
);
```

The resolver returns an Eloquent `Builder` of `User` (preferred: counted and chunked in SQL) or an iterable of `User`.
Start from `activeMembersQuery()` so suspended/disabled accounts are never targeted. Field `type`:
`select | number | text | textarea`; `rules` are applied to `audience_params.<name>`.

## 6. Notification centers

| Portal | Page | JSON unread count (poll every 60 s) |
|---|---|---|
| Member | `/account/notifications` | `/account/notifications/unread-count` |
| Admin (personal inbox, any staff) | `/admin/notifications/inbox` | `/admin/notifications/inbox/unread-count` |
| Partner (personal, not center-wide) | `/partner/notifications` | `/partner/notifications/unread-count` |

One shared component (`resources/js/features/notifications/notification-center.tsx`) with thin pages: newest first,
category and unread filters, server pagination, mark read on click (then follows the link: internal paths via Inertia,
external `https://` links via a full visit), mark all read (optionally per category). Every query is scoped to the
signed-in user; another user's notification id answers 404.

The unread count is shared with every Inertia page as `unreadNotifications` (cached 60 s per user, invalidated on every
write through the service). `useUnreadCount(url, initial)` (`features/notifications/use-unread-count.ts`) polls the JSON
endpoint for the header bell.

## 7. Routes

| Method | Path | Name | Permission |
|---|---|---|---|
| GET | `/account/notifications` | `member.notifications.index` | member portal |
| GET | `/account/notifications/unread-count` | `member.notifications.unread-count` | member portal (throttle `notifications-poll`) |
| POST | `/account/notifications/read-all` | `member.notifications.read-all` | member portal |
| POST | `/account/notifications/{notification}/read` | `member.notifications.read` | own notification only |
| GET/PUT | `/account/notification-preferences` | `member.notification-preferences.edit` / `.update` | member portal |
| GET | `/admin/notifications/inbox` (+ `/unread-count`, `/read-all`, `/{notification}/read`) | `admin.notifications.inbox[.unread-count|.read-all|.read]` | admin portal |
| GET | `/partner/notifications` (+ `/unread-count`, `/read-all`, `/{notification}/read`) | `partner.notifications.*` | partner portal |
| GET | `/admin/notifications` | `admin.notifications.index` | view or manage |
| GET | `/admin/notifications/{campaign}` | `admin.notifications.show` | view or manage |
| GET/POST | `/admin/notifications/create`, `/admin/notifications` | `admin.notifications.create` / `.store` | manage |
| GET/PUT/DELETE | `/admin/notifications/{campaign}/edit`, `/{campaign}` | `admin.notifications.edit` / `.update` / `.destroy` | manage |
| POST | `/admin/notifications/{campaign}/send|schedule|cancel` | `admin.notifications.send|schedule|cancel` | manage |
| POST | `/admin/notifications/estimate`, `/admin/notifications/preview` | `admin.notifications.estimate` / `.preview` (JSON) | manage |
| GET | `/admin/notifications/templates` | `admin.notifications.templates.index` | view or manage |
| GET/PUT/DELETE | `/admin/notifications/templates/{key}/edit`, `/{key}` | `admin.notifications.templates.edit|update|reset` | manage |
| POST | `/admin/notifications/templates/{key}/preview` | `admin.notifications.templates.preview` (JSON) | manage |
| GET | `/admin/notifications/deliveries` | `admin.notifications.deliveries.index` | view or manage |
| POST | `/admin/notifications/deliveries/{notification}/{channel}/retry` | `admin.notifications.deliveries.retry` | manage |

Campaigns and notifications are addressed by ULID `public_id`; template keys are code identifiers.

## 8. Permissions, settings, schedules, KPIs

- Permissions: `notifications.view` (operations-manager, support-agent), `notifications.manage`
  (operations-manager, content-manager). Owner/super-admin implicit. The personal inboxes need no permission.
- Settings: `notifications.retention_days` (default 180, min 7), `notifications.email_from_name_ar`,
  `notifications.email_from_name_en`.
- Schedule: `notifications:dispatch-scheduled` every minute (without overlapping), `notifications:purge` weekly
  (Monday 03:30) — deletes **read** notifications older than the retention (unread ones are kept; delivery rows cascade).
- KPI `failed_deliveries_24h` (permission `notifications.view`) links to the failed deliveries list.
- Rate limiters: `notifications-poll` (30/min per user), `notifications-write` (60/min per user).

## 9. Data model

`notifications` (ULID, user, category, key, title/body in the recipient locale, url, data jsonb, is_transactional,
dedup_key — partial unique `(user_id, dedup_key)`, read_at), `notification_deliveries` (channel, status
`queued|sent|delivered|failed|skipped|read`, provider, provider_message_id, error/skip reason, attempts, timestamps),
`notification_preferences` (unique `(user_id, category, channel)`), `announcement_campaigns` (ULID, bilingual content,
audience_type/params, channels, status, counters), `announcement_recipients` (unique `(campaign_id, user_id)`),
`email_templates` (unique key, subject/body per locale).

Relation: `$user->inAppNotifications()` (registered dynamically). It is deliberately not called `notifications`:
`User` uses Laravel's `Notifiable` trait, whose `notifications()` targets Laravel's database-channel schema. Never send
Laravel notifications through the `database` channel — they would hit this module's `notifications` table with the wrong
columns; use `Notify::send()` instead (Laravel `mail` notifications such as password resets are unaffected).

## 10. Integration notes

- The portal layouts currently pass `unreadCount = 0` to the header bell: the integration pass must feed the shared
  `unreadNotifications` prop (and optionally `useUnreadCount()` polling) into `AdminLayout`, `MemberLayout` and
  `PartnerLayout`.
- `MemberNotifier` (Members) already calls `Notify::send` with `members.status.*` / `members.deletion_requested`; their
  texts live in `notifications.templates.members.*`.
- The Exception Center (`App\Modules\Reports\Operations\Services\OperationsExceptions`) raises P0 alerts through
  `Notify::send($user, 'operations.p0_exception', [...])`; its text lives in `notifications.templates.operations.*`.
