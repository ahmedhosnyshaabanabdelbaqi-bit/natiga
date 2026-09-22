<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Modules\Core\Models\Terminal;
use App\Modules\Core\Services\PosContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolves the branch / terminal / shift a request belongs to, once, so that
 * controllers and services never re-derive it (and never trust a client-sent
 * branch the user has no access to).
 */
class ResolvePosContext
{
    public function __construct(private readonly PosContext $context) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $terminal = null;

        $terminalCode = $request->header('X-POS-Terminal') ?: $request->input('terminal_code');
        if ($terminalCode) {
            $terminal = Terminal::query()->where('code', $terminalCode)->first();
        }

        $branchId = $terminal?->branch_id ?? $user?->default_branch_id;

        $this->context->set($user, $terminal, $branchId);
        $request->attributes->set('pos.branch_id', $branchId);
        $request->attributes->set('pos.terminal', $terminal);

        return $next($request);
    }
}
