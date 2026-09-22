<?php

namespace App\Modules\Vehicles\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Services\VehicleImageStore;
use App\Modules\Vehicles\Services\VehicleIntegrity;
use App\Support\Exceptions\DomainException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

/** Owner edit of a garage vehicle. Odometer changes go through UpdateOdometer so history stays consistent. */
final class UpdateMemberVehicle
{
    public function __construct(private AuditService $audit, private VehicleImageStore $images, private VehicleIntegrity $integrity) {}

    /**
     * @param  array{vehicle_make_id: int, vehicle_model_id: int, vehicle_variant_id?: ?int, year: int, market_version?: ?string, battery_variant_id?: ?int, vin?: ?string, nickname?: ?string, color?: ?string, plate_hint?: ?string}  $data
     */
    public function execute(MemberVehicle $vehicle, array $data, ?UploadedFile $image, bool $removeImage, User $actor): MemberVehicle
    {
        $this->integrity->assertHierarchy((int) $data['vehicle_make_id'], (int) $data['vehicle_model_id'], $data['vehicle_variant_id'] ?? null);
        $vin = MemberVehicle::normalizeVin($data['vin'] ?? null);
        if ($vin !== null && ! MemberVehicle::isValidVin($vin)) {
            throw DomainException::because('vehicles.errors.vin_invalid', field: 'vin');
        }

        return $this->integrity->guardVinUniqueness(fn () => DB::transaction(function () use ($vehicle, $data, $vin, $image, $removeImage, $actor) {
            $this->integrity->lockGarage((int) $vehicle->user_id);
            $vehicle = MemberVehicle::query()->whereKey($vehicle->id)->lockForUpdate()->firstOrFail();
            $before = $this->snapshot($vehicle);
            $vinBefore = $vehicle->vin_hash;

            $vehicle->fill([
                'vehicle_make_id' => (int) $data['vehicle_make_id'],
                'vehicle_model_id' => (int) $data['vehicle_model_id'],
                'vehicle_variant_id' => $this->id($data['vehicle_variant_id'] ?? null),
                'year' => (int) $data['year'],
                'market_version' => MarketVersion::tryFrom((string) ($data['market_version'] ?? '')) ?? MarketVersion::Unknown,
                'battery_variant_id' => $this->id($data['battery_variant_id'] ?? null),
                'nickname' => $this->clean($data['nickname'] ?? null),
                'color' => $this->clean($data['color'] ?? null),
                'plate_hint' => $this->clean($data['plate_hint'] ?? null),
            ]);
            // The VIN is only touched when the field was submitted (blank clears it).
            if (array_key_exists('vin', $data)) {
                if ($vin !== null && $vehicle->isActive() && MemberVehicle::hashVin($vin) !== $vinBefore) {
                    $this->integrity->assertVinNotDuplicated($vin, $vehicle);
                }
                if ($vin === null || MemberVehicle::hashVin($vin) !== $vinBefore) {
                    $vehicle->vin = $vin;
                }
            }
            if ($removeImage) {
                $this->images->detach($vehicle);
            }
            if ($image) {
                $this->images->attach($image, $vehicle, $actor);
            }
            $vehicle->save();

            $after = $this->snapshot($vehicle);
            $after['vin_changed'] = $vehicle->vin_hash !== $vinBefore;
            $before['vin_changed'] = false;
            $this->audit->logChanges('vehicles.updated', $vehicle, $before, $after, actor: $actor);

            return $vehicle;
        }));
    }

    private function clean(?string $value): ?string
    {
        $value = $value === null ? null : trim($value);

        return $value === '' ? null : $value;
    }

    private function id(mixed $value): ?int
    {
        return $value === null || $value === '' ? null : (int) $value;
    }

    /** Never includes the VIN value nor its hash; only whether one is set. */
    private function snapshot(MemberVehicle $vehicle): array
    {
        return [
            'vehicle_make_id' => $vehicle->vehicle_make_id,
            'vehicle_model_id' => $vehicle->vehicle_model_id,
            'vehicle_variant_id' => $vehicle->vehicle_variant_id,
            'year' => $vehicle->year,
            'market_version' => $vehicle->market_version->value,
            'battery_variant_id' => $vehicle->battery_variant_id,
            'has_vin' => $vehicle->vin_hash !== null,
            'nickname' => $vehicle->nickname,
            'color' => $vehicle->color,
            'plate_hint' => $vehicle->plate_hint,
            'has_image' => $vehicle->image_attachment_id !== null || $vehicle->image_path !== null,
        ];
    }
}
