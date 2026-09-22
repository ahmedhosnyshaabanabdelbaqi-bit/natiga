<?php

namespace App\Modules\Vehicles\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Models\Enums\OdometerSource;
use App\Modules\Vehicles\Models\Enums\VehicleStatus;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Services\VehicleImageStore;
use App\Modules\Vehicles\Services\VehicleIntegrity;
use App\Support\Exceptions\DomainException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

final class CreateMemberVehicle
{
    public function __construct(private AuditService $audit, private VehicleImageStore $images, private VehicleIntegrity $integrity) {}

    /**
     * @param  array{vehicle_make_id: int, vehicle_model_id: int, vehicle_variant_id?: ?int, year: int, market_version?: ?string, battery_variant_id?: ?int, vin?: ?string, nickname?: ?string, color?: ?string, plate_hint?: ?string, odometer_km?: ?int}  $data
     */
    public function execute(User $owner, array $data, ?UploadedFile $image = null, ?User $actor = null): MemberVehicle
    {
        $actor ??= $owner;
        $membership = $owner->membership ?? throw DomainException::forbidden('garage.errors.no_membership');

        $this->integrity->assertHierarchy((int) $data['vehicle_make_id'], (int) $data['vehicle_model_id'], $data['vehicle_variant_id'] ?? null);
        $vin = MemberVehicle::normalizeVin($data['vin'] ?? null);
        if ($vin !== null) {
            $this->integrity->assertVinNotDuplicated($vin);
        }

        return DB::transaction(function () use ($owner, $membership, $data, $vin, $image, $actor) {
            $hasPrimary = MemberVehicle::query()->forUser($owner)->primary()->lockForUpdate()->exists();

            $vehicle = new MemberVehicle([
                'user_id' => $owner->id,
                'membership_id' => $membership->id,
                'vehicle_make_id' => (int) $data['vehicle_make_id'],
                'vehicle_model_id' => (int) $data['vehicle_model_id'],
                'vehicle_variant_id' => $data['vehicle_variant_id'] ?? null,
                'year' => (int) $data['year'],
                'market_version' => MarketVersion::tryFrom((string) ($data['market_version'] ?? '')) ?? MarketVersion::Unknown,
                'battery_variant_id' => $data['battery_variant_id'] ?? null,
                'vin' => $vin,
                'nickname' => $this->clean($data['nickname'] ?? null),
                'color' => $this->clean($data['color'] ?? null),
                'plate_hint' => $this->clean($data['plate_hint'] ?? null),
                'status' => VehicleStatus::Active,
                'is_primary' => ! $hasPrimary,
            ]);

            if (isset($data['odometer_km']) && $data['odometer_km'] !== null && $data['odometer_km'] !== '') {
                $vehicle->odometer_km = (int) $data['odometer_km'];
                $vehicle->odometer_updated_at = now();
            }
            if ($image) {
                $this->images->attach($image, $vehicle);
            }
            $vehicle->save();

            if ($vehicle->odometer_km !== null) {
                $vehicle->odometerHistory()->create([
                    'odometer_km' => $vehicle->odometer_km,
                    'source' => OdometerSource::Manual,
                    'recorded_at' => now(),
                    'created_by' => $actor->id,
                ]);
            }

            $this->audit->log('vehicles.created', $vehicle, new: $this->snapshot($vehicle), actor: $actor, entityLabel: $vehicle->displayName());

            return $vehicle;
        });
    }

    private function clean(?string $value): ?string
    {
        $value = $value === null ? null : trim($value);

        return $value === '' ? null : $value;
    }

    /** Audit snapshot — never includes the VIN. */
    private function snapshot(MemberVehicle $vehicle): array
    {
        return [
            'vehicle_make_id' => $vehicle->vehicle_make_id,
            'vehicle_model_id' => $vehicle->vehicle_model_id,
            'vehicle_variant_id' => $vehicle->vehicle_variant_id,
            'year' => $vehicle->year,
            'market_version' => $vehicle->market_version->value,
            'battery_variant_id' => $vehicle->battery_variant_id,
            'has_vin' => $vehicle->hasVin(),
            'nickname' => $vehicle->nickname,
            'odometer_km' => $vehicle->odometer_km,
            'is_primary' => $vehicle->is_primary,
        ];
    }
}
