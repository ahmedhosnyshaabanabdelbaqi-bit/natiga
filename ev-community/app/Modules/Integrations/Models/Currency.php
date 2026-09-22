<?php

namespace App\Modules\Integrations\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Master currency list (seeded). Read-only from this module.
 *
 * @property string $code
 * @property string $name_ar
 * @property string $name_en
 * @property bool $is_base
 * @property bool $is_active
 */
class Currency extends Model
{
    protected $table = 'currencies';

    protected $primaryKey = 'code';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected function casts(): array
    {
        return ['is_base' => 'bool', 'is_active' => 'bool', 'minor_units' => 'int'];
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function name(?string $locale = null): string
    {
        return ($locale ?? app()->getLocale()) === 'ar' ? $this->name_ar : $this->name_en;
    }
}
