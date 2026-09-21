<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RfqLine extends \Illuminate\Database\Eloquent\Model
{
    protected $guarded = ['id'];

    protected $table = 'rfq_lines';

    protected function casts(): array
    {
        return [
            'qty_input' => 'decimal:4',
            'qty_base' => 'decimal:4',
        ];
    }

    public function rfq(): BelongsTo
    {
        return $this->belongsTo(Rfq::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

}