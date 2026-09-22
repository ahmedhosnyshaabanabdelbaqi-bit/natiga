<?php

namespace App\Modules\Reports\Operations\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Rbac\Services\PermissionRegistry;
use App\Modules\Reports\Operations\Models\Enums\ExceptionCategory;
use App\Modules\Reports\Operations\Models\Enums\ExceptionSeverity;
use App\Modules\Reports\Operations\Models\Enums\ExceptionStatus;
use App\Modules\Reports\Operations\Models\OperationsException;
use App\Modules\Reports\Operations\Services\OperationsExceptions;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ExceptionsController extends Controller
{
    use AuthorizesRequests;

    public const ALLOWED_FILTERS = ['category', 'severity', 'status', 'assigned', 'q'];

    public function __construct(private readonly OperationsExceptions $exceptions) {}

    public function index(Request $request): Response
    {
        $this->authorize('viewAny', OperationsException::class);
        $filters = $request->only(self::ALLOWED_FILTERS);
        $actor = $request->user();
        $query = OperationsException::query()->with(['assignee:id,name,public_id', 'resolver:id,name,public_id']);

        $status = $filters['status'] ?? 'live';
        if ($status === 'live') {
            $query->live();
        } elseif (in_array($status, ExceptionStatus::values(), true)) {
            $query->where('status', $status);
        }
        if (in_array($filters['category'] ?? null, ExceptionCategory::values(), true)) {
            $query->where('category', $filters['category']);
        }
        if (in_array($filters['severity'] ?? null, ExceptionSeverity::values(), true)) {
            $query->where('severity', $filters['severity']);
        }
        if (($assigned = $filters['assigned'] ?? null) !== null && $assigned !== '') {
            match ($assigned) {
                'me' => $query->where('assigned_to', $actor->id),
                'unassigned' => $query->whereNull('assigned_to'),
                default => $query->whereHas('assignee', fn (Builder $q) => $q->where('public_id', $assigned)),
            };
        }
        if (($q = trim((string) ($filters['q'] ?? ''))) !== '') {
            $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $q).'%';
            $query->where(fn (Builder $w) => $w->where('title', 'ILIKE', $like)->orWhere('dedup_key', 'ILIKE', $like)->orWhere('source', 'ILIKE', $like));
        }
        $query->orderByRaw("case severity when 'p0' then 0 when 'p1' then 1 when 'p2' then 2 else 3 end")->orderByDesc('detected_at');

        return Inertia::render('admin/operations/index', [
            'exceptions' => $query->paginate(in_array((int) $request->query('per_page', 25), [15, 25, 50, 100], true) ? (int) $request->query('per_page') : 25)->withQueryString()->through(fn (OperationsException $e) => $this->serialize($e)),
            'filters' => $filters + ['status' => $status],
            'counts' => $this->exceptions->countsBySeverity(),
            'assignees' => $this->assignees(),
            'categories' => ExceptionCategory::values(),
            'severities' => ExceptionSeverity::values(),
            'statuses' => ExceptionStatus::values(),
            'can' => ['manage' => $actor->can('operations.manage')],
        ]);
    }

    public function assign(Request $request, OperationsException $exception): RedirectResponse
    {
        $this->authorize('assign', $exception);
        $data = $request->validate(['assignee' => ['nullable', 'string', 'exists:users,public_id'], 'note' => ['nullable', 'string', 'max:500']]);
        $assignee = null;
        if (! empty($data['assignee'])) {
            // Only people who can act on the Exception Center may own an exception.
            $assignee = $this->eligibleAssignees()->where('public_id', $data['assignee'])->first();
            if (! $assignee) {
                throw ValidationException::withMessages(['assignee' => __('operations.exceptions.errors.invalid_assignee')]);
            }
        }
        $this->exceptions->assign($exception, $assignee, $request->user(), $data['note'] ?? null);

        return back()->with('success', __($assignee ? 'operations.exceptions.messages.assigned' : 'operations.exceptions.messages.unassigned', ['name' => $assignee?->name]));
    }

    public function resolve(Request $request, OperationsException $exception): RedirectResponse
    {
        $this->authorize('resolve', $exception);
        $data = $request->validate(['resolution' => ['required', 'string', 'min:5', 'max:2000']], ['resolution.required' => __('core.errors.reason_required'), 'resolution.min' => __('core.errors.reason_required')]);
        $this->exceptions->resolve($exception, $request->user(), $data['resolution']);

        return back()->with('success', __('operations.exceptions.messages.resolved'));
    }

    public function ignore(Request $request, OperationsException $exception): RedirectResponse
    {
        $this->authorize('ignore', $exception);
        $data = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:2000']], ['reason.required' => __('core.errors.reason_required'), 'reason.min' => __('core.errors.reason_required')]);
        $this->exceptions->ignore($exception, $request->user(), $data['reason']);

        return back()->with('success', __('operations.exceptions.messages.ignored'));
    }

    /** @return Builder<User> */
    private function eligibleAssignees(): Builder
    {
        return User::query()->where('status', User::STATUS_ACTIVE)
            ->where(fn (Builder $q) => $q->permission('operations.manage')->orWhereHas('roles', fn (Builder $r) => $r->whereIn('name', PermissionRegistry::SUPER_ROLES)));
    }

    /** @return array<int, array{id: string, name: string}> */
    private function assignees(): array
    {
        return $this->eligibleAssignees()->orderBy('name')->limit(100)->get(['id', 'name', 'public_id'])
            ->map(fn (User $u) => ['id' => $u->public_id, 'name' => $u->name])->values()->all();
    }

    /** @return array<string, mixed> */
    private function serialize(OperationsException $e): array
    {
        return [
            'id' => $e->public_id,
            'category' => $e->category->value,
            'severity' => $e->severity->value,
            'title' => $e->title,
            'details' => $e->details,
            'source' => $e->source,
            'dedup_key' => $e->dedup_key,
            'status' => $e->status->value,
            'assignee' => $e->assignee ? ['id' => $e->assignee->public_id, 'name' => $e->assignee->name] : null,
            'detected_at' => $e->detected_at?->toIso8601String(),
            'resolved_at' => $e->resolved_at?->toIso8601String(),
            'resolved_by' => $e->resolver?->name,
            'resolution' => $e->resolution,
            'occurrences' => $e->occurrences,
            'created_at' => $e->created_at?->toIso8601String(),
        ];
    }
}
