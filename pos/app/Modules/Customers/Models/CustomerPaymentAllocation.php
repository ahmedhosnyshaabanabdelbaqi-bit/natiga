<?php

declare(strict_types=1);

namespace App\Modules\Customers\Models;

use App\Modules\Sales\Models\Sale;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 */
class CustomerPaymentAllocation extends Model
{
    protected $table = 'customer_payment_allocations';

    protected $guarded = ['id'];

    public function payment(): BelongsTo
    {
        return $this->belongsTo(CustomerPayment::class, 'customer_payment_id');
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class, 'sale_id');
    }
}
