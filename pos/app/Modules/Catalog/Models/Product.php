<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Models;

use App\Support\Quantity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model
{
    use SoftDeletes;

    public const TYPE_STANDARD = 'standard';

    public const TYPE_WEIGHTED = 'weighted';

    public const TYPE_SERVICE = 'service';

    public const TYPE_BUNDLE = 'bundle';

    public const TRACKING_NONE = 'none';

    public const TRACKING_SERIAL = 'serial';

    public const TRACKING_BATCH = 'batch';

    protected $table = 'products';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'has_variants' => 'boolean',
            'track_stock' => 'boolean',
            'allow_fractional_qty' => 'boolean',
            'allow_negative_stock' => 'boolean',
            'price_change_allowed' => 'boolean',
            'is_favorite' => 'boolean',
            'is_active' => 'boolean',
            'attributes' => 'array',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'category_id');
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class, 'brand_id');
    }

    public function taxGroup(): BelongsTo
    {
        return $this->belongsTo(TaxGroup::class, 'tax_group_id');
    }

    public function baseUnit(): BelongsTo
    {
        return $this->belongsTo(Unit::class, 'base_unit_id');
    }

    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class, 'product_id');
    }

    public function units(): HasMany
    {
        return $this->hasMany(ProductUnit::class, 'product_id');
    }

    public function barcodes(): HasMany
    {
        return $this->hasMany(Barcode::class, 'product_id');
    }

    public function defaultVariant(): ?ProductVariant
    {
        return $this->variants->firstWhere('is_default', true) ?? $this->variants->first();
    }

    public function baseProductUnit(): ?ProductUnit
    {
        return $this->units->firstWhere('is_base', true);
    }

    public function defaultSaleUnit(): ?ProductUnit
    {
        return $this->units->firstWhere('is_default_sale', true) ?? $this->baseProductUnit();
    }

    public function tracksSerials(): bool
    {
        return $this->tracking === self::TRACKING_SERIAL;
    }

    public function tracksBatches(): bool
    {
        return $this->tracking === self::TRACKING_BATCH;
    }

    public function isStocked(): bool
    {
        return $this->track_stock && $this->type !== self::TYPE_SERVICE;
    }

    /**
     * A product sold by the piece must never accept 1.5. Weighted products and
     * products explicitly flagged fractional may.
     */
    public function acceptsQuantity(Quantity $qty): bool
    {
        if ($this->allow_fractional_qty || $this->type === self::TYPE_WEIGHTED) {
            return true;
        }

        return $qty->isWholeNumber();
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}
