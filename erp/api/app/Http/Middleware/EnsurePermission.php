<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Server-side permission gate: deny by default.
 *
 * Every API route names the permission it needs. A route with no permission
 * declared is not reachable through this middleware at all — omitting one is a
 * 403, not an open door.
 */
class EnsurePermission
{
    public function handle(Request $request, Closure $next, ?string ...$permissions): Response
    {
        $user = $request->user();

        if (! $user || ! $user->is_active) {
            return response()->json([
                'error' => 'auth.inactive',
                'message' => 'الحساب غير مفعل.',
            ], 403);
        }

        $permissions = array_filter($permissions);

        if ($permissions === []) {
            return response()->json([
                'error' => 'auth.permission_not_declared',
                'message' => 'هذه العملية غير محددة الصلاحية ولا يمكن تنفيذها.',
            ], 403);
        }

        if (! $user->hasAnyPermission(...$permissions)) {
            return response()->json([
                'error' => 'auth.forbidden',
                'message' => 'لا تملك صلاحية تنفيذ هذه العملية.',
                'context' => ['required' => array_values($permissions)],
            ], 403);
        }

        return $next($request);
    }
}
