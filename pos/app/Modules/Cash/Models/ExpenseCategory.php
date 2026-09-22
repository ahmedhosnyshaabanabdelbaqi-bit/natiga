<?php

declare(strict_types=1);

namespace App\Modules\Cash\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 */
class ExpenseCategory extends Model
{
    protected $table = 'expense_categories';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }
}
