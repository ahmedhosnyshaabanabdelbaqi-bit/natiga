<?php

declare(strict_types=1);

namespace App\Providers;

use App\Modules\Access\Services\PermissionService;
use App\Modules\Core\Services\PosContext;
use App\Modules\Core\Services\SettingsService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Request-scoped state and caches: one instance per request/command.
        $this->app->singleton(PosContext::class);
        $this->app->singleton(SettingsService::class);
        $this->app->singleton(PermissionService::class);
    }

    public function boot(): void
    {
        // Catch typos in mass assignment during development instead of
        // silently dropping the attribute.
        Model::preventSilentlyDiscardingAttributes($this->app->environment('local', 'testing'));
    }
}
