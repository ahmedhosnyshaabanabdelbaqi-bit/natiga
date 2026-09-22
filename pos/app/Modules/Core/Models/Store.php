<?php

declare(strict_types=1);

namespace App\Modules\Core\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 */
class Store extends Model
{
    protected $table = 'stores';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'setup_completed' => 'boolean',
            'setup_completed_at' => 'datetime',
            'social' => 'array',
        ];
    }
}
