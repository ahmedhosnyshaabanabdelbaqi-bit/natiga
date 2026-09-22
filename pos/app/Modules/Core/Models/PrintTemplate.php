<?php

declare(strict_types=1);

namespace App\Modules\Core\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 */
class PrintTemplate extends Model
{
    protected $table = 'print_templates';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
            'options' => 'array',
        ];
    }
}
