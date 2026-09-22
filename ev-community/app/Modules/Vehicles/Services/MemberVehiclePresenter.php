<?php

namespace App\Modules\Vehicles\Services;

use App\Modules\Vehicles\Models\ConnectorType;
use App\Modules\Vehicles\Models\MemberVehicle;
use App\Modules\Vehicles\Models\VehicleOdometerEntry;
use Illuminate\Support\Collection;

/**
 * Array shapes sent to the React pages. The VIN never appears here (only masked / has_vin).
 */
final class MemberVehiclePresenter
{
    public function card(MemberVehicle $v): array
    {
        $v->loadMissing(['make', 'model', 'variant']);

        return [
            'id' => $v->public_id,
            'display_name' => $v->displayName(),
            'nickname' => $v->nickname,
            'make' => ['id' => $v->make->id, 'name' => $v->make->name(), 'logo' => $v->make->logoUrl(), 'slug' => $v->make->slug],
            'model' => ['id' => $v->model->id, 'name' => $v->model->name(), 'body_type' => $v->model->body_type],
            'variant' => $v->variant ? ['id' => $v->variant->id, 'name' => $v->variant->name(), 'trim' => $v->variant->trim] : null,
            'year' => $v->year,
            'market_version' => ['value' => $v->market_version->value, 'label' => $v->market_version->label()],
            'status' => ['value' => $v->status->value, 'label' => $v->status->label(), 'color' => $v->status->color()],
            'is_primary' => $v->is_primary,
            'odometer_km' => $v->odometer_km,
            'odometer_updated_at' => $v->odometer_updated_at?->toIso8601String(),
            'image_url' => $v->imageUrl(),
            'color' => $v->color,
            'has_vin' => $v->hasVin(),
            'created_at' => $v->created_at?->toIso8601String(),
        ];
    }

    /** Member detail page header. */
    public function detail(MemberVehicle $v): array
    {
        $v->loadMissing(['make', 'model', 'variant', 'battery']);
        $blocked = $v->deletionBlockedReason();

        return $this->card($v) + [
            'plate_hint' => $v->plate_hint,
            'vin_masked' => $v->maskedVin(),
            'battery_capacity_kwh' => $v->batteryCapacityKwh(),
            'can_delete' => $blocked === null,
            'delete_blocked_reason' => $blocked,
        ];
    }

    /** Admin list row: member reference, never the VIN. */
    public function adminRow(MemberVehicle $v): array
    {
        $v->loadMissing(['make', 'model', 'variant', 'user', 'membership']);

        return $this->card($v) + [
            'member' => [
                'id' => $v->membership?->public_id,
                'member_number' => $v->membership?->member_number,
                'name' => $v->user?->name,
            ],
        ];
    }

    /** "Info" garage section. */
    public function info(MemberVehicle $v): array
    {
        $v->loadMissing(['make', 'model', 'variant.battery', 'variant.acConnector', 'variant.dcConnector', 'battery']);
        $variant = $v->variant;
        $battery = $v->battery ?? $variant?->battery;

        return [
            'make' => $v->make->name(),
            'model' => $v->model->name(),
            'model_code' => $v->model->model_code,
            'body_type' => $v->model->body_type,
            'variant' => $variant?->name(),
            'trim' => $variant?->trim,
            'year' => $v->year,
            'market_version' => $v->market_version->label(),
            'battery' => $battery ? ['name' => $battery->name, 'capacity_kwh' => (string) $battery->capacity_kwh, 'chemistry' => $battery->chemistry] : null,
            'battery_capacity_kwh' => $v->batteryCapacityKwh(),
            'motor_kw' => $variant?->motor_kw,
            'range_km_wltp' => $variant?->range_km_wltp,
            'connectors' => [
                'ac' => $this->connector($variant?->acConnector),
                'dc' => $this->connector($variant?->dcConnector),
            ],
            'spec_notes' => $variant?->notes,
            'color' => $v->color,
            'plate_hint' => $v->plate_hint,
            'nickname' => $v->nickname,
            'has_vin' => $v->hasVin(),
            'vin_masked' => $v->maskedVin(),
        ];
    }

    /** "Odometer" garage section (member view: no staff names). */
    public function odometer(MemberVehicle $v): array
    {
        return [
            'current_km' => $v->odometer_km,
            'updated_at' => $v->odometer_updated_at?->toIso8601String(),
            'history' => $this->odometerHistory($v->odometerHistory()->limit(200)->get()),
        ];
    }

    /**
     * Newest first. `is_decrease` flags a reading lower than the previous (older) one — those always carry a reason.
     *
     * @param  Collection<int, VehicleOdometerEntry>  $entries
     */
    public function odometerHistory(Collection $entries): array
    {
        $list = $entries->values();

        return $list->map(function (VehicleOdometerEntry $e, int $i) use ($list) {
            $older = $list->get($i + 1);

            return [
                'id' => $e->id,
                'odometer_km' => $e->odometer_km,
                'source' => ['value' => $e->source->value, 'label' => $e->source->label()],
                'recorded_at' => $e->recorded_at->toIso8601String(),
                'note' => $e->note,
                'created_by' => $e->relationLoaded('creator') ? $e->creator?->name : null,
                'is_decrease' => $older !== null && $e->odometer_km < $older->odometer_km,
            ];
        })->all();
    }

    /** "Charging compatibility" garage section. */
    public function chargingCompatibility(MemberVehicle $v): array
    {
        $v->loadMissing(['variant.acConnector', 'variant.dcConnector']);
        $ids = $v->connectorTypeIds();
        $vehicleConnectors = array_values(array_filter([$this->connector($v->variant?->acConnector), $this->connector($v->variant?->dcConnector)]));
        if ($vehicleConnectors === []) {
            return ['known' => false, 'vehicle_connectors' => [], 'direct' => [], 'adapter' => [], 'incompatible' => []];
        }
        $resolved = $v->connectorCompatibility();
        $stationIds = array_unique(array_merge($resolved['direct'], $resolved['adapter'], $resolved['incompatible']));
        $connectors = ConnectorType::query()->whereIn('id', $stationIds)->get()->keyBy('id');
        $rulesByStation = collect($resolved['rules'])->groupBy('station_connector_type_id');
        $shape = function (int $id, string $bucket) use ($connectors, $rulesByStation) {
            $connector = $connectors->get($id);
            if (! $connector) {
                return null;
            }
            $rule = $rulesByStation->get($id, collect())->firstWhere('compatibility', $bucket) ?? [];

            return $this->connector($connector) + ['adapter_name' => $rule['adapter_name'] ?? null, 'notes' => $rule['notes'] ?? null];
        };

        return [
            'known' => true,
            'vehicle_connectors' => $vehicleConnectors,
            'direct' => array_values(array_filter(array_map(fn ($id) => $shape($id, 'direct'), $resolved['direct']))),
            'adapter' => array_values(array_filter(array_map(fn ($id) => $shape($id, 'adapter'), $resolved['adapter']))),
            'incompatible' => array_values(array_filter(array_map(fn ($id) => $shape($id, 'incompatible'), $resolved['incompatible']))),
            'connector_type_ids' => $ids,
        ];
    }

    private function connector(?ConnectorType $c): ?array
    {
        return $c ? ['id' => $c->id, 'code' => $c->code, 'name' => $c->name(), 'current_type' => $c->current_type->value] : null;
    }
}
