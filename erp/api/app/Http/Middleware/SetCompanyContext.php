<?php

namespace App\Http\Middleware;

use App\Support\CompanyContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Binds the request to the authenticated user's company, so every query scoped
 * by BelongsToCompany is confined to it without each controller remembering.
 *
 * A header may name a different company only for a super admin; for everyone
 * else it is ignored rather than honoured, so the header cannot be used as a
 * lateral-movement tool.
 */
class SetCompanyContext
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user) {
            $companyId = $user->company_id;

            if ($user->is_super_admin && $request->hasHeader('X-Company-Id')) {
                $companyId = (int) $request->header('X-Company-Id');
            }

            CompanyContext::set($companyId);
            app()->instance('erp.user', $user);
        }

        try {
            return $next($request);
        } finally {
            CompanyContext::clear();
        }
    }
}
