<?php

namespace App\Modules\Rbac\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Rbac\Http\Requests\StoreRoleRequest;
use App\Modules\Rbac\Http\Requests\UpdateRolePermissionsRequest;
use App\Modules\Rbac\Services\PermissionRegistry;
use App\Modules\Rbac\Services\RoleManager;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Permission\Models\Role;

class RolesController extends Controller
{
    use AuthorizesRequests;

    public function __construct(private readonly RoleManager $roles) {}

    public function index(): Response
    {
        $this->authorize('viewAny', Role::class);

        $grouped = [];
        foreach (PermissionRegistry::grouped() as $module => $permissions) {
            $grouped[] = [
                'module' => $module,
                'permissions' => collect($permissions)->map(fn ($definition, $key) => [
                    'key' => $key,
                    'label' => $definition['label'],
                    'default_roles' => $definition['roles'],
                ])->values()->all(),
            ];
        }

        return Inertia::render('admin/roles/index', [
            'roles' => $this->roles->matrix(),
            'groups' => $grouped,
        ]);
    }

    public function store(StoreRoleRequest $request): RedirectResponse
    {
        $this->authorize('create', Role::class);
        $data = $request->validated();
        $this->roles->create($data['slug'], $data['name_ar'], $data['name_en'], $data['description'] ?? null, $request->user());

        return back()->with('success', __('roles.messages.created'));
    }

    public function updatePermissions(UpdateRolePermissionsRequest $request, string $role): RedirectResponse
    {
        $model = $this->find($role);
        $this->authorize('update', $model);
        $this->roles->syncPermissions($model, $request->validated('permissions'), $request->user(), $request->validated('reason'));

        return back()->with('success', __('roles.messages.permissions_saved'));
    }

    public function destroy(Request $request, string $role): RedirectResponse
    {
        $model = $this->find($role);
        $this->authorize('delete', $model);
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);
        $this->roles->delete($model, $request->user(), $data['reason'] ?? null);

        return back()->with('success', __('roles.messages.deleted'));
    }

    private function find(string $slug): Role
    {
        return Role::query()->where('name', $slug)->where('guard_name', 'web')->firstOrFail();
    }
}
