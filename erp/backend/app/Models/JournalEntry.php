<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;


class JournalEntry extends Model
{
    protected $table = 'journal_entries';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'entry_date' => 'date',
            'doc_date' => 'date',
            'posted_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'branch_id');
    }

    public function fiscalPeriod(): BelongsTo
    {
        return $this->belongsTo(FiscalPeriod::class, 'fiscal_period_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function reversesEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'reverses_entry_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(JournalLine::class, 'journal_entry_id');
    }
}
