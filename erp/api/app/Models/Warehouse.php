<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Warehouse extends BaseModel
{
    protected $table = 'warehouses';

    /** Kinds whose stock is physically present but not offered for sale. */
    public const NON_SELLABLE_KINDS = ['transit', 'quarantine', 'inspection', 'damaged'];

    protected function casts(): array
    {
        return ['is_sellable' => 'boolean', 'is_active' => 'boolean'];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function bins(): HasMany
    {
        return $this->hasMany(Bin::class);
    }

    public function balances(): HasMany
    {
        return $this->hasMany(StockBalance::class);
    }

    public function isVan(): bool
    {
        return $this->kind === 'van';
    }

    /**
     * Whether stock sitting here may be sold. Quarantine, inspection, damaged
     * and in-transit stock is never available, whatever the flag says.
     */
    public function countsAsAvailable(): bool
    {
        return $this->is_sellable && ! in_array($this->kind, self::NON_SELLABLE_KINDS, true);
    }
}
