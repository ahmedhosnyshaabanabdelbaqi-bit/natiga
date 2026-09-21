<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RfqQuote extends \Illuminate\Database\Eloquent\Model
{
    protected $guarded = ['id'];

    protected $table = 'rfq_quotes';

    protected function casts(): array
    {
        return [
            'unit_price' => 'decimal:4',
            'is_selected' => 'boolean',
        ];
    }

    public function rfq(): BelongsTo
    {
        return $this->belongsTo(Rfq::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function line(): BelongsTo
    {
        return $this->belongsTo(RfqLine::class, 'rfq_line_id');
    }

}