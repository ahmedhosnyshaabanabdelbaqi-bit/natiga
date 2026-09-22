<?php

namespace App\Modules\Integrations\Drivers\Map;

use App\Modules\Integrations\Contracts\Data\GeoResult;
use App\Modules\Integrations\Contracts\Data\HealthResult;
use App\Modules\Integrations\Contracts\MapProvider;
use App\Modules\Integrations\Drivers\Map\Concerns\ComputesGeometry;
use App\Modules\Integrations\Services\IntegrationCall;
use App\Modules\System\Services\Settings;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Sleep;
use Throwable;

/**
 * OpenStreetMap tiles + Nominatim geocoding. Nominatim usage policy: identify the application
 * (User-Agent / Referer), at most 1 request per second, cache results. Failures never throw:
 * callers get null and the UI falls back to manual pin placement / list view.
 */
final class OsmMapProvider implements MapProvider
{
    use ComputesGeometry;

    /** Default public endpoint; override with MAP_NOMINATIM_URL (config ev.integrations.map.nominatim_url) for a self-hosted instance. */
    public const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

    private const RATE_KEY = 'integrations:map:osm:nominatim';

    private const CACHE_PREFIX = 'integrations:map:osm:';

    private const CACHE_FOUND_SECONDS = 86400;   // 24h

    private const CACHE_NOT_FOUND_SECONDS = 3600; // 1h

    /** Set by request() when the last call failed (so the null result is not cached). */
    private bool $lastFailed = false;

    public function key(): string
    {
        return 'map';
    }

    public function driver(): string
    {
        return 'osm';
    }

    public function isConfigured(): bool
    {
        return true; // no key needed; the tile URL and Nominatim are public
    }

    public function healthCheck(): HealthResult
    {
        try {
            if (! $this->acquireSlot()) {
                return HealthResult::degraded(__('integrations.map.rate_limited'));
            }
            $response = IntegrationCall::run('map', 'health_check', fn () => $this->http(timeout: 5)->get($this->baseUrl().'/status', ['format' => 'json']));
            if ($response->successful() && (int) ($response->json('status') ?? -1) === 0) {
                return HealthResult::operational(__('integrations.map.nominatim_ok'), ['tile_url' => $this->tileUrl(), 'nominatim_host' => parse_url($this->baseUrl(), PHP_URL_HOST)]);
            }

            return HealthResult::degraded(__('integrations.map.nominatim_error', ['status' => $response->status()]), ['http_status' => $response->status()]);
        } catch (Throwable $e) {
            return HealthResult::unavailable(__('integrations.map.nominatim_unreachable'), ['error' => class_basename($e)]);
        }
    }

    public function geocode(string $address, ?string $countryCode = 'EG'): ?GeoResult
    {
        $normalized = self::normalizeAddress($address);
        if ($normalized === '') {
            return null;
        }
        $country = $countryCode ? strtolower(trim($countryCode)) : null;
        // The display name depends on accept-language, so the locale is part of the cache key.
        $cacheKey = self::CACHE_PREFIX.'geocode:'.app()->getLocale().':'.($country ?? '*').':'.hash('sha256', $normalized);

        return $this->cached($cacheKey, function () use ($normalized, $country): ?GeoResult {
            $query = ['q' => $normalized, 'format' => 'jsonv2', 'limit' => 1, 'addressdetails' => 1, 'accept-language' => app()->getLocale()];
            if ($country) {
                $query['countrycodes'] = $country;
            }
            $response = $this->request('geocode', '/search', $query, ['address_length' => mb_strlen($normalized), 'country' => $country]);
            if (! $response instanceof Response) {
                return null;
            }
            $first = $response->json('0');

            return is_array($first) ? $this->toGeoResult($first) : null;
        });
    }

    public function reverseGeocode(float $lat, float $lng): ?GeoResult
    {
        $lat = round($lat, 6);
        $lng = round($lng, 6);
        $cacheKey = self::CACHE_PREFIX.'reverse:'.app()->getLocale().':'.number_format($lat, 5, '.', '').','.number_format($lng, 5, '.', '');

        return $this->cached($cacheKey, function () use ($lat, $lng): ?GeoResult {
            $response = $this->request('reverse_geocode', '/reverse', ['lat' => $lat, 'lon' => $lng, 'format' => 'jsonv2', 'addressdetails' => 1, 'accept-language' => app()->getLocale()], ['lat' => $lat, 'lng' => $lng]);
            if (! $response instanceof Response) {
                return null;
            }
            $data = $response->json();

            return is_array($data) && isset($data['lat'], $data['lon']) ? $this->toGeoResult($data) : null;
        });
    }

    public function publicConfig(): array
    {
        return [
            'provider' => 'osm',
            'tile_url' => $this->tileUrl(),
            'public_key' => null, // OSM tiles need no key; MAP_SERVER_KEY is never exposed
            'attribution' => '© OpenStreetMap contributors',
            'default' => ['lat' => (float) config('ev.map.default_lat'), 'lng' => (float) config('ev.map.default_lng'), 'zoom' => (int) config('ev.map.default_zoom')],
        ];
    }

