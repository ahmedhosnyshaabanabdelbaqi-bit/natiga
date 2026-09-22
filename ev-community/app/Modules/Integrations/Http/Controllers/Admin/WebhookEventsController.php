<?php

namespace App\Modules\Integrations\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Integrations\Models\Enums\WebhookEventStatus;
use App\Modules\Integrations\Models\WebhookEvent;
use App\Modules\Integrations\Services\IntegrationManager;
use App\Modules\Integrations\Services\WebhookIngest;
use App\Modules\Integrations\Support\Sanitizer;
use App\Support\Exceptions\DomainException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class WebhookEventsController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = [
            'provider' => in_array($request->query('provider'), IntegrationManager::CATEGORIES, true) ? $request->query('provider') : null,
            'status' => in_array($request->query('status'), WebhookEventStatus::values(), true) ? $request->query('status') : null,
            'q' => Sanitizer::truncate(trim((string) $request->query('q', '')), 120) ?: null,
        ];

        $events = WebhookEvent::query()
            ->when($filters['provider'], fn ($q, $p) => $q->forProvider($p))
            ->when($filters['status'], fn ($q, $s) => $q->withStatus($s))
            ->when($filters['q'], fn ($q, $term) => $q->where(fn ($w) => $w->where('external_event_id', 'ILIKE', '%'.$term.'%')->orWhere('event_type', 'ILIKE', '%'.$term.'%')))
            ->orderByDesc('received_at')->orderByDesc('id')
            ->paginate(25)
            ->withQueryString()
            ->through(fn (WebhookEvent $e) => $this->row($e));

        return Inertia::render('admin/integrations/webhook-events/index', [
            'events' => $events,
            'filters' => $filters,
            'providers' => IntegrationManager::CATEGORIES,
            'statuses' => WebhookEventStatus::values(),
            'canManage' => $request->user()->can('integrations.manage'),
        ]);
    }

    public function show(Request $request, WebhookEvent $event): Response
    {
        return Inertia::render('admin/integrations/webhook-events/show', [
            'event' => $this->row($event) + [
                'headers' => $event->headers ?? [],
                'payload' => $event->payload ?? [],
                'fingerprint' => $event->fingerprint,
                'error' => $event->error,
            ],
            'canManage' => $request->user()->can('integrations.manage'),
        ]);
    }

    public function retry(Request $request, WebhookEvent $event, WebhookIngest $ingest, AuditService $audit): RedirectResponse
    {
        Gate::authorize('integrations.manage');
        if (! $event->status->canRetry() || $event->signature_valid !== true) {
            throw DomainException::because('integrations.errors.webhook_retry_not_allowed', ['status' => $event->status->label()]);
        }
        $audit->log('integrations.webhook_retried', $event, old: ['status' => $event->status->value, 'retry_count' => $event->retry_count], new: ['status' => WebhookEventStatus::Received->value], actor: $request->user(), entityLabel: $event->provider.'#'.$event->id);
        $ingest->retry($event);

        return back()->with('success', __('integrations.messages.webhook_retry_queued', ['id' => $event->id]));
    }

    /** @return array<string, mixed> */
    private function row(WebhookEvent $e): array
    {
        return [
            'id' => $e->id,
            'provider' => $e->provider,
            'driver' => $e->headers['_driver'] ?? null,
            'event_type' => $e->event_type,
            'external_event_id' => $e->external_event_id,
            'signature_valid' => $e->signature_valid,
            'status' => $e->status->value,
            'retry_count' => $e->retry_count,
            'error_short' => Sanitizer::truncate($e->error, 120),
            'received_at' => $e->received_at?->toIso8601String(),
            'processed_at' => $e->processed_at?->toIso8601String(),
            'can_retry' => $e->status->canRetry() && $e->signature_valid === true,
        ];
    }
}
