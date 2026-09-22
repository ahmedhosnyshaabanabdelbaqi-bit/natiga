<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Models;

use App\Modules\Inventory\Models\StockBalance;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property int $id
 */
class ProductVariant extends Model
{
    use SoftDeletes;

    protected $table = 'product_variants';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'attributes' => 'array',
            'is_default' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function barcodes(): HasMany
    {
        return $this->hasMany(Barcode::class, 'variant_id');
    }

    public function prices(): HasMany
    {
        return $this->hasMany(Price::class, 'variant_id');
    }

    public function balances(): HasMany
    {
        return $this->hasMany(StockBalance::class, 'variant_id');
    }

    public function serials(): HasMany
    {
        return $this->hasMany(Serial::class, 'variant_id');
    }

    public function batches(): HasMany
    {
        return $this->hasMany(Batch::class, 'variant_id');
    }

    public function components(): HasMany
    {
        return $this->hasMany(BundleComponent::class, 'bundle_variant_id');
    }
}
