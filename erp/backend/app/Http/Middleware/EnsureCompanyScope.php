<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * يثبت شركة الطلب من المستخدم نفسه، لا من مدخلات العميل.
 * يمنع تجاوز الشركة بتغيير معرّف في الطلب.
 */
class EnsureCompanyScope
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->company_id) {
            app()->instance('erp.company_id', (int) $user->company_id);
            $request->attributes->set('company_id', (int) $user->company_id);
        }

        return $next($request);
    }
}
