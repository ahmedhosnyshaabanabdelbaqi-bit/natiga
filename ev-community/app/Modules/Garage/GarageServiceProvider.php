<?php

namespace App\Modules\Garage;

use App\Models\User;
use App\Modules\Garage\Services\GarageSections;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Services\MemberVehiclePresenter;
use Illuminate\Support\ServiceProvider;

class GarageServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        // Core sections of the vehicle page. Other modules add theirs the same way (see docs/modules/vehicles-garage.md).
        GarageSections::register('info', 'garage.sections.info', fn (MemberVehicle $v, User $u) => app(MemberVehiclePresenter::class)->info($v), module: 'vehicles', order: 10);
        GarageSections::register('odometer', 'garage.sections.odometer', fn (MemberVehicle $v, User $u) => app(MemberVehiclePresenter::class)->odometer($v), module: 'garage', order: 20);
        GarageSections::register('charging_compatibility', 'garage.sections.charging_compatibility', fn (MemberVehicle $v, User $u) => app(MemberVehiclePresenter::class)->chargingCompatibility($v), module: 'vehicles', order: 30);
    }
}
