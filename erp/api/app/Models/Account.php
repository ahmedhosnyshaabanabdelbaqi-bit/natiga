<?php

namespace App\Models;

use App\Domain\Support\Num;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Account extends BaseModel
{
    protected $table = 'accounts';

    /** Account types whose natural balance is a debit. */
    public const DEBIT_TYPES = ['asset', 'expense'];

    protected function casts(): array
    {
        return [
            'is_postable' => 'boolean',
            'is_active' => 'boolean',
            'requires_cost_center' => 'boolean',
        ];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Account::class, 'parent_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(JournalLine::class);
    }

    public function isDebitNatured(): bool
    {
        return in_array($this->type, self::DEBIT_TYPES, true);
    }

    /** Signed balance in the account's natural direction. */
    public function balance(?string $from = null, ?string $to = null): string
    {
        $q = JournalLine::query()
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_lines.journal_entry_id')
            ->where('journal_lines.account_id', $this->id)
            ->where('journal_entries.status', 'posted');

        if ($from) {
            $q->where('journal_entries.entry_date', '>=', $from);
        }
        if ($to) {
            $q->where('journal_entries.entry_date', '<=', $to);
        }

        $row = $q->selectRaw('COALESCE(SUM(journal_lines.debit),0) AS d, COALESCE(SUM(journal_lines.credit),0) AS c')->first();

        return $this->isDebitNatured()
            ? Num::sub($row->d, $row->c, Num::MONEY_SCALE)
            : Num::sub($row->c, $row->d, Num::MONEY_SCALE);
    }
}
