<?php

namespace App\Modules\Vehicles\Services;

use App\Modules\Vehicles\Models\BatteryVariant;
use App\Modules\Vehicles\Models\ConnectorType;
use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Models\VehicleMake;
use App\Modules\Vehicles\Models\VehicleModel;
use App\Modules\Vehicles\Models\VehicleVariant;
use Illuminate\Support\Facades\Cache;

/**
 * Vehicle master data for the vehicle selector, the garage wizard and search facets.
 *
 *  - forLocale(): public, ACTIVE records only, localized, cached 1 h per locale (flushed on every
 *    master-data change by VehicleMasterService).
 *  - catalog(..., includeInactive: true): uncached admin variant (staff corrections may need an
 *    inactive make/model).
 */
final class VehicleDataService
{
    public const TTL_SECONDS = 3600;

    public const YEAR_MIN = 2008;

    public const YEAR_MAX = 2035;

    public function forLocale(string $locale): array
    {
        return Cache::remember(self::cacheKey($locale), self::TTL_SECONDS, fn () => $this->catalog($locale));
    }

    public function flush(): void
    {
        foreach (ev_locales() as $locale) {
            Cache::forget(self::cacheKey($locale));
        }
    }

    public static function cacheKey(string $locale): string
    {
        return 'vehicles.public_data.v1.'.$locale;
    }

    /** Latest selectable model year (next year's models are sold from autumn). */
    public static function maxYear(): int
    {
        return min(self::YEAR_MAX, (int) now()->year + 1);
    }

    public function catalog(string $locale, bool $includeInactive = false): array
    {
        $makes = VehicleMake::query()
            ->when(! $includeInactive, fn ($q) => $q->active())
            ->ordered()
            ->with(['models' => fn ($q) => $q->when(! $includeInactive, fn ($m) => $m->active())
                ->with(['variants' => fn ($v) => $v->when(! $includeInactive, fn ($w) => $w->active())])])
            ->get();

        return [
            'generated_at' => now()->toIso8601String(),
            'years' => ['min' => self::YEAR_MIN, 'max' => self::maxYear()],
            'market_versions' => array_map(
                fn (MarketVersion $m) => ['value' => $m->value, 'label' => __('vehicles.market_version.'.$m->value, [], $locale)],
                MarketVersion::cases(),
            ),
            'connector_types' => ConnectorType::query()->when(! $includeInactive, fn ($q) => $q->active())->ordered()->get()
                ->map(fn (ConnectorType $c) => ['id' => $c->id, 'code' => $c->code, 'name' => $c->name($locale), 'current_type' => $c->current_type->value])->values()->all(),
            'battery_variants' => BatteryVariant::query()->orderBy('capacity_kwh')->orderBy('name')->get()
                ->map(fn (BatteryVariant $b) => ['id' => $b->id, 'name' => $b->name, 'capacity_kwh' => (string) $b->capacity_kwh, 'chemistry' => $b->chemistry])->values()->all(),
            'makes' => $makes->map(fn (VehicleMake $make) => [
                'id' => $make->id,
                'slug' => $make->slug,
                'name' => $make->name($locale),
                'logo' => $make->logoUrl(),
                'is_active' => $make->is_active,
                'models' => $make->models->map(fn (VehicleModel $model) => [
                    'id' => $model->id,
                    'slug' => $model->slug,
                    'name' => $model->name($locale),
                    'body_type' => $model->body_type,
                    'is_active' => $model->is_active,
                    'variants' => $model->variants->map(fn (VehicleVariant $variant) => [
                        'id' => $variant->id,
                        'name' => $variant->name($locale),
                        'trim' => $variant->trim,
                        'market_version' => $variant->market_version->value,
                        'year_from' => $variant->year_from,
                        'year_to' => $variant->year_to,
                        'battery_variant_id' => $variant->battery_variant_id,
                        'battery_capacity_kwh' => $variant->battery_capacity_kwh !== null ? (string) $variant->battery_capacity_kwh : null,
                        'ac_connector_type_id' => $variant->ac_connector_type_id,
                        'dc_connector_type_id' => $variant->dc_connector_type_id,
                        'is_active' => $variant->is_active,
                    ])->values()->all(),
                ])->values()->all(),
            ])->values()->all(),
        ];
    }
}
