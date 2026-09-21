<?php

namespace App\Models;

use App\Domain\Support\Num;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class JournalEntry extends BaseModel
{
    protected $table = 'journal_entries';

    protected function casts(): array
    {
        return [
            'entry_date' => 'date',
            'posted_at' => 'datetime',
            'total_debit' => 'decimal:2',
            'total_credit' => 'decimal:2',
        ];
    }

    public function lines(): HasMany
    {
        return $this->hasMany(JournalLine::class);
    }

    public function fiscalPeriod(): BelongsTo
    {
        return $this->belongsTo(FiscalPeriod::class);
    }

    public function reversalOf(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'reversal_of_id');
    }

    public function reversedBy(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'reversed_by_id');
    }

    /** A reversed entry is still on the books; it is simply offset by its mirror. */
    public function isReversed(): bool
    {
        return $this->reversed_by_id !== null;
    }

    public function isBalanced(): bool
    {
        return Num::cmp($this->total_debit, $this->total_credit, Num::MONEY_SCALE) === 0;
    }
}
