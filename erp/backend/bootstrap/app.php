<?php

use App\Domain\Shared\DomainException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'permission' => \App\Http\Middleware\RequirePermission::class,
            'company.scope' => \App\Http\Middleware\EnsureCompanyScope::class,
            'password.changed' => \App\Http\Middleware\EnforcePasswordChange::class,
        ]);

        // النظام واجهة برمجية بحتة ولا يملك مسارًا باسم login.
        // بدون هذا السطر يحاول Laravel تحويل الزائر غير المسجّل إلى route('login')
        // فيرمي خطأ 500 بدل 401 عند أي طلب لا يحمل ترويسة Accept: application/json.
        $middleware->redirectGuestsTo(fn () => null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // أخطاء قواعد العمل تُترجم إلى رسالة عربية واضحة ورمز خطأ ثابت
        $exceptions->render(function (DomainException $e, Request $request) {
            if (! $request->expectsJson() && ! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'error_code' => $e->errorCode,
                'message' => $e->getMessage(),
                'context' => $e->context ?: null,
            ], 422);
        });

        $exceptions->render(function (ValidationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'error_code' => 'validation.failed',
                'message' => 'بيانات غير صالحة. راجع الحقول المحددة.',
                'errors' => $e->errors(),
            ], 422);
        });

        $exceptions->render(function (ModelNotFoundException|NotFoundHttpException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'error_code' => 'resource.not_found',
                'message' => 'السجل غير موجود أو خارج نطاق صلاحيتك.',
            ], 404);
        });

        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'error_code' => 'auth.unauthenticated',
                'message' => 'يلزم تسجيل الدخول.',
            ], 401);
        });

        $exceptions->render(function (HttpExceptionInterface $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'error_code' => $e->getStatusCode() === 403 ? 'auth.forbidden' : 'http.error',
                'message' => $e->getMessage() ?: 'تعذّر تنفيذ الطلب.',
            ], $e->getStatusCode());
        });
    })->create();
