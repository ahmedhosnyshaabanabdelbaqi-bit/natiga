<?php

namespace App\Modules\Auth\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\Auth\Services\SessionManager;
use App\Modules\System\Services\SessionKeys;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Session;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "Active sessions" page for every user (member/staff/partner). Only the user's own sessions are listed or
 * revoked (lookups are always scoped by user_id) and raw session ids never leave the server (SessionKeys).
 * Logging out other devices requires the current password; it also rehashes the password so "remember me"
 * cookies on other devices stop working. Each revocation is audited and recorded as a security event.
 */
class SessionsController extends Controller
{
    public function __construct(private readonly SessionManager $sessions, private readonly SessionKeys $keys, private readonly AuditService $audit) {}

    public function index(Request $request): Response
    {
        return Inertia::render('settings/sessions', [
            'sessions' => $this->keys->forUser($request->user()),
            'supported' => config('session.driver') === 'database',
        ]);
    }

    public function logoutOthers(Request $request): RedirectResponse
    {
        $request->validate(['current_password' => ['required', 'string', 'current_password:web']]);
        $user = $request->user();

        // Invalidates remember-me cookies elsewhere and re-issues the current device's cookie.
        Auth::guard('web')->logoutOtherDevices((string) $request->input('current_password'));
        $count = $this->sessions->logoutOtherDevices($user);

        $this->audit->log('sessions.logged_out_others', $user, new: ['sessions_revoked' => $count], actor: $user);
        SecurityEvents::record($user, 'sessions_revoked', ['count' => $count, 'scope' => 'others'], 'warning');

        return back()->with('success', __('system.sessions.messages.others_logged_out', ['count' => $count]));
    }

    public function destroy(Request $request, string $session): RedirectResponse
    {
        $user = $request->user();
        if (hash_equals(SessionKeys::keyFor(Session::getId()), $session)) {
            return back()->with('error', __('system.sessions.errors.cannot_revoke_current'));
        }
        if (! $this->keys->revoke($user, $session)) {
            return back()->with('error', __('system.sessions.errors.not_found'));
        }
        $this->audit->log('sessions.revoked', $user, new: ['session' => substr($session, 0, 8)], actor: $user);
        SecurityEvents::record($user, 'session_revoked', ['scope' => 'single'], 'warning');

        return back()->with('success', __('system.sessions.messages.session_revoked'));
    }
}
