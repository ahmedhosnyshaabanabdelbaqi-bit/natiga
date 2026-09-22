<?php

namespace App\Modules\Vehicles\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Services\VehicleImageStore;
use App\Modules\Vehicles\Services\VehicleIntegrity;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

final class UpdateMemberVehicle
{
    public function __construct(private AuditService $audit, private VehicleImageStore $images, private VehicleIntegrity $integrity) {}

    /**
     * Odometer changes are NOT handled here (see UpdateOdometer) so history stays consistent.
     *
     * @param  array{vehicle_make_id: int, vehicle_model_id: int, vehicle_variant_id?: ?int, year: int, market_version?: ?string, battery_variant_id?: ?int, vin?: ?string, nickname?: ?string, color?: ?string, plate_hint?: ?string}  $data
     */
    public function execute(MemberVehicle $vehicle, array $data, ?UploadedFile $image, bool $removeImage, User $actor): MemberVehicle
    {
        $this->integrity->assertHierarchy((int) $data['vehicle_make_id'], (int) $data['vehicle_model_id'], $data['vehicle_variant_id'] ?? null);
        $vin = MemberVehicle::normalizeVin($data['vin'] ?? null);
        if ($vin !== null) {
            $this->integrity->assertVinNotDuplicated($vin, $vehicle);
        }

        return DB::transaction(function () use ($vehicle, $data, $vin, $image, $removeImage, $actor) {
            $vehicle = MemberVehicle::query()->whereKey($vehicle->id)->lockForUpdate()->firstOrFail();
            $before = $this->snapshot($vehicle);

            $vehicle->fill([
                'vehicle_make_id' => (int) $data['vehicle_make_id'],
                'vehicle_model_id' => (int) $data['vehicle_model_id'],
                'vehicle_variant_id' => $data['vehicle_variant_id'] ?? null,
                'year' => (int) $data['year'],
                'market_version' => MarketVersion::tryFrom((string) ($data['market_version'] ?? '')) ?? MarketVersion::Unknown,
                'battery_variant_id' => $data['battery_variant_id'] ?? null,
                'nickname' => $this->clean($data['nickname'] ?? null),
                'color' => $this->clean($data['color'] ?? null),
                'plate_hint' => $this->clean($data['plate_hint'] ?? null),
            ]);
            // The VIN is only touched when the field was submitted (blank clears it).
            if (array_key_exists('vin', $data)) {
                $vehicle->vin = $vin;
            }
            if ($removeImage) {
                $this->images->detach($vehicle);
            }
            if ($image) {
                $this->images->attach($image, $vehicle);
            }
            $vehicle->save();

            $this->audit->logChanges('vehicles.updated', $vehicle, $before, $this->snapshot($vehicle), actor: $actor);

            return $vehicle;
        });
    }

    private function clean(?string $value): ?string
    {
        $value = $value === null ? null : trim($value);

        return $value === '' ? null : $value;
    }

    /** Never includes the VIN value; only whether one is set. */
    private function snapshot(MemberVehicle $vehicle): array
    {
        return [
            'vehicle_make_id' => $vehicle->vehicle_make_id,
            'vehicle_model_id' => $vehicle->vehicle_model_id,
            'vehicle_variant_id' => $vehicle->vehicle_variant_id,
            'year' => $vehicle->year,
            'market_version' => $vehicle->market_version->value,
            'battery_variant_id' => $vehicle->battery_variant_id,
            'vin_hash' => $vehicle->vin_hash ? substr($vehicle->vin_hash, 0, 12) : null,
            'nickname' => $vehicle->nickname,
            'color' => $vehicle->color,
            'plate_hint' => $vehicle->plate_hint,
            'has_image' => $vehicle->image_attachment_id !== null || $vehicle->image_path !== null,
        ];
    }
}
