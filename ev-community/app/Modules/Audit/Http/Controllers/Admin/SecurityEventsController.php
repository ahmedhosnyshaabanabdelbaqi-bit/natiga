<?php

namespace App\Modules\Audit\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\SecurityEvent;
use App\Modules\Audit\Services\SecurityEvents;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;
use Inertia\Response;

class SecurityEventsController extends Controller
{
    use AuthorizesRequests;

    public const ALLOWED_FILTERS = ['user', 'type', 'severity', 'from', 'to', 'critical'];

    public function index(Request $request): Response
    {
        $this->authorize('viewAny', SecurityEvent::class);
        $filters = $request->only(self::ALLOWED_FILTERS);
        $query = SecurityEvent::query()->with('user:id,name,email,public_id')->orderByDesc('id');

        if (($user = trim((string) ($filters['user'] ?? ''))) !== '') {
            $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $user).'%';
            $query->whereHas('user', fn (Builder $q) => $q->where('name', 'ILIKE', $like)->orWhere('email', 'ILIKE', $like)->orWhere('public_id', $user));
        }
        if (! empty($filters['type'])) {
            $query->where('event_type', (string) $filters['type']);
        }
        if (in_array($filters['severity'] ?? null, ['info', 'warning', 'critical'], true)) {
            $query->where('severity', $filters['severity']);
        }
        if (filter_var($filters['critical'] ?? false, FILTER_VALIDATE_BOOL)) {
            $query->where(fn (Builder $q) => $q->where('severity', 'critical')->orWhereIn('event_type', SecurityEvents::CRITICAL));
        }
        if ($from = $this->date($filters['from'] ?? null)) {
            $query->where('created_at', '>=', $from->startOfDay());
        }
        if ($to = $this->date($filters['to'] ?? null)) {
            $query->where('created_at', '<=', $to->endOfDay());
        }

        return Inertia::render('admin/security-events/index', [
            'events' => $query->paginate(25)->withQueryString()->through(fn (SecurityEvent $event) => [
                'id' => $event->id,
                'type' => $event->event_type,
                'severity' => $event->severity,
                'user' => $event->user ? ['id' => $event->user->public_id, 'name' => $event->user->name, 'email' => $event->user->email] : null,
                'ip_address' => $event->ip_address,
                'user_agent' => $event->user_agent,
                'meta' => $event->meta,
                'created_at' => $event->created_at?->toIso8601String(),
            ]),
            'filters' => $filters,
            'types' => Cache::remember('ev.security_events.types.v1', now()->addMinutes(5), fn () => SecurityEvent::query()->select('event_type')->distinct()->orderBy('event_type')->pluck('event_type')->all()),
            'criticalCount' => SecurityEvent::query()->where('created_at', '>=', now()->subDays(7))->where(fn (Builder $q) => $q->where('severity', 'critical')->orWhereIn('event_type', SecurityEvents::CRITICAL))->count(),
        ]);
    }

    private function date(mixed $value): ?CarbonImmutable
    {
        if (! is_string($value) || $value === '') {
            return null;
        }
        try {
            return CarbonImmutable::parse($value, config('app.timezone'));
        } catch (\Throwable) {
            return null;
        }
    }
}
