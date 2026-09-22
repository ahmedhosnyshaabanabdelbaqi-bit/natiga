<?php

namespace App\Modules\Vehicles\Models;

use App\Modules\Vehicles\Models\Concerns\HasBilingualName;
use App\Modules\Vehicles\Models\Enums\MarketVersion;
use Database\Factories\Vehicles\VehicleVariantFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property int $vehicle_model_id
 * @property string $name_ar
 * @property string $name_en
 * @property string|null $trim
 * @property MarketVersion $market_version
 * @property int $year_from
 * @property int|null $year_to
 * @property int|null $battery_variant_id
 * @property int|null $ac_connector_type_id
 * @property int|null $dc_connector_type_id
 * @property string|null $battery_capacity_kwh
 * @property int|null $motor_kw
 * @property int|null $range_km_wltp
 * @property string|null $notes
 * @property bool $is_active
 * @property-read VehicleModel $model
 * @property-read int|null $charging_port_connector_type_id  contract alias of ac_connector_type_id
 */
class VehicleVariant extends Model
{
    /** @use HasFactory<VehicleVariantFactory> */
    use HasBilingualName, HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'market_version' => MarketVersion::class,
            'year_from' => 'integer',
            'year_to' => 'integer',
            'battery_capacity_kwh' => 'decimal:2',
            'motor_kw' => 'integer',
            'range_km_wltp' => 'integer',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    protected static function newFactory(): VehicleVariantFactory
    {
        return VehicleVariantFactory::new();
    }

    public function model(): BelongsTo
    {
        return $this->belongsTo(VehicleModel::class, 'vehicle_model_id');
    }

    public function battery(): BelongsTo
    {
        return $this->belongsTo(BatteryVariant::class, 'battery_variant_id');
    }

    public function acConnector(): BelongsTo
    {
        return $this->belongsTo(ConnectorType::class, 'ac_connector_type_id');
    }

    public function dcConnector(): BelongsTo
    {
        return $this->belongsTo(ConnectorType::class, 'dc_connector_type_id');
    }

    public function memberVehicles(): HasMany
    {
        return $this->hasMany(MemberVehicle::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /** DOMAIN_CONTRACTS alias: `charging_port_connector_type_id` (AC port). */
    public function getChargingPortConnectorTypeIdAttribute(): ?int
    {
        return $this->ac_connector_type_id;
    }

    public function coversYear(int $year): bool
    {
        return $year >= $this->year_from && ($this->year_to === null || $year <= $this->year_to);
    }

    public function yearRange(): string
    {
        return $this->year_to === null || $this->year_to === $this->year_from ? (string) $this->year_from.($this->year_to === null ? '+' : '') : $this->year_from.'–'.$this->year_to;
    }
}
