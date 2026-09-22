<?php

declare(strict_types=1);

namespace App\Modules\Sales\Models;

use App\Models\User;
use App\Modules\Cash\Models\Shift;
use App\Modules\Core\Models\Branch;
use App\Modules\Core\Models\Terminal;
use App\Modules\Core\Models\Warehouse;
use App\Modules\Customers\Models\Customer;
use App\Modules\Customers\Models\CustomerPaymentAllocation;
use App\Support\Money;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sale extends Model
{
    public const STATUS_COMPLETED = 'completed';

    public const STATUS_VOIDED = 'voided';

    public const ORIGIN_ONLINE = 'online';

    public const ORIGIN_OFFLINE = 'offline';

    protected $table = 'sales';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'sold_at' => 'datetime',
            'business_date' => 'date',
            'due_date' => 'date',
            'client_created_at' => 'datetime',
            'synced_at' => 'datetime',
            'is_credit' => 'boolean',
            'tax_inclusive' => 'boolean',
            'meta' => 'array',
        ];
    }

    public function lines(): HasMany
    {
        return $this->hasMany(SaleLine::class, 'sale_id')->orderBy('line_no');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(SalePayment::class, 'sale_id');
    }

    public function returns(): HasMany
    {
        return $this->hasMany(SaleReturn::class, 'sale_id');
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'branch_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'warehouse_id');
    }

    public function terminal(): BelongsTo
    {
        return $this->belongsTo(Terminal::class, 'terminal_id');
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class, 'shift_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    public function cashier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function grandTotal(): Money
    {
        return Money::of($this->grand_total);
    }

    /** Amount still owed on a credit invoice, after collections and returns. */
    public function outstanding(): Money
    {
        return Money::of($this->due_total)
            ->minus(Money::of($this->allocations()->sum('amount')))
            ->minus(Money::of($this->returns()->sum('credit_applied')));
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(CustomerPaymentAllocation::class, 'sale_id');
    }

    public function isOffline(): bool
    {
        return $this->origin === self::ORIGIN_OFFLINE;
    }

    /** An offline invoice is not a confirmed document until it has synced. */
    public function isProvisional(): bool
    {
        return $this->isOffline() && $this->synced_at === null;
    }

    public function scopeCompleted(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_COMPLETED);
    }

    public function scopeForBusinessDay(Builder $query, string $from, ?string $to = null): Builder
    {
        return $query->whereBetween('business_date', [$from, $to ?? $from]);
    }
}
