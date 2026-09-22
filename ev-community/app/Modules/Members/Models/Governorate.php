<?php

namespace App\Modules\Members\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Read model over the core `governorates` table (seeded master data, no timestamps).
 *
 * @property int $id
 * @property string $code
 * @property string $name_ar
 * @property string $name_en
 * @property bool $is_active
 */
class Governorate extends Model
{
    public $timestamps = false;

    protected $table = 'governorates';

    protected $guarded = [];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true)->orderBy('sort_order');
    }

    public function name(?string $locale = null): string
    {
        $locale ??= app()->getLocale();
        $value = $locale === 'ar' ? $this->name_ar : $this->name_en;

        return $value ?: ($this->name_en ?: $this->name_ar);
    }

    /** @return array<int, array{id: int, name: string}> */
    public static function optionsFor(?string $locale = null): array
    {
        return self::query()->active()->get()->map(fn (self $g) => ['id' => $g->id, 'name' => $g->name($locale)])->values()->all();
    }
}
