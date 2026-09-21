<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;


class ChequeEvent extends Model
{
    protected $table = 'cheque_events';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'event_date' => 'date',
        ];
    }

    public function cheque(): BelongsTo
    {
        return $this->belongsTo(Cheque::class, 'cheque_id');
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'journal_entry_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
