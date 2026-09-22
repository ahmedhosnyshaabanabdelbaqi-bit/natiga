<?php

declare(strict_types=1);

namespace App\Modules\Cash\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 */
class PaymentMethod extends Model
{
    protected $table = 'payment_methods';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'affects_drawer' => 'boolean',
            'allows_change' => 'boolean',
            'requires_reference' => 'boolean',
            'allowed_offline' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function cashAccount(): BelongsTo
    {
        return $this->belongsTo(CashAccount::class, 'cash_account_id');
    }
}
