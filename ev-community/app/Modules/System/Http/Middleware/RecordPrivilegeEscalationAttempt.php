<?php

namespace App\Modules\System\Http\Middleware;

use App\Models\User;
use App\Modules\Audit\Services\SecurityEvents;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Placed in front of the `permission:` middleware on routes that grant access (user roles/permissions, staff
 * creation). When an authenticated actor who lacks any of the given permissions submits such a request, the
 * attempt is recorded as a critical `permission_escalation_blocked` security event before the permission
 * middleware rejects it with 403. It never grants anything itself.
 *
 *   Route::middleware([RecordPrivilegeEscalationAttempt::class.':roles.manage', 'permission:roles.manage'])
 */
class RecordPrivilegeEscalationAttempt
{
    private const MAX_ITEMS = 20;

    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $actor = $request->user();
        if ($actor instanceof User && ! $request->isMethodSafe() && $permissions !== [] && ! $this->holdsAll($actor, $permissions)) {
            $target = $request->route('user');
            SecurityEvents::record($actor, 'permission_escalation_blocked', array_filter([
                'route' => $request->route()?->getName(),
                'required' => $permissions,
                'target_id' => $target instanceof User ? $target->id : null,
                'self' => $target instanceof User ? $actor->is($target) : null,
                'roles' => $this->strings($request->input('roles')),
                'permissions' => $this->strings($request->input('permissions')),
            ], fn ($value) => $value !== null && $value !== []), 'critical');
        }

        return $next($request);
    }

    /** @param  string[]  $permissions */
    private function holdsAll(User $actor, array $permissions): bool
    {
        foreach ($permissions as $permission) {
            if (! $actor->can($permission)) {
                return false;
            }
        }

        return true;
    }

    /** @return string[] */
    private function strings(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return array_slice(array_values(array_map(fn ($item) => mb_substr($item, 0, 100), array_filter($value, 'is_string'))), 0, self::MAX_ITEMS);
    }
}
