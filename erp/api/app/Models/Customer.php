<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Customer extends BaseModel
{
    use SoftDeletes;

    protected $table = 'customers';

    protected function casts(): array
    {
        return [
            'discount_pct' => 'decimal:4',
            'credit_limit' => 'decimal:2',
            'opening_balance' => 'decimal:2',
            'credit_hold' => 'boolean',
            'is_cash_only' => 'boolean',
            'is_active' => 'boolean',
            'visit_days' => 'array',
            'opened_at' => 'date',
        ];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Customer::class, 'parent_id');
    }

    public function region(): BelongsTo
    {
        return $this->belongsTo(Region::class);
    }

    public function route(): BelongsTo
    {
        return $this->belongsTo(Route::class);
    }

    public function priceList(): BelongsTo
    {
        return $this->belongsTo(PriceList::class);
    }

    public function addresses(): HasMany
    {
        return $this->hasMany(CustomerAddress::class);
    }

    public function contacts(): HasMany
    {
        return $this->hasMany(CustomerContact::class);
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(CustomerAssignment::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(SalesInvoice::class);
    }

    /**
     * The rep who owned this customer on a given date.
     *
     * Reporting uses this rather than the current assignment, so reassigning a
     * customer never moves last quarter's sales to the new rep.
     */
    public function repOn(\DateTimeInterface|string $date): ?int
    {
        $date = $date instanceof \DateTimeInterface ? $date->format('Y-m-d') : $date;

        return $this->assignments()
            ->where('from_date', '<=', $date)
            ->where(fn ($q) => $q->whereNull('to_date')->orWhere('to_date', '>=', $date))
            ->orderByDesc('from_date')
            ->value('rep_id');
    }

    public function currentRepId(): ?int
    {
        return $this->repOn(now());
    }
}
