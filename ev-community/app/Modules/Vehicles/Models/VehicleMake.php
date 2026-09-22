<?php

namespace App\Modules\Vehicles\Models;

use App\Modules\Vehicles\Models\Concerns\HasBilingualName;
use Database\Factories\Vehicles\VehicleMakeFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

/**
 * @property int $id
 * @property string $slug
 * @property string $name_ar
 * @property string $name_en
 * @property string|null $logo_path
 * @property string|null $country_code
 * @property bool $is_active
 * @property int $sort_order
 */
class VehicleMake extends Model
{
    /** @use HasFactory<VehicleMakeFactory> */
    use HasBilingualName, HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'sort_order' => 'integer'];
    }

    protected static function newFactory(): VehicleMakeFactory
    {
        return VehicleMakeFactory::new();
    }

    public function models(): HasMany
    {
        return $this->hasMany(VehicleModel::class)->orderBy('sort_order')->orderBy('name_en');
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

    public function logoUrl(): ?string
    {
        return $this->logo_path ? Storage::disk((string) config('filesystems.public_disk', 'public'))->url($this->logo_path) : null;
    }
}
