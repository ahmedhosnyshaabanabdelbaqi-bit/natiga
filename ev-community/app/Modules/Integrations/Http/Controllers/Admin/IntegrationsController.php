<?php

namespace App\Modules\Integrations\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Integrations\Http\Requests\Admin\GeocodeTestRequest;
use App\Modules\Integrations\Jobs\SendTestEmailJob;
use App\Modules\Integrations\Models\Enums\WebhookEventStatus;
use App\Modules\Integrations\Models\IntegrationEvent;
use App\Modules\Integrations\Models\WebhookEvent;
use App\Modules\Integrations\Services\IntegrationManager;
use App\Modules\Integrations\Support\Sanitizer;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class IntegrationsController extends Controller
{
    private const GEOCODE_SESSION_KEY = 'integrations.geocode_result';

    public function index(Request $request, IntegrationManager $manager): Response
    {
        $user = $request->user();
        $webhookCounts = WebhookEvent::query()->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        return Inertia::render('admin/integrations/index', [
            'matrix' => $manager->matrix(),
            'recentEvents' => IntegrationEvent::query()->orderByDesc('id')->limit(25)->get()->map(fn (IntegrationEvent $e) => [
                'id' => $e->id,
                'provider' => $e->provider,
                'direction' => $e->direction,
                'operation' => $e->operation,
                'reference' => $e->reference,
                'status' => $e->status->value,
                'duration_ms' => $e->duration_ms,
                'error' => Sanitizer::truncate($e->error, 160),
                'created_at' => $e->created_at?->toIso8601String(),
            ])->all(),
            'webhookSummary' => collect(WebhookEventStatus::values())->mapWithKeys(fn (string $s) => [$s => (int) ($webhookCounts[$s] ?? 0)])->all(),
            'email' => [
                'configured' => $manager->isConfigured('email'),
                'mailer' => $manager->configuredDriverName('email'),
                'to' => $user->email,
            ],
            'map' => [
                'configured' => $manager->isConfigured('map'),
                'driver' => $manager->configuredDriverName('map'),
            ],
            'geocodeResult' => $request->session()->get(self::GEOCODE_SESSION_KEY),
            'canManage' => $user->can('integrations.manage'),
        ]);
    }

    public function check(Request $request, string $key, IntegrationManager $manager): RedirectResponse
    {
        Gate::authorize('integrations.manage');
        if ($key === 'all') {
            $results = $manager->checkAll();
            $problems = collect($results)->filter(fn ($r) => $r->status->isProblem())->keys()->map(fn ($k) => __('integrations.categories.'.$k))->all();

            return back()->with($problems === [] ? 'success' : 'warning', $problems === []
                ? __('integrations.messages.all_checks_completed', ['count' => count($results)])
                : __('integrations.messages.all_checks_with_problems', ['count' => count($results), 'problems' => implode(app()->getLocale() === 'ar' ? '، ' : ', ', $problems)]));
        }
        abort_unless(in_array($key, IntegrationManager::CATEGORIES, true), 404);
        $result = $manager->check($key);
        $message = __('integrations.messages.check_completed', ['integration' => __('integrations.categories.'.$key), 'status' => $result->status->label()]).($result->message ? ' — '.$result->message : '');

        return back()->with($result->status->isProblem() ? 'warning' : 'success', $message);
    }

    public function sendTestEmail(Request $request, IntegrationManager $manager): RedirectResponse
    {
        Gate::authorize('integrations.manage');
        $user = $request->user();
        if (! $manager->isConfigured('email')) {
            return back()->with('warning', __('integrations.messages.test_email_not_configured', ['mailer' => $manager->configuredDriverName('email')]));
        }
        SendTestEmailJob::dispatch($user->id);

        return back()->with('success', __('integrations.messages.test_email_queued', ['email' => $user->email]));
    }

    public function geocodeTest(GeocodeTestRequest $request, IntegrationManager $manager): RedirectResponse
    {
        Gate::authorize('integrations.manage');
        $address = (string) $request->validated('address');
        if (! $manager->isConfigured('map')) {
            return back()->with('warning', __('integrations.messages.map_not_configured'));
        }
        $map = $manager->map();
        $result = $map->geocode($address, 'EG');
        $request->session()->flash(self::GEOCODE_SESSION_KEY, [
            'address' => $address,
            'found' => $result !== null,
            'result' => $result?->toArray(),
            'directions_url' => $result ? $map->directionsUrl($result->lat, $result->lng, $result->displayName) : null,
            'geo_uri' => $result ? $map->geoUri($result->lat, $result->lng, $result->displayName) : null,
        ]);

        return back()->with($result ? 'success' : 'warning', $result
            ? __('integrations.messages.geocode_found', ['lat' => $result->lat, 'lng' => $result->lng])
            : __('integrations.messages.geocode_not_found'));
    }
}
