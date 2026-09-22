<?php

namespace App\Modules\Vehicles\Services;

use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Models\VehicleMake;
use App\Modules\Vehicles\Models\VehicleModel;
use App\Modules\Vehicles\Models\VehicleVariant;
use Illuminate\Http\Request;

/**
 * The "currently selected vehicle" used by the store/search/compatibility UIs.
 *  - logged-in member: their primary active garage vehicle (source = garage), else their session pick
 *  - guest: the selection stored in the session by POST /{locale}/vehicles/select (source = session)
 *
 * Shared with every Inertia page as `selectedVehicle` (see VehiclesServiceProvider) and read on the
 * frontend through `useSelectedVehicle()` from resources/js/features/vehicles.
 */
final class SelectedVehicle
{
    public const SESSION_KEY = 'vehicles.selected';

    /** @param  array{make_id: int, model_id: int, variant_id?: ?int, year?: ?int}  $selection */
    public static function store(Request $request, array $selection): void
    {
        $request->session()->put(self::SESSION_KEY, [
            'make_id' => (int) $selection['make_id'],
            'model_id' => (int) $selection['model_id'],
            'variant_id' => isset($selection['variant_id']) && $selection['variant_id'] !== '' ? (int) $selection['variant_id'] : null,
            'year' => isset($selection['year']) && $selection['year'] !== '' ? (int) $selection['year'] : null,
        ]);
    }

    public static function clear(Request $request): void
    {
        $request->session()->forget(self::SESSION_KEY);
    }

    /**
     * @return array{source: string, vehicle_id: ?string, make_id: int, model_id: int, variant_id: ?int, year: ?int, make_name: string, model_name: string, variant_name: ?string, display_name: string}|null
     */
    public static function current(?Request $request = null): ?array
    {
        $request ??= request();
        try {
            $user = $request->user();
            if ($user) {
                $vehicle = MemberVehicle::query()->forUser($user)->active()->primary()->with(['make', 'model', 'variant'])->first();
                if ($vehicle) {
                    return [
                        'source' => 'garage',
                        'vehicle_id' => $vehicle->public_id,
                        'make_id' => $vehicle->vehicle_make_id,
                        'model_id' => $vehicle->vehicle_model_id,
                        'variant_id' => $vehicle->vehicle_variant_id,
                        'year' => $vehicle->year,
                        'make_name' => $vehicle->make->name(),
                        'model_name' => $vehicle->model->name(),
                        'variant_name' => $vehicle->variant?->name(),
                        'display_name' => $vehicle->displayName(),
                    ];
                }
            }
            if (! $request->hasSession()) {
                return null;
            }
            $selection = $request->session()->get(self::SESSION_KEY);
            if (! is_array($selection) || empty($selection['make_id']) || empty($selection['model_id'])) {
                return null;
            }
            $make = VehicleMake::query()->find($selection['make_id']);
            $model = VehicleModel::query()->find($selection['model_id']);
            if (! $make || ! $model || (int) $model->vehicle_make_id !== (int) $make->id) {
                return null;
            }
            $variant = ! empty($selection['variant_id']) ? VehicleVariant::query()->find($selection['variant_id']) : null;
            $year = $selection['year'] ?? null;

            return [
                'source' => 'session',
                'vehicle_id' => null,
                'make_id' => $make->id,
                'model_id' => $model->id,
                'variant_id' => $variant?->id,
                'year' => $year,
                'make_name' => $make->name(),
                'model_name' => $model->name(),
                'variant_name' => $variant?->name(),
                'display_name' => trim($make->name().' '.$model->name().' '.($year ?: '')),
            ];
        } catch (\Throwable $e) {
            report($e); // e.g. tables not migrated yet at install time

            return null;
        }
    }
}
