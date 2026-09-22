<?php

namespace App\Modules\Integrations\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Integrations\Models\Enums\WebhookEventStatus;
use App\Modules\Integrations\Models\WebhookEvent;
use App\Modules\Integrations\Services\IntegrationManager;
use App\Modules\Integrations\Services\WebhookHandlers;
use App\Modules\Integrations\Services\WebhookIngest;
use App\Modules\Integrations\Support\Sanitizer;
use App\Support\Exceptions\DomainException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Admin view of inbound provider callbacks (integrations.view) and manual retry of failed,
 * signature-verified events (integrations.manage). Webhook events are internal operational
 * records (no member data is keyed by them), so they are addressed by their numeric id.
 */
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
            ->when($filters['q'], fn ($q, $term) => $q->where(fn ($w) => $w->where('external_event_id', 'ILIKE', '%'.self::escapeLike($term).'%')->orWhere('event_type', 'ILIKE', '%'.self::escapeLike($term).'%')))
            ->orderByDesc('received_at')->orderByDesc('id')
            ->paginate(25)
            ->withQueryString()
            ->through(fn (WebhookEvent $e) => $this->row($e));

        return Inertia::render('admin/integrations/webhook-events/index', [
            'events' => $events,
            'filters' => $filters,
            'providers' => IntegrationManager::CATEGORIES,
            'statuses' => WebhookEventStatus::values(),
            // Detail drawer: `?event=<id>` loads one event (partial reload `only: ['selected']`).
            'selected' => function () use ($request): ?array {
                $id = filter_var($request->query('event'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
                $event = $id !== false ? WebhookEvent::query()->find($id) : null;

                return $event ? $this->detail($event) : null;
            },
            'canManage' => $request->user()->can('integrations.manage'),
        ]);
    }

    public function show(Request $request, WebhookEvent $event): Response
    {
        return Inertia::render('admin/integrations/webhook-events/show', [
            'event' => $this->detail($event),
            'canManage' => $request->user()->can('integrations.manage'),
        ]);
    }

    public function retry(Request $request, WebhookEvent $event, WebhookIngest $ingest, AuditService $audit): RedirectResponse
    {
        Gate::authorize('integrations.manage');
        $actor = $request->user();
        $requeued = $ingest->retry($event, function (WebhookEvent $locked, array $previous) use ($audit, $actor): void {
            $audit->log(
                'integrations.webhook_retried',
                $locked,
                old: ['status' => $previous['status'], 'retry_count' => $previous['retry_count']],
                new: ['status' => WebhookEventStatus::Received->value],
                actor: $actor,
                entityLabel: $locked->provider.'#'.$locked->id,
            );
        });
        if (! $requeued) {
            throw DomainException::because('integrations.errors.webhook_retry_not_allowed', ['status' => $event->refresh()->status->label()]);
        }

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

    /**
     * Full event for the drawer / detail page. Payload and headers were redacted at ingest; they are
     * redacted again here so rows stored before a Sanitizer rule was added never leak a secret.
     *
     * @return array<string, mixed>
     */
    private function detail(WebhookEvent $e): array
    {
        $headers = $e->headers ?? [];
        unset($headers['_driver']);

        return $this->row($e) + [
            'headers' => Sanitizer::redact($headers),
            'payload' => Sanitizer::redact($e->payload ?? []),
            'fingerprint' => $e->fingerprint,
            'error' => $e->error,
            'has_handler' => WebhookHandlers::has($e->provider),
        ];
    }

    private static function escapeLike(string $term): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $term);
    }
}
