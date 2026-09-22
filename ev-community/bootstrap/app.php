<?php

use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\SecurityHeaders;
use App\Modules\Audit\Http\Middleware\AssignRequestId;
use App\Modules\Auth\Http\Middleware\EnsureAdminPortal;
use App\Modules\Auth\Http\Middleware\EnsureMemberPortal;
use App\Modules\Auth\Http\Middleware\EnsurePartnerPortal;
use App\Modules\Auth\Http\Middleware\EnsureUserIsActive;
use App\Modules\Auth\Http\Middleware\SetLocale;
use App\Modules\System\Http\Middleware\EnsureModuleEnabled;
use App\Support\Exceptions\DomainException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Spatie\Permission\Middleware\PermissionMiddleware;
use Spatie\Permission\Middleware\RoleMiddleware;
use Spatie\Permission\Middleware\RoleOrPermissionMiddleware;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->encryptCookies(except: ['appearance', 'sidebar_state', 'locale']);
        $middleware->trustProxies(at: '*');

        $middleware->prepend(AssignRequestId::class);
        $middleware->append(SecurityHeaders::class);

        $middleware->web(append: [
            SetLocale::class,
            HandleAppearance::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);

        $middleware->api(prepend: [SetLocale::class]);

        $middleware->alias([
            'locale.public' => SetLocale::class,
            'active' => EnsureUserIsActive::class,
            'member.portal' => EnsureMemberPortal::class,
            'admin.portal' => EnsureAdminPortal::class,
            'partner.portal' => EnsurePartnerPortal::class,
            'module' => EnsureModuleEnabled::class,
            'role' => RoleMiddleware::class,
            'permission' => PermissionMiddleware::class,
            'role_or_permission' => RoleOrPermissionMiddleware::class,
        ]);

        $middleware->redirectGuestsTo(function (Request $request) {
            return match (true) {
                $request->is('admin', 'admin/*') => config('ev.portals.admin.login'),
                $request->is('partner', 'partner/*') => config('ev.portals.partner.login'),
                default => route('login'),
            };
        });
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->is('webhooks/*') || $request->expectsJson(),
        );

        $exceptions->render(function (DomainException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json(['data' => null, 'message' => $e->getMessage(), 'errors' => [$e->field ?? 'domain' => [$e->getMessage()]], 'meta' => ['request_id' => ev_request_id()]], $e->status);
            }
            if ($e->status === 403) {
                abort(403, $e->getMessage());
            }
            throw ValidationException::withMessages([$e->field ?? 'domain' => $e->getMessage()]);
        });

        $exceptions->respond(function (Response $response, Throwable $exception, Request $request) {
            $status = $response->getStatusCode();
            if ($request->is('api/*') || $request->expectsJson() || app()->hasDebugModeEnabled() && $status >= 500) {
                return $response;
            }
            if (in_array($status, [403, 404, 419, 429, 500, 503], true) && ! $request->is('up')) {
                $message = $status === 419 ? __('core.errors.page_expired') : ($exception instanceof AuthenticationException ? null : ($status < 500 ? $exception->getMessage() : null));

                return Inertia::render('errors/error', [
                    'status' => $status,
                    'message' => $message ?: __('core.errors.http_'.$status),
                    'requestId' => ev_request_id(),
                ])->toResponse($request)->setStatusCode($status);
            }

            return $response;
        });
    })->create();
