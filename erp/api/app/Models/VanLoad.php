<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class VanLoad extends BaseModel
{
    protected $table = 'van_loads';

    protected function casts(): array
    {
        return ['load_date' => 'date'];
    }

    public function lines(): HasMany
    {
        return $this->hasMany(VanLoadLine::class);
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function rep(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rep_id');
    }

    public function fromWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'from_warehouse_id');
    }

    public function vanWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'van_warehouse_id');
    }

    public function stockTransfer(): BelongsTo
    {
        return $this->belongsTo(StockTransfer::class);
    }
}
