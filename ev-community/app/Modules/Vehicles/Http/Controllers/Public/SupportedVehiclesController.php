<?php

namespace App\Modules\Vehicles\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Modules\Vehicles\Services\VehicleDataService;
use Inertia\Inertia;
use Inertia\Response;

/** GET /{locale}/vehicles — public "supported vehicles" page (SEO). */
class SupportedVehiclesController extends Controller
{
    public function __invoke(VehicleDataService $data): Response
    {
        $payload = $data->forLocale(app()->getLocale());

        return Inertia::render('public/vehicles/index', [
            'makes' => array_map(fn (array $make) => [
                'id' => $make['id'],
                'slug' => $make['slug'],
                'name' => $make['name'],
                'logo' => $make['logo'],
                'models' => array_map(fn (array $model) => [
                    'id' => $model['id'],
                    'slug' => $model['slug'],
                    'name' => $model['name'],
                    'body_type' => $model['body_type'],
                    'variants_count' => count($model['variants']),
                    'years' => $this->yearSpan($model['variants']),
                ], $make['models']),
            ], $payload['makes']),
            'generatedAt' => $payload['generated_at'],
        ]);
    }

    /** @return array{from: int|null, to: int|null} */
    private function yearSpan(array $variants): array
    {
        $from = null;
        $to = null;
        $open = false;
        foreach ($variants as $variant) {
            $from = $from === null ? $variant['year_from'] : min($from, $variant['year_from']);
            if ($variant['year_to'] === null) {
                $open = true;
            } else {
                $to = $to === null ? $variant['year_to'] : max($to, $variant['year_to']);
            }
        }

        return ['from' => $from, 'to' => $open ? null : $to];
    }
}
