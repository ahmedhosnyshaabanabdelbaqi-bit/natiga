<?php

declare(strict_types=1);

namespace App\Modules\Sales\Models;

use App\Modules\Catalog\Models\Batch;
use App\Modules\Catalog\Models\Product;
use App\Modules\Catalog\Models\ProductUnit;
use App\Modules\Catalog\Models\ProductVariant;
use App\Support\Money;
use App\Support\Quantity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SaleLine extends Model
{
    protected $table = 'sale_lines';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'tax_inclusive' => 'boolean',
            'price_overridden' => 'boolean',
            'is_bundle_component' => 'boolean',
            'meta' => 'array',
        ];
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class, 'sale_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }

    public function productUnit(): BelongsTo
    {
        return $this->belongsTo(ProductUnit::class, 'product_unit_id');
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(Batch::class, 'batch_id');
    }

    public function serials(): HasMany
    {
        return $this->hasMany(SaleLineSerial::class, 'sale_line_id');
    }

    public function returnLines(): HasMany
    {
        return $this->hasMany(SaleReturnLine::class, 'sale_line_id');
    }

    /** Base-unit quantity still eligible for return on this line. */
    public function returnableQtyBase(): Quantity
    {
        return Quantity::of($this->qty_base)->minus(Quantity::of($this->returned_qty_base));
    }

    /**
     * What one base unit of this line actually cost the customer, tax included:
     * the line total spread evenly over its quantity. Returns are valued with
     * this, never with today's price list.
     */
    public function effectiveUnitTotal(): Money
    {
        return Money::of($this->total_amount)->dividedBy(Quantity::of($this->qty_base));
    }

    public function effectiveUnitNet(): Money
    {
        return Money::of($this->net_amount)->dividedBy(Quantity::of($this->qty_base));
    }

    public function effectiveUnitTax(): Money
    {
        return Money::of($this->tax_amount)->dividedBy(Quantity::of($this->qty_base));
    }
}
