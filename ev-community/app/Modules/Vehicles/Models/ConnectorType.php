<?php

namespace App\Modules\Vehicles\Models;

use App\Modules\Vehicles\Models\Concerns\HasBilingualName;
use App\Modules\Vehicles\Models\Enums\CurrentType;
use Database\Factories\Vehicles\ConnectorTypeFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $code
 * @property string $name_ar
 * @property string $name_en
 * @property CurrentType $current_type
 * @property bool $is_active
 */
class ConnectorType extends Model
{
    /** @use HasFactory<ConnectorTypeFactory> */
    use HasBilingualName, HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['current_type' => CurrentType::class, 'is_active' => 'boolean', 'sort_order' => 'integer'];
    }

    protected static function newFactory(): ConnectorTypeFactory
    {
        return ConnectorTypeFactory::new();
    }

    /** Rules where this connector is the vehicle side. */
    public function vehicleRules(): HasMany
    {
        return $this->hasMany(ConnectorCompatibilityRule::class, 'vehicle_connector_type_id');
    }

    /** Rules where this connector is the station side. */
    public function stationRules(): HasMany
    {
        return $this->hasMany(ConnectorCompatibilityRule::class, 'station_connector_type_id');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('sort_order')->orderBy('code');
    }

    public static function idByCode(string $code): ?int
    {
        return static::query()->where('code', $code)->value('id');
    }
}
