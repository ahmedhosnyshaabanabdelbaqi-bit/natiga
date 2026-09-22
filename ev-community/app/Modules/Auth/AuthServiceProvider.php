<?php

namespace App\Modules\Auth;

use App\Models\User;
use App\Modules\Audit\Services\SecurityEvents;
use App\Modules\Auth\Http\Responses\LoginResponse;
use App\Modules\Auth\Http\Responses\LogoutResponse;
use App\Modules\Auth\Http\Responses\RegisterResponse;
use App\Modules\Rbac\Services\PermissionRegistry;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Lockout;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Laravel\Fortify\Contracts\LoginResponse as LoginResponseContract;
use Laravel\Fortify\Contracts\LogoutResponse as LogoutResponseContract;
use Laravel\Fortify\Contracts\RegisterResponse as RegisterResponseContract;
use Laravel\Fortify\Events\RecoveryCodesGenerated;
use Laravel\Fortify\Events\TwoFactorAuthenticationConfirmed;
use Laravel\Fortify\Events\TwoFactorAuthenticationDisabled;
use Laravel\Fortify\Fortify;

class AuthServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(LoginResponseContract::class, LoginResponse::class);
        $this->app->singleton(LogoutResponseContract::class, LogoutResponse::class);
        $this->app->singleton(RegisterResponseContract::class, RegisterResponse::class);
    }

    public function boot(): void
    {
        // Super roles pass every gate. Nothing else is implicit.
        Gate::before(function (User $user, string $ability) {
            return $user->hasAnyRole(PermissionRegistry::SUPER_ROLES) ? true : null;
        });

        // Disabled accounts cannot authenticate even with a correct password.
        Fortify::authenticateUsing(function (Request $request) {
            $user = User::query()->where('email', strtolower((string) $request->input('email')))->first();
            if ($user && $user->isActive() && Hash::check((string) $request->input('password'), $user->password)) {
                return $user;
            }
            if ($user && ! $user->isActive()) {
                SecurityEvents::record($user, 'login_blocked_disabled', [], 'warning');
            }

            return null;
        });

        Event::listen(Login::class, function (Login $event) {
            /** @var User $user */
            $user = $event->user;
            $user->forceFill(['last_login_at' => now(), 'last_login_ip' => request()?->ip()])->saveQuietly();
            SecurityEvents::record($user, 'login_succeeded');
        });
        Event::listen(Failed::class, function (Failed $event) {
            SecurityEvents::record($event->user instanceof User ? $event->user : null, 'login_failed', ['email' => mb_substr((string) ($event->credentials['email'] ?? ''), 0, 120)], 'warning');
        });
        Event::listen(Lockout::class, fn (Lockout $event) => SecurityEvents::record(null, 'login_lockout', ['email' => mb_substr((string) $event->request->input('email'), 0, 120)], 'warning'));
        Event::listen(Logout::class, fn (Logout $event) => $event->user instanceof User ? SecurityEvents::record($event->user, 'logout') : null);
        Event::listen(PasswordReset::class, function (PasswordReset $event) {
            /** @var User $user */
            $user = $event->user;
            $user->forceFill(['password_changed_at' => now()])->saveQuietly();
            SecurityEvents::record($user, 'password_reset');
            app(Services\SessionManager::class)->logoutOtherDevices($user);
        });
        Event::listen(TwoFactorAuthenticationConfirmed::class, fn ($e) => SecurityEvents::record($e->user, 'mfa_enabled'));
        Event::listen(TwoFactorAuthenticationDisabled::class, fn ($e) => SecurityEvents::record($e->user, 'mfa_disabled'));
        Event::listen(RecoveryCodesGenerated::class, fn ($e) => SecurityEvents::record($e->user, 'mfa_recovery_codes_regenerated'));

        RateLimiter::for('locale', fn (Request $request) => Limit::perMinute(30)->by($request->ip()));
        RateLimiter::for('webhooks', fn (Request $request) => Limit::perMinute(120)->by($request->ip()));
        RateLimiter::for('public-forms', fn (Request $request) => Limit::perMinute(10)->by($request->ip()));
        RateLimiter::for('search', fn (Request $request) => Limit::perMinute(60)->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('uploads', fn (Request $request) => Limit::perMinute(20)->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('password-reset', fn (Request $request) => Limit::perMinute(5)->by($request->ip()));
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(120)->by($request->user()?->id ?: $request->ip()));
    }
}
