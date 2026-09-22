<?php

namespace App\Modules\Vehicles\Models;

use Database\Factories\Vehicles\BatteryVariantFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $name
 * @property string $capacity_kwh
 * @property string|null $chemistry
 * @property string|null $notes
 */
class BatteryVariant extends Model
{
    /** @use HasFactory<BatteryVariantFactory> */
    use HasFactory;

    public const CHEMISTRIES = ['LFP', 'NMC', 'NCA', 'other'];

    protected $guarded = [];

    protected function casts(): array
    {
        return ['capacity_kwh' => 'decimal:2'];
    }

    protected static function newFactory(): BatteryVariantFactory
    {
        return BatteryVariantFactory::new();
    }

    public function variants(): HasMany
    {
        return $this->hasMany(VehicleVariant::class);
    }
}
