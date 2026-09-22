<?php

namespace App\Modules\Integrations\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Integrations\Http\Requests\Admin\AddManualRateRequest;
use App\Modules\Integrations\Models\ExchangeRate;
use App\Modules\Integrations\Services\ExchangeRates;
use App\Modules\Integrations\Services\IntegrationManager;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class ExchangeRatesController extends Controller
{
    public function index(Request $request, ExchangeRates $service, IntegrationManager $manager): Response
    {
        $currencies = $service->currencies();
        $codes = array_column($currencies, 'code');
        $filters = [
            'base' => in_array(strtoupper((string) $request->query('base')), $codes, true) ? strtoupper((string) $request->query('base')) : null,
            'source' => in_array($request->query('source'), ['manual', 'provider'], true) ? $request->query('source') : null,
        ];

        $rates = ExchangeRate::query()
            ->with('enteredBy:id,name')
            ->when($filters['base'], fn ($q, $b) => $q->where('base_currency', $b))
            ->when($filters['source'] === 'manual', fn ($q) => $q->where(fn ($w) => $w->where('source', ExchangeRates::SOURCE_MANUAL)->orWhere('source', 'like', ExchangeRates::SOURCE_CORRECTION_PREFIX.'%')))
            ->when($filters['source'] === 'provider', fn ($q) => $q->where('source', 'like', 'provider:%'))
            ->latestFirst()
            ->paginate(25)
            ->withQueryString()
            ->through(fn (ExchangeRate $r) => [
                'id' => $r->id,
                'base_currency' => $r->base_currency,
                'quote_currency' => $r->quote_currency,
                'rate' => ExchangeRates::normalizeRate((string) $r->rate),
                'rate_raw' => (string) $r->rate,
                'source' => $r->source,
                'source_reference' => $r->source_reference,
                'rate_date' => $r->rate_date->toDateString(),
                'reason' => $r->reason,
                'entered_by' => $r->enteredBy?->name,
                'created_at' => $r->created_at?->toIso8601String(),
            ]);

        $provider = $manager->exchangeRate();

        return Inertia::render('admin/integrations/exchange-rates/index', [
            'baseCurrency' => $service->baseCurrency(),
            'currencies' => $currencies,
            'latest' => $service->latestPerCurrency(),
            'rates' => $rates,
            'filters' => $filters,
            'provider' => [
                'driver' => $manager->driverLabel('exchange_rate'),
                'configured' => $manager->isConfigured('exchange_rate'),
                'supports_sync' => $manager->isConfigured('exchange_rate') && $provider->supportsSync(),
            ],
            'canManage' => $request->user()->can('exchange_rates.manage'),
        ]);
    }

    public function store(AddManualRateRequest $request, ExchangeRates $service): RedirectResponse
    {
        Gate::authorize('exchange_rates.manage');
        $data = $request->validated();
        $correction = (bool) ($data['correction'] ?? false);
        $row = $service->addManualRate($data['base_currency'], $data['quote_currency'], $data['rate'], $data['rate_date'], $request->user(), $data['reason'], correction: $correction);
        $params = ['base' => $row->base_currency, 'quote' => $row->quote_currency, 'rate' => ExchangeRates::normalizeRate((string) $row->rate), 'date' => $row->rate_date->toDateString()];

        return back()->with('success', __($correction ? 'integrations.messages.rate_corrected' : 'integrations.messages.rate_added', $params));
    }

    public function sync(Request $request, ExchangeRates $service): RedirectResponse
    {
        Gate::authorize('exchange_rates.manage');
        $summary = $service->sync(actor: $request->user());

        return back()->with($summary['failed'] > 0 ? 'warning' : 'success', __('integrations.messages.sync_completed', ['inserted' => $summary['inserted'], 'skipped' => $summary['skipped'], 'failed' => $summary['failed']]));
    }
}
