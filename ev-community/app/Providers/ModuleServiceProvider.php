<?php

namespace App\Providers;

use App\Modules\System\Services\Modules;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

/**
 * Discovers app/Modules/<Module>/ and registers:
 *  - <Module>ServiceProvider (if present)
 *  - routes/{public,member,admin,partner,api}.php inside the right portal group
 *  - Console/*Command.php classes
 */
class ModuleServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        foreach ($this->modulePaths() as $name => $path) {
            $provider = "App\\Modules\\{$name}\\{$name}ServiceProvider";
            if (class_exists($provider)) {
                $this->app->register($provider);
            }
        }
    }

    public function boot(): void
    {
        $this->registerCommands();
        $this->registerRoutes();
    }

    /** @return array<string, string> */
    private function modulePaths(): array
    {
        $paths = [];
        foreach (File::directories(app_path('Modules')) as $dir) {
            $paths[basename($dir)] = $dir;
        }
        ksort($paths);

        return $paths;
    }

    private function registerCommands(): void
    {
        if (! $this->app->runningInConsole()) {
            return;
        }
        $commands = [];
        foreach ($this->modulePaths() as $name => $path) {
            foreach (File::glob($path.'/Console/*.php') as $file) {
                $class = "App\\Modules\\{$name}\\Console\\".pathinfo($file, PATHINFO_FILENAME);
                if (class_exists($class)) {
                    $commands[] = $class;
                }
            }
        }
        $this->commands($commands);
    }

    private function registerRoutes(): void
    {
        $modules = $this->modulePaths();

        Route::middleware(['web', 'locale.public'])->prefix('{locale}')->where(['locale' => implode('|', ev_locales())])->name('public.')
            ->group(function () use ($modules) {
                $this->requireRouteFiles($modules, 'public');
            });

        Route::middleware(['web', 'auth', 'active', 'member.portal'])->prefix('account')->name('member.')
            ->group(function () use ($modules) {
                $this->requireRouteFiles($modules, 'member');
            });

        Route::middleware(['web', 'auth', 'active', 'admin.portal'])->prefix('admin')->name('admin.')
            ->group(function () use ($modules) {
                $this->requireRouteFiles($modules, 'admin');
            });

        Route::middleware(['web', 'auth', 'active', 'partner.portal'])->prefix('partner')->name('partner.')
            ->group(function () use ($modules) {
                $this->requireRouteFiles($modules, 'partner');
            });

        Route::middleware(['api', 'auth:sanctum'])->prefix('api/v1')->name('api.v1.')
            ->group(function () use ($modules) {
                $this->requireRouteFiles($modules, 'api');
            });

        // Webhooks: unauthenticated, signed by the provider, rate limited.
        Route::middleware(['api', 'throttle:webhooks'])->prefix('webhooks')->name('webhooks.')
            ->group(function () use ($modules) {
                $this->requireRouteFiles($modules, 'webhooks');
            });
    }

    /** @param array<string, string> $modules */
    private function requireRouteFiles(array $modules, string $space): void
    {
        foreach ($modules as $name => $path) {
            $file = $path.'/routes/'.$space.'.php';
            if (File::exists($file)) {
                $moduleKey = Str::snake($name);
                if (config('ev.modules.'.$moduleKey) !== null && ! Modules::enabled($moduleKey)) {
                    // Disabled module: routes are still registered but blocked by the module middleware
                    // so that named routes keep resolving in shared layouts.
                    Route::middleware('module:'.$moduleKey)->group(fn () => require $file);
                } else {
                    require $file;
                }
            }
        }
    }
}
