<?php

namespace App\Modules\System\Models;

use Illuminate\Database\Eloquent\Model;

class SystemSetting extends Model
{
    protected $table = 'system_settings';

    protected $guarded = [];

    protected function casts(): array
    {
        return ['value' => 'json', 'is_public' => 'bool', 'is_sensitive' => 'bool'];
    }
}
