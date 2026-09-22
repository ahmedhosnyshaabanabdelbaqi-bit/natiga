# Members, membership card & QR verification, referrals, privacy

Module keys: `members` (core, cannot be disabled) and `referrals` (optional, `module:referrals` + setting
`referrals.enabled`). Code: `app/Modules/Members`, `app/Modules/Referrals`. Pages: `resources/js/pages/{admin/members,admin/referrals,member/*,partner/members,public/verify}`,
shared UI in `resources/js/features/members`. Tests: `tests/Feature/Members`, `tests/Feature/Referrals`.

## 1. Data

| Table | Model | Notes |
|---|---|---|
| `memberships` (core migration) | `Membership` | `public_id` (ULID, used in every URL), `member_number` (`EV-000001`, unique), `status` (`MembershipStatus`), `referral_code` (unique), `referred_by`, `verification_token` (private QR secret, never sent to any client), `joined_at/approved_at/approved_by/suspended_at/expires_at`. |
| `membership_status_history` (core) | `MembershipStatusHistory` | One row per transition (`from_status`, `to_status`, `changed_by`, `reason`). The first row is written by registration. |
| `membership_verifications` | `MembershipVerification` | Every scan that resolves to a membership: `purpose` (membership/offer/event/pickup/booking/public, CHECK constraint), `result` (valid/invalid/expired/not_active), `verified_by` (null = public page), optional `context_type/context_id`, `ip_address`. Append-only. |
| `member_notes` | `MemberNote` | Internal staff notes, `is_pinned`. Never shown to the member. |
| `account_deletion_requests` | `AccountDeletionRequest` | `public_id`, `status` (requested/under_review/completed/rejected), member `reason`, staff `notes`, `processed_by/at`. |
| `consent_logs` (core) | `ConsentLog` | Append-only; latest row per `(user, consent_type)` is the current state. Marketing types: `marketing_email`, `marketing_sms`, `marketing_whatsapp` (read by `Notifications\Services\MarketingConsent`). |
| `member_referrals` | `Referrals\Models\MemberReferral` | One row per referred membership (unique `referred_membership_id`), `referral_code_used`, `status` (invited/registered/approved), `approved_at`. No monetary columns, no rewards. |

## 2. Status machine

`pending → active | rejected`, `active → suspended | expired`, `suspended → active`, `rejected → pending`, `expired → active`.

`Actions\ChangeMembershipStatus::execute(Membership, MembershipStatus $to, ?User $actor, ?string $reason)` is the only writer
(`$membership->transitionTo(...)` delegates to it). Inside one transaction with a row lock it validates the transition
(`DomainException` → 422 JSON / validation error `status`), requires a reason of ≥ 5 characters for suspend/reject,
stamps `approved_at/approved_by/expires_at/suspended_at`, writes a history row and the audit entry `members.status_changed`
(old/new status + reason). Suspension also clears the remember-me token, deletes API tokens, ends every session
(`SessionManager::logoutAll`) and records the security event `membership_suspended`. Asking for the current status is a
no-op (idempotent double clicks). After commit it dispatches exactly one of:

| Event (`App\Modules\Members\Events\…`) | Transition |
|---|---|
| `MembershipApproved` | pending → active |
| `MembershipRejected` | pending → rejected |
| `MembershipSuspended` | active → suspended |
| `MembershipReactivated` | suspended/expired → active |
| `MembershipExpired` | active → expired |
| `MembershipReopened` | rejected → pending |
| `MemberAnonymized` | deletion request completed (other modules purge their own PII copies here) |

All status events extend `MembershipStatusChanged` (`membership`, `from`, `to`, `reason`, `historyId`, `actorId`).

`php artisan members:expire [--force]` (daily 03:00, no-op unless `members.auto_expire_enabled`) expires active
memberships past `expires_at` through the same action (system actor).

## 3. Notifications

`Services\MemberNotifier` calls `App\Modules\Notifications\Services\Notify::send()` (category `system`, transactional,
in-app + email per preferences). Texts: `members.notifications.<type>.title|body` in the member's locale. Status
notifications are sent by the queued listener `Listeners\SendMembershipStatusNotification` with dedup key
`members.status:{membership_id}:{history_id}`; deletion requests use `members.deletion_requested:{id}` and
`members.deletion_rejected:{id}`. Staff reasons are never included in member notifications. Failures are reported and
never break the business flow; disabled/anonymised accounts receive nothing.

