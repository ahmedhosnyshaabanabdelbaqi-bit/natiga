<?php

namespace App\Modules\Vehicles\Models;

use App\Modules\Vehicles\Models\Concerns\HasBilingualName;
use Database\Factories\Vehicles\VehicleModelFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property int $vehicle_make_id
 * @property string $slug
 * @property string $name_ar
 * @property string $name_en
 * @property string|null $model_code
 * @property string|null $body_type
 * @property bool $is_active
 * @property-read VehicleMake $make
 */
class VehicleModel extends Model
{
    /** @use HasFactory<VehicleModelFactory> */
    use HasBilingualName, HasFactory;

    public const BODY_TYPES = ['suv', 'crossover', 'sedan', 'hatchback', 'mpv', 'pickup', 'van', 'other'];

    protected $guarded = [];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'sort_order' => 'integer'];
    }

    protected static function newFactory(): VehicleModelFactory
    {
        return VehicleModelFactory::new();
    }

    public function make(): BelongsTo
    {
        return $this->belongsTo(VehicleMake::class, 'vehicle_make_id');
    }

    public function variants(): HasMany
    {
        return $this->hasMany(VehicleVariant::class)->orderBy('sort_order')->orderByDesc('year_from');
    }

    public function memberVehicles(): HasMany
    {
        return $this->hasMany(MemberVehicle::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('sort_order')->orderBy('name_en');
    }
}
