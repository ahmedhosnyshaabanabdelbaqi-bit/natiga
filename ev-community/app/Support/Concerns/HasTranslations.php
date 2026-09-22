<?php

namespace App\Support\Concerns;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;

/**
 * Translation-table pattern: `<table>_translations` rows with `locale` + text columns.
 *
 * Models declare:
 *   protected string $translationModel = ProductTranslation::class;
 *   protected array $translatedAttributes = ['name', 'description'];
 *
 * Usage: $product->tr('name'), $product->tr('name', 'en'), $product->setTranslations(['ar' => [...], 'en' => [...]]).
 */
trait HasTranslations
{
    public function translations(): HasMany
    {
        return $this->hasMany($this->translationModel, $this->getForeignKey());
    }

    public function translation(?string $locale = null): ?object
    {
        $locale ??= app()->getLocale();
        $translations = $this->relationLoaded('translations') ? $this->translations : $this->translations()->get();
        $exact = $translations->firstWhere('locale', $locale);
        if ($exact) {
            return $exact;
        }
        $fallback = $translations->firstWhere('locale', config('app.fallback_locale'));

        return $fallback ?? $translations->first();
    }

    public function tr(string $attribute, ?string $locale = null): ?string
    {
        $row = $this->translation($locale);

        return $row?->{$attribute};
    }

    /**
     * @param  array<string, array<string, mixed>>  $data  ['ar' => ['name' => ...], 'en' => [...]]
     */
    public function setTranslations(array $data): static
    {
        foreach ($data as $locale => $attributes) {
            $attributes = array_intersect_key($attributes, array_flip($this->translatedAttributes));
            if ($attributes === []) {
                continue;
            }
            $this->translations()->updateOrCreate(['locale' => $locale], $attributes);
        }
        $this->unsetRelation('translations');

        return $this;
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public function translationsArray(): array
    {
        return $this->translations->mapWithKeys(fn ($t) => [$t->locale => collect($t->getAttributes())->only($this->translatedAttributes)->all()])->all();
    }

    public function scopeWhereTranslationLike($query, string $attribute, string $term)
    {
        return $query->whereHas('translations', fn ($q) => $q->where($attribute, 'ILIKE', '%'.$term.'%'));
    }

    public function scopeOrderByTranslation($query, string $attribute, string $direction = 'asc', ?string $locale = null)
    {
        $locale ??= app()->getLocale();
        $translationTable = (new $this->translationModel)->getTable();
        $fk = $this->getForeignKey();

        return $query->leftJoin($translationTable.' as _tr', fn ($join) => $join->on('_tr.'.$fk, '=', $this->getTable().'.id')->where('_tr.locale', $locale))
            ->orderBy('_tr.'.$attribute, $direction)
            ->select($this->getTable().'.*');
    }

    public static function translatedCollection(Collection $models, string $attribute): Collection
    {
        return $models->map(fn ($m) => $m->tr($attribute));
    }
}
