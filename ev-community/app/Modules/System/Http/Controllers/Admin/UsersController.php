<?php

namespace App\Modules\System\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\Auth\Services\SessionManager;
use App\Modules\System\Actions\ChangeUserAccess;
use App\Modules\System\Actions\CreateStaffUser;
use App\Modules\System\Actions\DisableUser;
use App\Modules\System\Actions\ReactivateUser;
use App\Modules\System\Actions\ResetUserAccess;
use App\Modules\System\Actions\UpdateStaffUser;
use App\Modules\System\Http\Requests\DisableUserRequest;
use App\Modules\System\Http\Requests\ResetUserAccessRequest;
use App\Modules\System\Http\Requests\StoreUserRequest;
use App\Modules\System\Http\Requests\UpdateUserAccessRequest;
use App\Modules\System\Http\Requests\UpdateUserRequest;
use App\Modules\System\Services\StaffUsers;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class UsersController extends Controller
{
    use AuthorizesRequests;

    public function __construct(private readonly StaffUsers $users) {}

    public function index(Request $request): Response
    {
        $this->authorize('viewAny', User::class);
        $filters = $request->only(StaffUsers::ALLOWED_FILTERS);

        return Inertia::render('admin/users/index', [
            'users' => $this->users->paginate($filters),
            'filters' => $filters,
            'roles' => $this->users->assignableRoles(),
            'can' => ['manage' => $request->user()->can('users.manage'), 'roles' => $request->user()->can('roles.manage')],
        ]);
    }

    public function create(Request $request): Response
    {
        $this->authorize('create', User::class);

        return Inertia::render('admin/users/create', $this->formProps($request->user()));
    }

    public function store(StoreUserRequest $request, CreateStaffUser $action): RedirectResponse
    {
        $this->authorize('create', User::class);
        $data = $request->validated();
        $result = $action->execute($data, $data['roles'] ?? [], $data['permissions'] ?? [], $request->user());

        return redirect()->route('admin.users.show', $result['user'])
            ->with('success', __($result['reset_link_sent'] ? 'users.messages.created_link_sent' : 'users.messages.created_link_failed', ['email' => $result['user']->email]));
    }

    public function show(Request $request, User $user, SessionManager $sessions): Response
    {
        $this->authorize('view', $user);
        $actor = $request->user();

        return Inertia::render('admin/users/show', [
            'user' => $this->users->detail($user),
            'loginHistory' => $this->users->loginHistory($user),
            'securityEvents' => $this->users->securityEvents($user),
            'sessions' => $sessions->activeSessions($user),
            'sessionsSupported' => config('session.driver') === 'database',
            'can' => [
                'update' => $actor->can('update', $user),
                'change_access' => $actor->can('changeAccess', $user),
                'disable' => $actor->can('disable', $user),
                'reactivate' => $actor->can('reactivate', $user),
                'reset_access' => $actor->can('resetAccess', $user),
                'manage_sessions' => $actor->can('manageSessions', $user),
            ],
            'isSelf' => $actor->is($user),
        ] + $this->formProps($actor));
    }

    public function edit(Request $request, User $user): Response
    {
        $this->authorize('update', $user);

        return Inertia::render('admin/users/edit', ['user' => $this->users->detail($user)] + $this->formProps($request->user()));
    }

    public function update(UpdateUserRequest $request, User $user, UpdateStaffUser $action): RedirectResponse
    {
        $this->authorize('update', $user);
        $action->execute($user, $request->validated(), $request->user());

        return redirect()->route('admin.users.show', $user)->with('success', __('users.messages.updated'));
    }

    public function updateAccess(UpdateUserAccessRequest $request, User $user, ChangeUserAccess $action): RedirectResponse
    {
        $this->authorize('changeAccess', $user);
        $data = $request->validated();
        $action->execute($user, $data['roles'], $data['permissions'], $request->user(), $data['reason'] ?? null);

        return back()->with('success', __('users.messages.access_updated'));
    }

    public function disable(DisableUserRequest $request, User $user, DisableUser $action): RedirectResponse
    {
        $this->authorize('disable', $user);
        $action->execute($user, $request->user(), $request->validated('reason'));

        return back()->with('success', __('users.messages.disabled'));
    }

    public function reactivate(Request $request, User $user, ReactivateUser $action): RedirectResponse
    {
        $this->authorize('reactivate', $user);
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);
        $action->execute($user, $request->user(), $data['reason'] ?? null);

        return back()->with('success', __('users.messages.reactivated'));
    }

    public function resetAccess(ResetUserAccessRequest $request, User $user, ResetUserAccess $action): RedirectResponse
    {
        $this->authorize('resetAccess', $user);
        $result = $action->execute($user, $request->user(), $request->boolean('reset_mfa'), $request->validated('reason'));

        return back()->with('success', __('users.messages.access_reset', ['sessions' => $result['sessions_revoked']]).($result['mfa_reset'] ? ' '.__('users.messages.mfa_reset') : ''));
    }

    public function logoutAll(Request $request, User $user, SessionManager $sessions, AuditService $audit): RedirectResponse
    {
        $this->authorize('manageSessions', $user);
        $count = $sessions->logoutAll($user);
        $audit->log('users.sessions_revoked', $user, new: ['sessions_revoked' => $count], actor: $request->user());
        SecurityEvents::record($user, 'sessions_revoked_by_admin', ['by' => $request->user()->id, 'count' => $count], 'warning');

        return back()->with('success', __('users.messages.sessions_revoked', ['count' => $count]));
    }

    public function destroySession(Request $request, User $user, string $session, AuditService $audit): RedirectResponse
    {
        $this->authorize('manageSessions', $user);
        $deleted = config('session.driver') === 'database'
            ? DB::table('sessions')->where('user_id', $user->id)->where('id', $session)->delete()
            : 0;
        if ($deleted > 0) {
            $audit->log('users.session_revoked', $user, new: ['session' => substr($session, 0, 8).'…'], actor: $request->user());
            SecurityEvents::record($user, 'session_revoked_by_admin', ['by' => $request->user()->id], 'warning');
        }

        return back()->with('success', __('users.messages.session_revoked'));
    }

    /** @return array<string, mixed> */
    private function formProps(User $actor): array
    {
        return [
            'roles' => $this->users->assignableRoles(),
            'permissionGroups' => $this->users->permissionGroups(),
            'actorIsSuper' => $actor->isSuperAdmin(),
            'actorPermissions' => $actor->permissionNames(),
            'locales' => ev_locales(),
        ];
    }
}
