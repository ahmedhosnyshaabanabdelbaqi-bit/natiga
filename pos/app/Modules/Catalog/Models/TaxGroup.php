<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 */
class TaxGroup extends Model
{
    protected $table = 'tax_groups';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'is_inclusive' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
