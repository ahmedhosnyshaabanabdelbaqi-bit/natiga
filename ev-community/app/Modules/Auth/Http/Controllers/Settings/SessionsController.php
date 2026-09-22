<?php

namespace App\Modules\Auth\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\Auth\Services\SessionManager;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Session;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "Active sessions" page for every user (member/staff/partner). Logging out other devices requires the
 * current password; each revocation is audited and recorded as a security event.
 */
class SessionsController extends Controller
{
    public function __construct(private readonly SessionManager $sessions, private readonly AuditService $audit) {}

    public function index(Request $request): Response
    {
        return Inertia::render('settings/sessions', [
            'sessions' => $this->sessions->activeSessions($request->user()),
            'supported' => config('session.driver') === 'database',
        ]);
    }

    public function logoutOthers(Request $request): RedirectResponse
    {
        $request->validate(['current_password' => ['required', 'string', 'current_password']]);
        $user = $request->user();
        $count = $this->sessions->logoutOtherDevices($user);
        $this->audit->log('sessions.logged_out_others', $user, new: ['sessions_revoked' => $count], actor: $user);
        SecurityEvents::record($user, 'sessions_revoked', ['count' => $count, 'scope' => 'others'], 'warning');

        return back()->with('success', __('system.sessions.messages.others_logged_out', ['count' => $count]));
    }

    public function destroy(Request $request, string $session): RedirectResponse
    {
        $user = $request->user();
        if ($session === Session::getId()) {
            return back()->with('error', __('system.sessions.errors.cannot_revoke_current'));
        }
        $deleted = config('session.driver') === 'database'
            ? DB::table('sessions')->where('user_id', $user->id)->where('id', $session)->delete()
            : 0;
        if ($deleted > 0) {
            $this->audit->log('sessions.revoked', $user, new: ['session' => substr($session, 0, 8).'…'], actor: $user);
            SecurityEvents::record($user, 'session_revoked', ['scope' => 'single'], 'warning');
        }

        return back()->with('success', __('system.sessions.messages.session_revoked'));
    }
}