    public static function normalizeAddress(string $address): string
    {
        $address = preg_replace('/\s+/u', ' ', trim($address)) ?? trim($address);

        return mb_strtolower($address);
    }

    /**
     * One Nominatim call, guarded by the rate limiter, wrapped in IntegrationCall (timing + logging).
     * Returns the successful response, or null for any failure (already logged).
     */
    private function request(string $operation, string $path, array $query, array $meta): ?Response
    {
        if (! $this->acquireSlot()) {
            Log::warning('integrations.map.rate_limited', ['operation' => $operation]);
            $this->lastFailed = true;

            return null;
        }
        try {
            $response = IntegrationCall::run('map', $operation, fn () => $this->http()->get($this->baseUrl().$path, $query), meta: $meta + ['driver' => 'osm']);
            if ($response->successful()) {
                return $response;
            }
            $this->lastFailed = true;

            return null;
        } catch (Throwable) {
            $this->lastFailed = true;

            return null; // graceful: IntegrationCall already recorded the failure
        }
    }

    /**
     * One retry on connection errors / 5xx / 429, spaced by at least one rate-limit interval: the retry
     * does not take a limiter slot, so a faster retry would break the "max N requests per second"
     * usage policy (and retrying a 429 quickly is what gets a client blocked).
     */
    private function http(int $timeout = 10, int $connectTimeout = 5)
    {
        $retryAfterMs = (int) ceil(1000 / $this->ratePerSecond()) + 100;

        return IntegrationCall::http('map', $timeout, $connectTimeout, retries: 1, backoffMs: [$retryAfterMs])
            ->withHeaders(['Referer' => (string) config('app.url')])
            ->withUserAgent($this->userAgent());
    }

    private function userAgent(): string
    {
        $contact = Settings::get('general.contact_email') ?: config('mail.from.address');

        return sprintf('EVCommunityEgypt/1.0 (+%s; %s)', config('app.url'), $contact ?: 'contact-not-set');
    }

    /** Nominatim base URL from config (no trailing slash); falls back to the public instance. */
    private function baseUrl(): string
    {
        $url = rtrim(trim((string) config('ev.integrations.map.nominatim_url', self::NOMINATIM_URL)), '/');

        return $url !== '' ? $url : self::NOMINATIM_URL;
    }

    private function tileUrl(): string
    {
        return (string) config('ev.map.tile_url', 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
    }

    /**
     * Nominatim allows one request per second. Wait once for the next slot, then give up (null).
     */
    private function ratePerSecond(): int
    {
        return max(1, (int) config('ev.integrations.map.nominatim_rate_per_second', 1));
    }

    private function acquireSlot(): bool
    {
        $perSecond = $this->ratePerSecond();
        for ($attempt = 0; $attempt < 2; $attempt++) {
            if (! RateLimiter::tooManyAttempts(self::RATE_KEY, $perSecond)) {
                RateLimiter::hit(self::RATE_KEY, 1);

                return true;
            }
            if ($attempt === 0) {
                Sleep::usleep(1_050_000);
            }
        }

        return false;
    }

    /** @param  \Closure(): ?GeoResult  $resolver */
    private function cached(string $cacheKey, \Closure $resolver): ?GeoResult
    {
        $hit = Cache::get($cacheKey);
        if (is_array($hit)) {
            return ($hit['found'] ?? false) ? self::fromCache($hit['result']) : null;
        }
        // Failures are not cached: request() flags them via `$this->lastFailed`.
        $this->lastFailed = false;
        $result = $resolver();
        if ($result instanceof GeoResult) {
            Cache::put($cacheKey, ['found' => true, 'result' => $result->toArray() + ['raw' => $result->raw]], self::CACHE_FOUND_SECONDS);
        } elseif (! $this->lastFailed) {
            Cache::put($cacheKey, ['found' => false], self::CACHE_NOT_FOUND_SECONDS);
        }

        return $result;
    }

    private function toGeoResult(array $row): ?GeoResult
    {
        if (! isset($row['lat'], $row['lon'])) {
            return null;
        }
        $address = is_array($row['address'] ?? null) ? $row['address'] : [];

        return new GeoResult(
            lat: (float) $row['lat'],
            lng: (float) $row['lon'],
            displayName: isset($row['display_name']) ? (string) $row['display_name'] : null,
            countryCode: isset($address['country_code']) ? strtoupper((string) $address['country_code']) : null,
            city: $address['city'] ?? $address['town'] ?? $address['village'] ?? $address['state'] ?? null,
            source: 'osm',
            raw: array_intersect_key($row, array_flip(['osm_id', 'osm_type', 'class', 'type', 'importance', 'place_id'])),
        );
    }

    private static function fromCache(array $data): GeoResult
    {
        return new GeoResult((float) $data['lat'], (float) $data['lng'], $data['display_name'] ?? null, $data['country_code'] ?? null, $data['city'] ?? null, $data['source'] ?? 'osm', $data['raw'] ?? []);
    }
}
