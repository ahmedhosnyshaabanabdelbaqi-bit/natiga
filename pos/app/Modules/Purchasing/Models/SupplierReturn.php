<?php

declare(strict_types=1);

namespace App\Modules\Purchasing\Models;

use App\Modules\Core\Models\Warehouse;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 */
class SupplierReturn extends Model
{
    protected $table = 'supplier_returns';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'returned_at' => 'datetime',
            'business_date' => 'date',
        ];
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'warehouse_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(SupplierReturnLine::class, 'supplier_return_id');
    }
}