## 4. Membership card & QR verification

`Services\MembershipQr`:

```
token = base64url("{public_id}.{expires}.{hmac}")      hmac = HMAC-SHA256(app key, "{verification_token}|{expires}")
```

TTL = setting `members.qr_token_ttl_minutes` (default 10). `verify($token)` checks structure → signature (`hash_equals`)
→ expiry → membership active **and** user account active, returning `valid` / `invalid` / `expired` / `not_active` plus an
`authentic` flag. Rotating `verification_token` (`Membership::rotateVerificationToken()`, member "Regenerate QR", staff
"Invalidate QR codes", anonymisation) invalidates every token issued before. The QR image is an SVG from endroid/qr-code 6
encoding the public URL `/verify/{token}`; scanners accept either the URL or the bare token.

`Services\MembershipVerifier::verify(string $raw, VerificationPurpose $purpose, ?User $actor = null, ?Model $context = null)`
verifies and logs one `membership_verifications` row (whenever the token resolves to a membership, including forged
ones). **Other modules reuse it** for pickups, event check-ins, bookings and partner offers, passing their purpose and
context model. Payload shapers:

| Audience | Endpoint | Payload |
|---|---|---|
| Staff | `POST /admin/members/verify` (`members.verify`, `throttle:member-verify`) | valid, reason, member {id, name, member_number, status, joined_at, expires_at, governorate, url (only with `members.view`)} |
| Partner | `POST /partner/members/verify` (`partner.access`) | valid, reason, member {name, member_number, status} — nothing else |
| Public | `GET /verify/{token}` (`throttle:public-forms`, `X-Robots-Tag: noindex`) | result + masked number `EV-****23` (valid cards only) |

Member data is disclosed only for authentic tokens: a forged token carrying a real public id is logged but returns
`member: null`. Purposes are whitelisted per audience (`VerifyTokenRequest::ADMIN_PURPOSES`, `PARTNER_PURPOSES`;
`public` is reserved for the anonymous page).

The member card page (`/account/membership-card`) shows site name, member name, member number, status, join/expiry
dates and the live QR; it refreshes the `qr` prop with a partial reload (`usePoll` / `router.reload({ only: ['qr'] })`)
before expiry and when the tab becomes visible again, supports regeneration with confirmation and prints only the card.

## 5. Admin

| Path | Route name | Permission |
|---|---|---|
| `GET /admin/members` | `admin.members.index` | `members.view` |
| `GET /admin/members/pending` | `admin.members.pending` | `members.view` |
| `GET /admin/members/export` | `admin.members.export` | `members.export` (audited `members.exported`, CSV with BOM, formula-injection safe) |
| `POST /admin/members/bulk-approve` | `admin.members.bulk-approve` | `members.approve` |
| `GET /admin/members/scan` · `POST /admin/members/verify` | `admin.members.scan` · `admin.members.verify` | `members.verify` |
| `GET /admin/members/deletion-requests` | `admin.members.deletion-requests.index` | `members.delete_requests` |
| `POST /admin/members/deletion-requests/{request}/review/complete/reject` | `admin.members.deletion-requests.review/complete/reject` | `members.delete_requests` (complete/reject need a reason) |
| `GET /admin/members/{membership}` | `admin.members.show` | `members.view` (security events tab needs `security_events.view`) |
| `PATCH /admin/members/{membership}` | `admin.members.update` | `members.edit` (audited `members.profile_updated` with old/new) |
| `POST /admin/members/{membership}/approve/reject/reopen` | `admin.members.approve/reject/reopen` | `members.approve` |
| `POST /admin/members/{membership}/suspend/reactivate` | `admin.members.suspend/reactivate` | `members.suspend` |
| `POST /admin/members/{membership}/expire` | `admin.members.expire` | `members.edit` |
| `POST /admin/members/{membership}/resend-verification` · `/rotate-token` | `admin.members.resend-verification` · `admin.members.rotate-token` | `members.edit` |
| `POST /admin/members/{membership}/notes` · `PATCH …/notes/{note}/pin` | `admin.members.notes.store` · `admin.members.notes.pin` | `members.notes` |
| `GET /admin/referrals` | `admin.referrals.index` | `referrals.view` + `module:referrals` |

Every route has the permission middleware **and** a policy/FormRequest check (`MembershipPolicy`,
`AccountDeletionRequestPolicy`). Listing filters: `search` (member number, name, email, mobile — bound and LIKE-escaped),
`status`, `governorate_id`, `joined_from/joined_to` (Cairo calendar days), `referral_source`; sort whitelist
`member_number|name|joined_at|status` with `direction`; `per_page` 10–100. Unknown values are validation errors.

