<?php

namespace App\Modules\Vehicles;

use App\Models\User;
use App\Modules\System\Services\DashboardKpis;
use App\Modules\Vehicles\Models\Enums\VehicleStatus;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Policies\MemberVehiclePolicy;
use App\Modules\Vehicles\Services\SelectedVehicle;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Inertia\Inertia;

class VehiclesServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        // Relations on User (never edit app/Models/User.php).
        User::resolveRelationUsing('vehicles', fn (User $user) => $user->hasMany(MemberVehicle::class, 'user_id'));
        User::resolveRelationUsing('primaryVehicle', fn (User $user) => $user->hasOne(MemberVehicle::class, 'user_id')->where('is_primary', true));

        Gate::policy(MemberVehicle::class, MemberVehiclePolicy::class);

        DashboardKpis::register(
            'vehicles_total',
            'vehicles.view',
            fn () => MemberVehicle::query()->where('status', VehicleStatus::Active->value)->count(),
            'vehicles.kpi.total',
            '/admin/vehicles/members?status=active',
            'member_vehicles.status = active',
            order: 10,
        );

        // Shared prop for the store/search/compatibility UIs (member primary vehicle or guest session pick).
        Inertia::share('selectedVehicle', fn () => SelectedVehicle::current(request()));

        RateLimiter::for('vin-reveal', fn (Request $request) => Limit::perMinute(10)->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('vehicle-select', fn (Request $request) => Limit::perMinute(30)->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('vehicle-data', fn (Request $request) => Limit::perMinute(60)->by($request->ip()));
    }
}
