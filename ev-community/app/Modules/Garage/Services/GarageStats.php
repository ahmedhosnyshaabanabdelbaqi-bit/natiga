<?php

namespace App\Modules\Garage\Services;

use App\Modules\Vehicles\Models\Enums\VehicleStatus;
use App\Modules\Vehicles\Models\MemberVehicle;
use Illuminate\Support\Facades\DB;

/** Aggregations for the admin "My Garage data" overview. Every figure is computed live from the database. */
final class GarageStats
{
    public function overview(): array
    {
        $base = MemberVehicle::query();
        $locale = app()->getLocale();
        $nameCol = $locale === 'ar' ? 'name_ar' : 'name_en';

        $byStatus = (clone $base)->select('status', DB::raw('count(*) as total'))->groupBy('status')->pluck('total', 'status');

        $topModels = MemberVehicle::query()
            ->join('vehicle_models', 'vehicle_models.id', '=', 'member_vehicles.vehicle_model_id')
            ->join('vehicle_makes', 'vehicle_makes.id', '=', 'member_vehicles.vehicle_make_id')
            ->where('member_vehicles.status', VehicleStatus::Active->value)
            ->select('vehicle_makes.id as make_id', "vehicle_makes.$nameCol as make_name", 'vehicle_models.id as model_id', "vehicle_models.$nameCol as model_name", DB::raw('count(*) as total'))
            ->groupBy('vehicle_makes.id', "vehicle_makes.$nameCol", 'vehicle_models.id', "vehicle_models.$nameCol")
            ->orderByDesc('total')->orderBy("vehicle_makes.$nameCol")
            ->limit(20)->get()
            ->map(fn ($r) => ['make_id' => $r->make_id, 'make' => $r->make_name, 'model_id' => $r->model_id, 'model' => $r->model_name, 'total' => (int) $r->total])->all();

        $byMake = MemberVehicle::query()
            ->join('vehicle_makes', 'vehicle_makes.id', '=', 'member_vehicles.vehicle_make_id')
            ->where('member_vehicles.status', VehicleStatus::Active->value)
            ->select('vehicle_makes.id as make_id', "vehicle_makes.$nameCol as make_name", DB::raw('count(*) as total'))
            ->groupBy('vehicle_makes.id', "vehicle_makes.$nameCol")
            ->orderByDesc('total')->limit(20)->get()
            ->map(fn ($r) => ['make_id' => $r->make_id, 'make' => $r->make_name, 'total' => (int) $r->total])->all();

        $byYear = (clone $base)->where('status', VehicleStatus::Active->value)
            ->select('year', DB::raw('count(*) as total'))->groupBy('year')->orderBy('year')->get()
            ->map(fn ($r) => ['year' => (int) $r->year, 'total' => (int) $r->total])->all();

        return [
            'totals' => [
                'all' => (int) $byStatus->sum(),
                'active' => (int) ($byStatus[VehicleStatus::Active->value] ?? 0),
                'sold' => (int) ($byStatus[VehicleStatus::Sold->value] ?? 0),
                'archived' => (int) ($byStatus[VehicleStatus::Archived->value] ?? 0),
                'without_variant' => (int) (clone $base)->where('status', VehicleStatus::Active->value)->whereNull('vehicle_variant_id')->count(),
                'without_vin' => (int) (clone $base)->where('status', VehicleStatus::Active->value)->whereNull('vin_hash')->count(),
                'with_odometer' => (int) (clone $base)->where('status', VehicleStatus::Active->value)->whereNotNull('odometer_km')->count(),
                'members_with_vehicles' => (int) (clone $base)->where('status', VehicleStatus::Active->value)->distinct('user_id')->count('user_id'),
            ],
            'top_models' => $topModels,
            'by_make' => $byMake,
            'by_year' => $byYear,
        ];
    }
}
