# UI kit, shared components and personal settings (W1-A)

This module covers:

- the shared React UI kit (`resources/js/components/shared`, `resources/js/components/ui`, `resources/js/hooks`);
- the localised starter authentication pages (forgot or reset password, verify email, two-factor challenge, confirm password);
- the personal settings area (`/settings/*`: profile, security, appearance, plus the navigation to sessions and privacy).

The component API contract lives in [`resources/js/components/shared/README.md`](../../resources/js/components/shared/README.md).
Read it before building pages.

## Routes

| Method | Path | Name | Middleware | Handler |
|---|---|---|---|---|
| GET | `/settings` | – | auth | Redirects to `/settings/profile`. |
| GET | `/settings/profile` | `profile.edit` | auth | `Settings\ProfileController@edit` renders `settings/profile`. |
| PATCH | `/settings/profile` | `profile.update` | auth | `Settings\ProfileController@update`. |
| DELETE | `/settings/profile` | `profile.destroy` | auth, verified | `Settings\ProfileController@destroy`. Refuses; see "Account closure". |
| GET | `/settings/security` | `security.edit` | auth, verified, password.confirm (when Fortify requires it) | `Settings\SecurityController@edit` renders `settings/security`. |
| PUT | `/settings/password` | `user-password.update` | auth, verified, throttle:6,1 | `Settings\SecurityController@update`. |
| GET | `/settings/appearance` | `appearance.edit` | auth, verified | `Route::inertia` renders `settings/appearance`. |

The layout also links to routes owned by other modules:

- `/settings/sessions` (`shared.settings.sessions.index`, System/Auth module, W1-D)
- `/account/privacy` (`member.privacy.index`, Members module, W1-E). This link is shown only when `auth.user.is_member`.

Fortify and passkey routes (login, 2FA, password reset, passkeys) are provided by the packages;
this module only localises their pages.

## Permissions

There are no module permissions. Every settings route acts on the authenticated user only:
there is no id in any URL, and the controllers read `$request->user()`. Extra fields such as `id`,
`status` or `email_verified_at` in a request are ignored (only validated `name` and `email` are
filled). Tests cover this in `ProfileUpdateTest::test_a_user_can_only_update_their_own_profile`
and `test_mass_assignment_of_privileged_columns_is_ignored`.

## Flows

### Profile update

1. `ProfileUpdateRequest` trims and lowercases the email. Registration and staff creation store
   emails in lowercase, and login lowercases the input, so a mixed-case email would otherwise
   lock the user out. Uniqueness is checked on the normalised value.
2. On an email change, `email_verified_at` is reset.
3. In one transaction: save, then `AuditService::logChanges('auth.profile_updated', $user, before, after)`
   (only changed keys). An email change also records `SecurityEvents::record($user, 'email_changed')` (warning).
4. After an email change, the verification email is sent. A mail failure is reported but does not
   fail the request, because the page offers "re-send verification email".
5. The toast is `settings.profile.updated`, or `settings.profile.updated_verify_email` after an
   email change. It is sent with `Inertia::flash('toast')` and shown by the `Toaster`.

### Password change

1. `PasswordUpdateRequest` checks `current_password`, `Password::default()` and `confirmed`. It is
   throttled to 6 requests per minute, and attribute names are translated.
2. In one transaction: set the new password (hashed cast) and `password_changed_at`, then
   `SessionManager::logoutOtherDevices()` (database session driver: deletes every other session of
   the user and keeps the current one). Then write the audit row `auth.password_changed`
   (`new: { other_sessions_revoked }`, never the password) and the security event `password_changed`.
3. The toast reports how many other devices were signed out (`settings.security.password_updated_sessions`).

A password reset through Fortify (`ResetUserPassword`) fires `PasswordReset`. The Auth module
listens to it, stamps `password_changed_at`, records `password_reset` and signs out other devices.

### Account closure

Self-service hard deletion is disabled. Orders, payments, receipts and the audit trail must survive
(`docs/SECURITY.md`: "deactivate ≠ delete"). In addition, `memberships.user_id` uses
`restrictOnDelete`, and audit rows are immutable, so a hard delete would fail for every real account.

