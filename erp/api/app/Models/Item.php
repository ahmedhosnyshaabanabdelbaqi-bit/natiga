<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Item extends BaseModel
{
    use SoftDeletes;

    protected $table = 'items';

    protected function casts(): array
    {
        return [
            'is_taxable' => 'boolean',
            'track_batches' => 'boolean',
            'track_expiry' => 'boolean',
            'track_serials' => 'boolean',
            'is_weighted' => 'boolean',
            'allow_partial_unit' => 'boolean',
            'reorder_point' => 'decimal:4',
            'reorder_qty' => 'decimal:4',
            'default_sale_price' => 'decimal:4',
            'weight_kg' => 'decimal:4',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ItemCategory::class, 'category_id');
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    public function baseUnit(): BelongsTo
    {
        return $this->belongsTo(Unit::class, 'base_unit_id');
    }

    public function taxRate(): BelongsTo
    {
        return $this->belongsTo(TaxRate::class);
    }

    public function units(): HasMany
    {
        return $this->hasMany(ItemUnit::class);
    }

    public function barcodes(): HasMany
    {
        return $this->hasMany(Barcode::class);
    }

    public function batches(): HasMany
    {
        return $this->hasMany(Batch::class);
    }

    public function cost(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(ItemCost::class);
    }

    public function isSellable(): bool
    {
        return $this->status === 'active';
    }
}
