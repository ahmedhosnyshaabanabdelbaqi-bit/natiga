<?php

declare(strict_types=1);

namespace App\Modules\Sales\Models;

use App\Modules\Catalog\Models\Serial;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 */
class SaleReturnLineSerial extends Model
{
    protected $table = 'sale_return_line_serials';

    protected $guarded = ['id'];

    public function serialRecord(): BelongsTo
    {
        return $this->belongsTo(Serial::class, 'serial_id');
    }
}
