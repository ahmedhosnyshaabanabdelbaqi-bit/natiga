<?php

declare(strict_types=1);

namespace App\Modules\Sales\Models;

use App\Modules\Catalog\Models\Serial;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 */
class SaleLineSerial extends Model
{
    protected $table = 'sale_line_serials';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'returned' => 'boolean',
        ];
    }

    public function line(): BelongsTo
    {
        return $this->belongsTo(SaleLine::class, 'sale_line_id');
    }

    public function serialRecord(): BelongsTo
    {
        return $this->belongsTo(Serial::class, 'serial_id');
    }
}
