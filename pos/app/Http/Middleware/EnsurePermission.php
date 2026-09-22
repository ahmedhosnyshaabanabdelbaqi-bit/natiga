<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Modules\Access\Services\PermissionService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Server-side permission gate. Hiding a button in the UI is a convenience;
 * THIS is the control. Every sensitive route carries `permission:<code>`.
 */
class EnsurePermission
{
    public function __construct(private readonly PermissionService $permissions) {}

    public function handle(Request $request, Closure $next, string ...$codes): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'غير مصرح.', 'error_code' => 'unauthenticated'], 401);
        }

        $branchId = $request->attributes->get('pos.branch_id');

        foreach ($codes as $code) {
            if (! $this->permissions->userCan($user, $code, $branchId)) {
                return response()->json([
                    'message' => 'ليست لديك صلاحية تنفيذ هذه العملية.',
                    'error_code' => 'permission_denied',
                    'context' => ['permission' => $code],
                ], 403);
            }
        }

        return $next($request);
    }
}
