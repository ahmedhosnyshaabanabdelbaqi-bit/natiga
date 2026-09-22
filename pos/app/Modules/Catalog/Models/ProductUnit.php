<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 */
class ProductUnit extends Model
{
    protected $table = 'product_units';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'is_base' => 'boolean',
            'is_default_sale' => 'boolean',
            'is_default_purchase' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class, 'unit_id');
    }
}
