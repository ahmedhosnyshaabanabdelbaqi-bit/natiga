<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;


class Item extends Model
{
    use SoftDeletes;

    protected $table = 'items';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'track_batches' => 'boolean',
            'track_serials' => 'boolean',
            'track_expiry' => 'boolean',
            'is_reel' => 'boolean',
            'is_weighted' => 'boolean',
            'has_variants' => 'boolean',
            'is_active' => 'boolean',
            'is_purchasable' => 'boolean',
            'is_sellable' => 'boolean',
            'attributes' => 'array',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ItemCategory::class, 'category_id');
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class, 'brand_id');
    }

    public function baseUom(): BelongsTo
    {
        return $this->belongsTo(Uom::class, 'base_uom_id');
    }

    public function taxCode(): BelongsTo
    {
        return $this->belongsTo(TaxCode::class, 'tax_code_id');
    }

    public function uoms(): HasMany
    {
        return $this->hasMany(ItemUom::class, 'item_id');
    }

    public function barcodes(): HasMany
    {
        return $this->hasMany(ItemBarcode::class, 'item_id');
    }

    public function variants(): HasMany
    {
        return $this->hasMany(ItemVariant::class, 'item_id');
    }

    public function batches(): HasMany
    {
        return $this->hasMany(StockBatch::class, 'item_id');
    }

    public function balances(): HasMany
    {
        return $this->hasMany(StockBalance::class, 'item_id');
    }
}
