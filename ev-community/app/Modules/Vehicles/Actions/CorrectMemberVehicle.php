<?php

namespace App\Modules\Vehicles\Actions;

use App\Models\User;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Models\Enums\VehicleStatus;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Services\VehicleIntegrity;
use App\Support\Exceptions\DomainException;
use Illuminate\Support\Facades\DB;

/**
 * Staff correction of a member vehicle (`vehicles.edit_member_vehicle`): fix the make/model/variant/year
 * classification, the market version or battery, change the status on the member's behalf (e.g. the car
 * was sold) or clear a disputed VIN after verifying ownership. Staff never see nor type the VIN itself.
 * A reason is mandatory and every change is audited.
 */
final class CorrectMemberVehicle
{
    public function __construct(private AuditService $audit, private VehicleIntegrity $integrity, private ChangeVehicleStatus $changeStatus) {}

    /**
     * @param  array{vehicle_make_id: int, vehicle_model_id: int, vehicle_variant_id?: ?int, year: int, market_version: string, battery_variant_id?: ?int, status?: ?string, clear_vin?: bool, reason: string}  $data
     */
    public function execute(MemberVehicle $vehicle, array $data, User $actor): MemberVehicle
    {
        $reason = trim((string) ($data['reason'] ?? ''));
        if (mb_strlen($reason) < 5) {
            throw DomainException::because('core.errors.reason_required', field: 'reason');
        }
        $this->integrity->assertHierarchy((int) $data['vehicle_make_id'], (int) $data['vehicle_model_id'], $data['vehicle_variant_id'] ?? null);

        $vehicle = DB::transaction(function () use ($vehicle, $data, $actor, $reason) {
            $vehicle = MemberVehicle::query()->whereKey($vehicle->id)->lockForUpdate()->firstOrFail();
            $before = $this->snapshot($vehicle);

            $vehicle->fill([
                'vehicle_make_id' => (int) $data['vehicle_make_id'],
                'vehicle_model_id' => (int) $data['vehicle_model_id'],
                'vehicle_variant_id' => $this->id($data['vehicle_variant_id'] ?? null),
                'year' => (int) $data['year'],
                'market_version' => MarketVersion::tryFrom((string) $data['market_version']) ?? MarketVersion::Unknown,
                'battery_variant_id' => $this->id($data['battery_variant_id'] ?? null),
            ]);
            if (($data['clear_vin'] ?? false) && $vehicle->hasVin()) {
                $vehicle->vin = null;
            }
            $vehicle->save();

            $this->audit->logChanges('vehicles.corrected_by_staff', $vehicle, $before, $this->snapshot($vehicle), reason: $reason, actor: $actor);

            return $vehicle;
        });

        $status = VehicleStatus::tryFrom((string) ($data['status'] ?? ''));
        if ($status !== null && $status !== $vehicle->status) {
            $vehicle = $this->changeStatus->execute($vehicle, $status, $actor, $reason);
        }

        return $vehicle;
    }

    private function id(mixed $value): ?int
    {
        return $value === null || $value === '' ? null : (int) $value;
    }

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
        ];
    }
}
