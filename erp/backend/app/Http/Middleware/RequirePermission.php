<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * التحقق من الصلاحية في السيرفر على كل طلب.
 * الرفض الافتراضي: بدون إذن صريح يُرفض الطلب — إخفاء الزر في الواجهة لا يكفي.
 */
class RequirePermission
{
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json([
                'error_code' => 'auth.unauthenticated',
                'message' => 'يلزم تسجيل الدخول.',
            ], 401);
        }

        if (! $user->is_active) {
            return response()->json([
                'error_code' => 'auth.inactive',
                'message' => 'الحساب موقوف.',
            ], 403);
        }

        if (! $user->hasAnyPermission($permissions)) {
            return response()->json([
                'error_code' => 'auth.forbidden',
                'message' => 'لا تملك صلاحية تنفيذ هذه العملية.',
                'required' => $permissions,
            ], 403);
        }

        return $next($request);
    }
}
