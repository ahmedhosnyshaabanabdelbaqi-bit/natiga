<?php

namespace App\Modules\Vehicles\Services;

use App\Modules\Vehicles\Models\BatteryVariant;
use App\Modules\Vehicles\Models\ConnectorType;
use App\Modules\Vehicles\Models\Enums\MarketVersion;
use App\Modules\Vehicles\Models\VehicleMake;
use Illuminate\Support\Facades\Cache;

/**
 * Public, cached (1h) vehicle master data for the vehicle selector and search facets.
 */
final class VehicleDataService
{
    public const TTL_SECONDS = 3600;

    public const YEAR_MIN = 2008;

    public const YEAR_MAX = 2035;

    public function forLocale(string $locale): array
    {
        return Cache::remember(self::cacheKey($locale), self::TTL_SECONDS, fn () => $this->build($locale));
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

    private function build(string $locale): array
    {
        $makes = VehicleMake::query()->active()->ordered()
            ->with(['models' => fn ($q) => $q->active()->with(['variants' => fn ($v) => $v->active()])])
            ->get();

        return [
            'generated_at' => now()->toIso8601String(),
            'years' => ['min' => self::YEAR_MIN, 'max' => min(self::YEAR_MAX, (int) now()->year + 1)],
            'market_versions' => MarketVersion::options(),
            'connector_types' => ConnectorType::query()->active()->ordered()->get()
                ->map(fn (ConnectorType $c) => ['id' => $c->id, 'code' => $c->code, 'name' => $c->name($locale), 'current_type' => $c->current_type->value])->values()->all(),
            'battery_variants' => BatteryVariant::query()->orderBy('capacity_kwh')->get()
                ->map(fn (BatteryVariant $b) => ['id' => $b->id, 'name' => $b->name, 'capacity_kwh' => (string) $b->capacity_kwh, 'chemistry' => $b->chemistry])->values()->all(),
            'makes' => $makes->map(fn (VehicleMake $make) => [
                'id' => $make->id,
                'slug' => $make->slug,
                'name' => $make->name($locale),
                'logo' => $make->logoUrl(),
                'models' => $make->models->map(fn ($model) => [
                    'id' => $model->id,
                    'slug' => $model->slug,
                    'name' => $model->name($locale),
                    'body_type' => $model->body_type,
                    'variants' => $model->variants->map(fn ($variant) => [
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
                    ])->values()->all(),
                ])->values()->all(),
            ])->values()->all(),
        ];
    }
}
