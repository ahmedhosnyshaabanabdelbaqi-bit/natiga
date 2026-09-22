<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\PasswordUpdateRequest;
use App\Http\Requests\Settings\TwoFactorAuthenticationRequest;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\Auth\Services\SessionManager;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;
use Inertia\Response;
use Laravel\Fortify\Features;

class SecurityController extends Controller
{
    public function __construct(
        private readonly AuditService $audit,
        private readonly SessionManager $sessions,
    ) {}

    /**
     * Show the user's security settings page.
     */
    public function edit(TwoFactorAuthenticationRequest $request): Response
    {
        $props = [
            'canManageTwoFactor' => Features::canManageTwoFactorAuthentication(),
            'canManagePasskeys' => Features::canManagePasskeys(),
            'passkeys' => Features::canManagePasskeys()
                ? $request->user()
                    ->passkeys()
                    ->select(['id', 'name', 'credential', 'created_at', 'last_used_at'])
                    ->latest()
                    ->get()
                    ->map(fn ($passkey) => [
                        'id' => $passkey->id,
                        'name' => $passkey->name,
                        'authenticator' => $passkey->authenticator,
                        'created_at_diff' => $passkey->created_at->diffForHumans(),
                        'last_used_at_diff' => $passkey->last_used_at?->diffForHumans(),
                    ])
                    ->values()
                    ->all()
                : [],
            'passwordRules' => Password::defaults()->toPasswordRulesString(),
        ];

        if (Features::canManageTwoFactorAuthentication()) {
            $request->ensureStateIsValid();

            $props['twoFactorEnabled'] = $request->user()->hasEnabledTwoFactorAuthentication();
            $props['requiresConfirmation'] = Features::optionEnabled(Features::twoFactorAuthentication(), 'confirm');
        }

        return Inertia::render('settings/security', $props);
    }

    /**
     * Update the user's password. Other devices are signed out (the current session stays),
     * the change is audited and recorded as a security event.
     */
    public function update(PasswordUpdateRequest $request): RedirectResponse
    {
        $user = $request->user();

        $revoked = DB::transaction(function () use ($user, $request) {
            $user->forceFill([
                'password' => $request->validated('password'),
                'password_changed_at' => now(),
            ])->save();

            $revoked = $this->sessions->logoutOtherDevices($user);
            $this->audit->log('auth.password_changed', $user, new: ['other_sessions_revoked' => $revoked], actor: $user);
            SecurityEvents::record($user, 'password_changed', ['other_sessions_revoked' => $revoked]);

            return $revoked;
        });

        // Keep the current session valid for AuthenticateSession-style password hash checks.
        $request->session()->put('password_hash_web', $user->getAuthPassword());

        Inertia::flash('toast', [
            'type' => 'success',
            'message' => $revoked > 0
                ? trans_choice('settings.security.password_updated_sessions', $revoked, ['count' => $revoked])
                : __('settings.security.password_updated'),
        ]);

        return back();
    }
}
