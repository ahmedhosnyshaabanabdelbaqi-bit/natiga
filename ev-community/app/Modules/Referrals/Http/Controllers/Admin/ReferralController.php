<?php

namespace App\Modules\Referrals\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Referrals\Models\Enums\ReferralStatus;
use App\Modules\Referrals\Models\MemberReferral;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class ReferralController extends Controller
{
    public function __invoke(Request $request): Response
    {
        Gate::authorize('referrals.view');

        $filters = array_filter($request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(ReferralStatus::values())],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]), fn ($v) => $v !== null && $v !== '');

        $query = MemberReferral::query()->with(['referrer.user', 'referred.user'])->orderByDesc('id');
        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }
        if (! empty($filters['search'])) {
            $like = '%'.addcslashes(mb_substr($filters['search'], 0, 100), '%_\\').'%';
            $query->where(function ($q) use ($like) {
                $q->where('referral_code_used', 'ILIKE', $like)
                    ->orWhereHas('referrer', fn ($m) => $m->where('member_number', 'ILIKE', $like)->orWhereHas('user', fn ($u) => $u->where('name', 'ILIKE', $like)))
                    ->orWhereHas('referred', fn ($m) => $m->where('member_number', 'ILIKE', $like)->orWhereHas('user', fn ($u) => $u->where('name', 'ILIKE', $like)));
            });
        }

        $counts = MemberReferral::query()->selectRaw('status, count(*) as aggregate')->groupBy('status')->pluck('aggregate', 'status');

        return Inertia::render('admin/referrals/index', [
            'referrals' => $query->paginate((int) ($filters['per_page'] ?? 25))->withQueryString()->through(fn (MemberReferral $r) => [
                'id' => $r->id,
                'status' => $r->status->value,
                'referral_code_used' => $r->referral_code_used,
                'created_at' => $r->created_at?->toIso8601String(),
                'approved_at' => $r->approved_at?->toIso8601String(),
                'referrer' => ['id' => $r->referrer->public_id, 'member_number' => $r->referrer->member_number, 'name' => $r->referrer->user->name],
                'referred' => ['id' => $r->referred->public_id, 'member_number' => $r->referred->member_number, 'name' => $r->referred->user->name, 'status' => $r->referred->status->value],
            ]),
            'filters' => $filters,
            'counts' => [
                'total' => (int) $counts->sum(),
                'invited' => (int) ($counts['invited'] ?? 0),
                'registered' => (int) ($counts['registered'] ?? 0),
                'approved' => (int) ($counts['approved'] ?? 0),
            ],
            'statuses' => ReferralStatus::options(),
        ]);
    }
}
