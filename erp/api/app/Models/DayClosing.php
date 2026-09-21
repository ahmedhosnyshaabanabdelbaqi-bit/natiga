<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DayClosing extends BaseModel
{
    protected $table = 'day_closings';

    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'submitted_at' => 'datetime',
            'approved_at' => 'datetime',
            'reopened_at' => 'datetime',
            'sync_complete' => 'boolean',
            'cash_opening' => 'decimal:2',
            'cash_receipts' => 'decimal:2',
            'cash_custody_in' => 'decimal:2',
            'cash_deposits' => 'decimal:2',
            'cash_expenses' => 'decimal:2',
            'cash_refunds' => 'decimal:2',
            'expected_cash' => 'decimal:2',
            'actual_cash' => 'decimal:2',
            'cash_variance' => 'decimal:2',
            'cheque_collections' => 'decimal:2',
            'bank_collections' => 'decimal:2',
            'goods_opening_value' => 'decimal:2',
            'goods_loaded_value' => 'decimal:2',
            'goods_sold_value' => 'decimal:2',
            'goods_bonus_value' => 'decimal:2',
            'goods_returned_value' => 'decimal:2',
            'goods_damaged_value' => 'decimal:2',
            'stock_variance_value' => 'decimal:2',
            'sales_total' => 'decimal:2',
            'returns_total' => 'decimal:2',
        ];
    }

    public function stockLines(): HasMany
    {
        return $this->hasMany(DayClosingStockLine::class);
    }

    public function rep(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rep_id');
    }

    public function vanWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'van_warehouse_id');
    }

    public function isFinal(): bool
    {
        return $this->status === 'approved';
    }
}