## 6. Member portal

| Path | Route name | Notes |
|---|---|---|
| `GET /account` | `member.dashboard` | nudge when mobile/governorate missing, quick links |
| `GET /account/status` | `member.status` | landing page for pending/suspended/rejected/expired memberships |
| `GET /account/membership-card` · `POST …/rotate` | `member.membership-card` · `member.membership-card.rotate` | own card only; rotate throttled (`member-self-service`) and audited `members.qr_token_rotated` |
| `GET/PATCH /account/profile` | `member.profile.edit/update` | mobile (normalised `01xxxxxxxxx`, unique), governorate, locale, referral source |
| `GET /account/referrals` | `member.referrals.index` | code, share link `/register?ref=CODE`, counters, referred first names + status only |
| `GET /account/privacy` | `member.privacy.index` | plain-language data summary, current identity data, consent history |
| `PUT /account/privacy/consents` | `member.privacy.consents` | writes accepted/withdrawn `consent_logs` rows only for changed channels, audit `members.consents_updated` |
| `POST /account/privacy/deactivate` | `member.privacy.deactivate` | requires `current_password`; account disabled, API tokens + sessions ended, audit `members.self_deactivated` |
| `POST /account/privacy/deletion-request` | `member.privacy.deletion-request` | requires acknowledgement; one open request at a time; audit `members.deletion_requested` |

No member route takes a membership id: everything is resolved from the authenticated user.

## 7. Privacy: deletion & anonymisation

`Actions\ProcessDeletionRequest::review|reject` and `Actions\AnonymizeMember::execute(request, actor, reason, notes)`.
Completing a request (locked, idempotent) sets name `Deleted Member`, email `deleted-{id}@anonymized.local`, mobile null,
random password, clears MFA secrets, passkeys, API tokens, remember and password-reset tokens, disables the account,
ends every session, rotates the QR secret and clears the free-text referral source. Memberships, status history, orders,
payments, ledgers, receipts, consent logs and audit rows are kept. The `members.anonymized` audit row stores only
non-identifying facts (previous status, whether a mobile/MFA existed) — the erased values are never copied into the
immutable audit table. Older audit rows written before the request (e.g. a `members.profile_updated` diff) are immutable
by design and remain under the audit retention policy.

## 8. Referrals

`Referrals\Services\ReferralService`: `enabled()`, `recordRegistration(Membership)` (listener on
`Illuminate\Auth\Events\Registered` when the new membership has `referred_by`; `createOrFirst` on the unique index, safe
under concurrency), `markApproved(Membership)` (listener on `MembershipApproved`, row-locked), `backfillFor(referrer)`,
`statsFor(referrer)`, `referredList(referrer)` (first name + status), `shareLink(membership)`. Registration accepts a code
only from an **active** member (`CreateNewUser`), and `?ref=CODE` pre-fills the registration form.

## 9. Permissions, settings, registrations

Permissions (`Permissions.php`): `members.view` (operations-manager, support-agent, accountant), `members.edit`,
`members.approve`, `members.suspend`, `members.export`, `members.delete_requests` (operations-manager),
`members.verify`, `members.notes` (operations-manager, support-agent), `referrals.view` (operations-manager, support-agent).
Owner/super-admin pass every gate.

Settings: `members.registration_mode`, `members.require_mobile`, `members.membership_card_validity_days`,
`members.qr_token_ttl_minutes`, `members.auto_expire_enabled`, `referrals.enabled`.

Registered in `MembersServiceProvider`: policies, `User::deletionRequests()` / `User::consentLogs()` relations, queued
status-notification listener, rate limiters `member-verify` (120/min per user) and `member-self-service` (10/min per user),
dashboard KPI `open_deletion_requests` (permission `members.delete_requests`), daily `members:expire`.
`ReferralsServiceProvider` registers the `Registered` and `MembershipApproved` listeners.

Audit actions: `members.status_changed`, `members.profile_updated`, `members.note_added`, `members.note_pinned`,
`members.exported`, `members.verification_email_resent`, `members.qr_token_rotated`, `members.consents_updated`,
`members.self_deactivated`, `members.deletion_requested`, `members.deletion_request_reviewed`,
`members.deletion_request_rejected`, `members.anonymized`.
