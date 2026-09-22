<?php

declare(strict_types=1);

namespace App\Modules\Core\Services;

use App\Modules\Core\Models\Setting;
use App\Modules\Core\Models\Store;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;

/**
 * Runtime settings resolver.
 *
 * Resolution order (most specific wins):
 *   terminal -> branch -> global -> config/pos.php default
 *
 * Turning a feature off only hides UI and relaxes validation; it never deletes
 * the data captured while the feature was on, so a shop can switch its activity
 * profile back and forth without losing variants, batches or serials.
 */
class SettingsService
{
    private const CACHE_KEY = 'pos.settings.all';

    /** @var array<string,array<string,mixed>>|null */
    private ?array $loaded = null;

    public function get(string $key, mixed $default = null, ?int $branchId = null, ?int $terminalId = null): mixed
    {
        $all = $this->all();

        foreach ([
            $terminalId ? "terminal:$terminalId" : null,
            $branchId ? "branch:$branchId" : null,
            'global:',
        ] as $scope) {
            if ($scope !== null && array_key_exists($scope, $all) && array_key_exists($key, $all[$scope])) {
                return $all[$scope][$key];
            }
        }

        return $default ?? config('pos.'.$key);
    }

    public function set(string $key, mixed $value, string $scope = 'global', ?int $scopeId = null): void
    {
        Setting::query()->updateOrCreate(
            ['key' => $key, 'scope' => $scope, 'scope_id' => $scopeId],
            ['value' => ['v' => $value]],
        );

        $this->flush();
    }

    /** @param array<string,mixed> $values */
    public function setMany(array $values, string $scope = 'global', ?int $scopeId = null): void
    {
        foreach ($values as $key => $value) {
            Setting::query()->updateOrCreate(
                ['key' => $key, 'scope' => $scope, 'scope_id' => $scopeId],
                ['value' => ['v' => $value]],
            );
        }

        $this->flush();
    }

    public function feature(string $name, ?int $branchId = null, ?int $terminalId = null): bool
    {
        return (bool) $this->get("features.$name", config("pos.features.$name", false), $branchId, $terminalId);
    }

    /** @return array<string,bool> */
    public function features(?int $branchId = null): array
    {
        $features = config('pos.features', []);
        foreach (array_keys($features) as $name) {
            $features[$name] = $this->feature($name, $branchId);
        }

        return $features;
    }

    /**
     * Apply an activity profile (grocery, clothing, mobiles, ...). Only the
     * flags the profile mentions are switched on; everything else keeps its
     * current value so a re-run never silently disables a feature in use.
     */
    public function applyProfile(string $profile): void
    {
        $definition = config("pos.profiles.$profile");
        if (! $definition) {
            return;
        }

        $features = config('pos.features', []);
        foreach (Arr::get($definition, 'features', []) as $flag => $enabled) {
            $features[$flag] = $enabled;
        }

        $values = [];
        foreach ($features as $flag => $enabled) {
            $values["features.$flag"] = (bool) $enabled;
        }
        $values['pos_layout'] = Arr::get($definition, 'pos_layout', 'barcode_first');

        $this->setMany($values);

        Store::query()->first()?->update(['business_profile' => $profile]);
    }

    private ?Store $store = null;

    /**
     * The establishment row. Held per request rather than in the shared cache:
     * serialising an Eloquent model into a cross-process cache is fragile, and
     * this is a single indexed row.
     */
    public function store(): ?Store
    {
        return $this->store ??= Store::query()->first();
    }

    public function currency(): string
    {
        return (string) ($this->store()?->currency ?? config('pos.currency.code'));
    }

    public function timezone(): string
    {
        return (string) ($this->store()?->timezone ?? config('pos.timezone'));
    }

    /** @return array<string,array<string,mixed>> */
    public function all(): array
    {
        if ($this->loaded !== null) {
            return $this->loaded;
        }

        $this->loaded = Cache::remember(self::CACHE_KEY, 300, function (): array {
            $out = [];
            foreach (Setting::query()->get(['key', 'scope', 'scope_id', 'value']) as $row) {
                $scopeKey = $row->scope.':'.($row->scope === 'global' ? '' : $row->scope_id);
                $out[$scopeKey][$row->key] = is_array($row->value) && array_key_exists('v', $row->value)
                    ? $row->value['v']
                    : $row->value;
            }

            return $out;
        });

        return $this->loaded;
    }

    public function flush(): void
    {
        $this->loaded = null;
        $this->store = null;
        Cache::forget(self::CACHE_KEY);
    }
}
