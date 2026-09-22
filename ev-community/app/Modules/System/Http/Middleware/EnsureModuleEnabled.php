<?php

namespace App\Modules\System\Http\Middleware;

use App\Modules\System\Services\Modules;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureModuleEnabled
{
    public function handle(Request $request, Closure $next, string $module): Response
    {
        if (! Modules::enabled($module)) {
            abort(404, __('core.errors.module_disabled'));
        }

        return $next($request);
    }
}