- The profile page shows a "Close your account" section. Members get a link to `/account/privacy`,
  where the Members module handles deactivation (requires the password) and personal-data deletion
  requests, which are reviewed and then anonymised. Staff and partner users are told that
  administrators manage their account.
- `DELETE /settings/profile` still validates the password. It then records
  `account_self_delete_refused` and redirects members to the privacy page with a warning flash.
  Everyone else gets a 403.

## Translations

- `lang/{ar,en}/settings.php`: settings pages, settings navigation, 2FA, passkeys and account closure.
- `lang/{ar,en}/ui.php`: shared components (table, filters, pagination, upload, QR, map, command
  palette, breadcrumb, sidebar…).
- Keys added to `lang/{ar,en}/auth.php`: `passkey.cancelled` and `passkey.invalid_domain`
  (translated `@laravel/passkeys` errors).
- `tests/Feature/Settings/UiKitTranslationsTest.php` enforces three things: identical AR/EN keys
  and `:placeholders` for `settings`, `ui` and `auth`; every literal `t('…')` key used by the kit and
  the starter pages exists in both locales; and no hard-coded English text or `aria-label`,
  `placeholder`, `title` or `alt` values appear in those sources.

## Audit and security events

| Action | Where | Notes |
|---|---|---|
| audit `auth.profile_updated` | ProfileController@update | Old and new values for `name` and `email`, changed keys only. |
| audit `auth.password_changed` | SecurityController@update | `other_sessions_revoked` count. |
| security `email_changed` | ProfileController@update | warning |
| security `password_changed` | SecurityController@update | info |
| security `account_self_delete_refused` | ProfileController@destroy | warning |

## Registries and extension points used by other modules

- `@/components/shared` barrel (`index.ts`). Lazy map wrappers keep Leaflet out of other bundles.
- `FileUpload` with Inertia `useForm` and `forceFormData: true`. Server-side storage always goes
  through `AttachmentService`.
- `QrScanner` for membership cards, pickups and deliveries. The server must verify the scanned
  token and make the action idempotent.
- `MapView` and `AddressMapPicker`. Tiles come from `MAP_TILE_URL`, and `MAP_PROVIDER=none` shows
  the fallback. Geocoding must go through a server endpoint that uses the `MapProvider` contract.
- `CommandPalette`. Search endpoints must apply the caller's permissions and ownership scopes.

## Tests

`DB_DATABASE=ev_test_1 php artisan test tests/Feature/Auth tests/Feature/Settings`

- `ProfileUpdateTest`: rendering, guest redirects, audit, email normalisation and uniqueness, the
  verification email, login after a mixed-case change, translated validation attributes, IDOR and
  mass-assignment protection, and account-closure refusal for members, staff and a wrong password.
- `SecurityTest`: rendering with and without Fortify features, password confirmation, password
  change (audit, security event, `password_changed_at`, other sessions revoked and the current one
  kept), failed changes leaving no trace, throttling, and the auth and verified gates.
- `UiKitTranslationsTest`: the i18n guard described above.

## Integration notes (for files owned by other modules)

- **Raw Fortify status toasts.** `layouts/portal-layout.tsx` (`useFlashToasts`) toasts `flash.status`
  verbatim. On the settings pages, Fortify flashes codes such as `two-factor-authentication-enabled`,
  `recovery-codes-generated` and `verification-link-sent`, so users see those raw codes.
  Translations are ready under `settings.fortify_status.*`, keyed by the code with `-` replaced by
  `_`. To fix it, translate the code in `HandleInertiaRequests::share()` (`flash.status`) or skip
  kebab-case codes in `useFlashToasts`.
- **Obsolete route.** `routes/settings.php` keeps `DELETE settings/profile` (`profile.destroy`),
  which now only refuses. It can be removed once nothing links to it.
- **`ConfirmProvider`.** It is not mounted by the portal layouts yet. Pages that use `useConfirm()`
  wrap themselves in `<ConfirmProvider>` until the layouts mount it.
