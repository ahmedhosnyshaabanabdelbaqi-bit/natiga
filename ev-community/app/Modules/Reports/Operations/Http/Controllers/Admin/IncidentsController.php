<?php

namespace App\Modules\Reports\Operations\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Rbac\Services\PermissionRegistry;
use App\Modules\Reports\Operations\Http\Requests\IncidentReviewRequest;
use App\Modules\Reports\Operations\Http\Requests\StoreIncidentRequest;
use App\Modules\Reports\Operations\Http\Requests\UpdateIncidentRequest;
use App\Modules\Reports\Operations\Models\Enums\ExceptionSeverity;
use App\Modules\Reports\Operations\Models\Enums\IncidentStatus;
use App\Modules\Reports\Operations\Models\Incident;
use App\Modules\Reports\Operations\Models\IncidentEvent;
use App\Modules\Reports\Operations\Services\IncidentManager;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class IncidentsController extends Controller
{
    use AuthorizesRequests;

    public const ALLOWED_FILTERS = ['status', 'severity', 'owner', 'q'];

    public function __construct(private readonly IncidentManager $incidents) {}

    public function index(Request $request): Response
    {
        $this->authorize('viewAny', Incident::class);
        $filters = $request->only(self::ALLOWED_FILTERS);
        $query = Incident::query()->with('owner:id,name,public_id');

        $status = $filters['status'] ?? 'active';
        if ($status === 'active') {
            $query->whereIn('status', ['open', 'investigating', 'mitigated']);
        } elseif (in_array($status, IncidentStatus::values(), true)) {
            $query->where('status', $status);
        }
        if (in_array($filters['severity'] ?? null, ExceptionSeverity::values(), true)) {
            $query->where('severity', $filters['severity']);
        }
        if (! empty($filters['owner'])) {
            $filters['owner'] === 'me'
                ? $query->where('owner_id', $request->user()->id)
                : $query->whereHas('owner', fn (Builder $q) => $q->where('public_id', $filters['owner']));
        }
        if (($q = trim((string) ($filters['q'] ?? ''))) !== '') {
            $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $q).'%';
            $query->where(fn (Builder $w) => $w->where('title', 'ILIKE', $like)->orWhere('number', 'ILIKE', $like));
        }

        return Inertia::render('admin/incidents/index', [
            'incidents' => $query->orderByDesc('started_at')->orderByDesc('id')->paginate(25)->withQueryString()->through(fn (Incident $i) => $this->summary($i)),
            'filters' => $filters + ['status' => $status],
            'owners' => $this->owners(),
            'severities' => ExceptionSeverity::values(),
            'statuses' => IncidentStatus::values(),
            'can' => ['manage' => $request->user()->can('incidents.manage')],
        ]);
    }

    public function create(): Response
    {
        $this->authorize('create', Incident::class);

        return Inertia::render('admin/incidents/create', $this->formProps());
    }

    public function store(StoreIncidentRequest $request): RedirectResponse
    {
        $this->authorize('create', Incident::class);
        $data = $request->validated();
        $data['owner_id'] = $this->ownerId($data['owner'] ?? null);
        $incident = $this->incidents->create($data, $request->user());

        return redirect()->route('admin.incidents.show', $incident)->with('success', __('operations.incidents.messages.created', ['number' => $incident->number]));
    }

    public function show(Request $request, Incident $incident): Response
    {
        $this->authorize('view', $incident);
        $incident->load(['owner:id,name,public_id', 'creator:id,name,public_id', 'events.author:id,name,public_id']);
        $actor = $request->user();

        return Inertia::render('admin/incidents/show', [
            'incident' => $this->detail($incident),
            'events' => $incident->events->map(fn (IncidentEvent $e) => [
                'id' => $e->id, 'type' => $e->type, 'message' => $e->message, 'meta' => $e->meta, 'author' => $e->author?->name, 'created_at' => $e->created_at?->toIso8601String(),
            ])->values()->all(),
            'transitions' => array_map(fn (IncidentStatus $s) => $s->value, $incident->status->allowedTransitions()),
            'can' => ['manage' => $actor->can('update', $incident)],
        ] + $this->formProps());
    }

    public function update(UpdateIncidentRequest $request, Incident $incident): RedirectResponse
    {
        $this->authorize('update', $incident);
        $data = $request->validated();
        if (array_key_exists('owner', $data)) {
            $data['owner_id'] = $this->ownerId($data['owner']);
        }
        $this->incidents->update($incident, $data, $request->user());

        return back()->with('success', __('operations.incidents.messages.updated'));
    }

    public function transition(Request $request, Incident $incident): RedirectResponse
    {
        $this->authorize('transition', $incident);
        $data = $request->validate(['status' => ['required', Rule::in(IncidentStatus::values())], 'note' => ['nullable', 'string', 'max:2000']]);
        $this->incidents->transition($incident, IncidentStatus::from($data['status']), $request->user(), $data['note'] ?? null);

        return back()->with('success', __('operations.incidents.messages.status_changed', ['status' => IncidentStatus::from($data['status'])->label()]));
    }

    public function note(Request $request, Incident $incident): RedirectResponse
    {
        $this->authorize('comment', $incident);
        $data = $request->validate(['message' => ['required', 'string', 'min:2', 'max:2000']]);
        $this->incidents->addNote($incident, $data['message'], $request->user());

        return back()->with('success', __('operations.incidents.messages.note_added'));
    }

    public function review(IncidentReviewRequest $request, Incident $incident): RedirectResponse
    {
        $this->authorize('update', $incident);
        $this->incidents->updateReview($incident, $request->validated(), $request->user());

        return back()->with('success', __('operations.incidents.messages.review_saved'));
    }

    private function ownerId(?string $publicId): ?int
    {
        return $publicId ? User::query()->where('public_id', $publicId)->value('id') : null;
    }

    /** @return array<string, mixed> */
    private function formProps(): array
    {
        return [
            'owners' => $this->owners(),
            'modules' => collect(config('ev.modules', []))->map(fn ($m, $key) => ['key' => $key, 'name' => $m['name']])->values()->all(),
            'severities' => ExceptionSeverity::values(),
        ];
    }

    /** @return array<int, array{id: string, name: string}> */
    private function owners(): array
    {
        return User::query()->where('status', User::STATUS_ACTIVE)
            ->where(fn (Builder $q) => $q->permission(['incidents.manage', 'operations.manage'])->orWhereHas('roles', fn (Builder $r) => $r->whereIn('name', PermissionRegistry::SUPER_ROLES)))
            ->orderBy('name')->limit(100)->get(['id', 'name', 'public_id'])
            ->map(fn (User $u) => ['id' => $u->public_id, 'name' => $u->name])->values()->all();
    }

    /** @return array<string, mixed> */
    private function summary(Incident $i): array
    {
        return [
            'id' => $i->public_id,
            'number' => $i->number,
            'severity' => $i->severity->value,
            'title' => $i->title,
            'affected_module' => $i->affected_module,
            'status' => $i->status->value,
            'owner' => $i->owner ? ['id' => $i->owner->public_id, 'name' => $i->owner->name] : null,
            'started_at' => $i->started_at?->toIso8601String(),
            'detected_at' => $i->detected_at?->toIso8601String(),
            'resolved_at' => $i->resolved_at?->toIso8601String(),
            'created_at' => $i->created_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    private function detail(Incident $i): array
    {
        return $this->summary($i) + [
            'impact' => $i->impact,
            'root_cause' => $i->root_cause,
            'resolution' => $i->resolution,
            'corrective_actions' => $i->corrective_actions,
            'review' => $i->review ?? (object) [],
            'created_by' => $i->creator?->name,
        ];
    }
}
