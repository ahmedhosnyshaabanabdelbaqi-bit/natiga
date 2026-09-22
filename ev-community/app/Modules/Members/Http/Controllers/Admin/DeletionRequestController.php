<?php

namespace App\Modules\Members\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Members\Actions\AnonymizeMember;
use App\Modules\Members\Actions\ProcessDeletionRequest;
use App\Modules\Members\Http\Requests\Admin\ProcessDeletionRequestRequest;
use App\Modules\Members\Models\AccountDeletionRequest;
use App\Modules\Members\Models\Enums\DeletionRequestStatus;
use App\Modules\Members\Services\MemberDetails;
use App\Modules\Members\Services\MemberNotifier;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class DeletionRequestController extends Controller
{
    public function index(Request $request, MemberDetails $details): Response
    {
        Gate::authorize('viewAny', AccountDeletionRequest::class);

        $filters = array_filter($request->validate([
            'status' => ['nullable', Rule::in(DeletionRequestStatus::values())],
            'search' => ['nullable', 'string', 'max:100'],
        ]), fn ($v) => $v !== null && $v !== '');

        $query = AccountDeletionRequest::query()->with(['user.membership', 'processedBy'])
            ->orderByRaw("CASE WHEN status IN ('requested','under_review') THEN 0 ELSE 1 END")
            ->orderByDesc('requested_at');
        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }
        if (! empty($filters['search'])) {
            $like = '%'.addcslashes(mb_substr($filters['search'], 0, 100), '%_\\').'%';
            $query->whereHas('user', function ($u) use ($like) {
                $u->where('name', 'ILIKE', $like)->orWhere('email', 'ILIKE', $like)
                    ->orWhereHas('membership', fn ($m) => $m->where('member_number', 'ILIKE', $like));
            });
        }

        $counts = AccountDeletionRequest::query()->selectRaw('status, count(*) as aggregate')->groupBy('status')->pluck('aggregate', 'status');

        return Inertia::render('admin/members/deletion-requests', [
            'requests' => $query->paginate(25)->withQueryString()->through(fn (AccountDeletionRequest $r) => $details->deletionRequest($r) + [
                'can_process' => $request->user()->can('process', $r),
                'user' => [
                    'name' => $r->user->name,
                    'email' => $r->user->email,
                    'status' => $r->user->status,
                    'member_number' => $r->user->membership?->member_number,
                    'membership_id' => $r->user->membership?->public_id,
                ],
            ]),
            'filters' => $filters,
            'counts' => ['total' => (int) $counts->sum()] + array_map(fn ($s) => (int) ($counts[$s] ?? 0), array_combine(DeletionRequestStatus::values(), DeletionRequestStatus::values())),
            'statuses' => DeletionRequestStatus::options(),
        ]);
    }

    public function review(Request $request, AccountDeletionRequest $deletionRequest, ProcessDeletionRequest $action): RedirectResponse
    {
        Gate::authorize('process', $deletionRequest);
        $action->review($deletionRequest, $request->user());

        return back()->with('success', __('privacy.deletion.reviewed'));
    }

    public function complete(ProcessDeletionRequestRequest $request, AccountDeletionRequest $deletionRequest, AnonymizeMember $action): RedirectResponse
    {
        $action->execute($deletionRequest, $request->user(), $request->validated('reason'), $request->validated('notes'));

        return back()->with('success', __('privacy.deletion.completed'));
    }

    public function reject(ProcessDeletionRequestRequest $request, AccountDeletionRequest $deletionRequest, ProcessDeletionRequest $action, MemberNotifier $notifier): RedirectResponse
    {
        $rejected = $action->reject($deletionRequest, $request->user(), $request->validated('reason'), $request->validated('notes'));
        $notifier->deletionRejected($rejected);

        return back()->with('success', __('privacy.deletion.rejected'));
    }
}
