<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * يمنع استخدام النظام بكلمة مرور مؤقتة.
 *
 * كلمة مرور المدير تُولَّد آليًا عند التثبيت وتُعرض مرة واحدة، فلو اكتفينا
 * بإظهار تنبيه في الواجهة لبقي الحساب قابلًا للاستخدام بكلمة مرور معروفة
 * لمن قرأ شاشة التثبيت. المنع هنا في السيرفر: لا يُسمح إلا بمعرفة الهوية
 * وتغيير كلمة المرور والخروج، حتى تتغيّر فعلًا.
 */
class EnforcePasswordChange
{
    /** المسارات المسموح بها قبل تغيير كلمة المرور */
    private const ALLOWED = [
        'api/v1/auth/me',
        'api/v1/auth/logout',
        'api/v1/auth/change-password',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->must_change_password && ! $request->is(...self::ALLOWED)) {
            return response()->json([
                'error_code' => 'auth.password_change_required',
                'message' => 'يلزم تغيير كلمة المرور المؤقتة قبل استخدام النظام.',
            ], 403);
        }

        return $next($request);
    }
}
