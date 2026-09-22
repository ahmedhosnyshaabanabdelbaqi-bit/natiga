<?php

namespace App\Modules\Vehicles\Models;

use App\Models\User;
use App\Modules\Vehicles\Models\Enums\Compatibility;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $vehicle_connector_type_id
 * @property int $station_connector_type_id
 * @property Compatibility $compatibility
 * @property string|null $adapter_name
 * @property string|null $notes
 * @property int|null $verified_by
 */
class ConnectorCompatibilityRule extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['compatibility' => Compatibility::class, 'verified_at' => 'datetime'];
    }

    public function vehicleConnector(): BelongsTo
    {
        return $this->belongsTo(ConnectorType::class, 'vehicle_connector_type_id');
    }

    public function stationConnector(): BelongsTo
    {
        return $this->belongsTo(ConnectorType::class, 'station_connector_type_id');
    }

    public function verifier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }

    /**
     * Compatibility lookup for a set of vehicle-side connector ids.
     * Same-type pairs without an explicit rule are treated as direct.
     *
     * @param  int[]  $vehicleConnectorIds
     * @return array{direct: int[], adapter: int[], incompatible: int[], rules: array<int, array{station_connector_type_id: int, vehicle_connector_type_id: int, compatibility: string, adapter_name: ?string, notes: ?string}>}
     */
    public static function resolveFor(array $vehicleConnectorIds): array
    {
        $vehicleConnectorIds = array_values(array_unique(array_filter(array_map('intval', $vehicleConnectorIds))));
        $out = ['direct' => [], 'adapter' => [], 'incompatible' => [], 'rules' => []];
        if ($vehicleConnectorIds === []) {
            return $out;
        }
        $rules = static::query()->whereIn('vehicle_connector_type_id', $vehicleConnectorIds)->get();
        $seen = [];
        foreach ($rules as $rule) {
            $seen[$rule->station_connector_type_id] = true;
            $out[$rule->compatibility->value][] = $rule->station_connector_type_id;
            $out['rules'][] = [
                'station_connector_type_id' => $rule->station_connector_type_id,
                'vehicle_connector_type_id' => $rule->vehicle_connector_type_id,
                'compatibility' => $rule->compatibility->value,
                'adapter_name' => $rule->adapter_name,
                'notes' => $rule->notes,
            ];
        }
        foreach ($vehicleConnectorIds as $id) {
            if (! isset($seen[$id])) {
                $out['direct'][] = $id;
                $out['rules'][] = ['station_connector_type_id' => $id, 'vehicle_connector_type_id' => $id, 'compatibility' => Compatibility::Direct->value, 'adapter_name' => null, 'notes' => null];
            }
        }
        // A station connector reachable directly is never reported as adapter/incompatible as well.
        $out['direct'] = array_values(array_unique($out['direct']));
        $out['adapter'] = array_values(array_diff(array_unique($out['adapter']), $out['direct']));
        $out['incompatible'] = array_values(array_diff(array_unique($out['incompatible']), $out['direct'], $out['adapter']));

        return $out;
    }
}
