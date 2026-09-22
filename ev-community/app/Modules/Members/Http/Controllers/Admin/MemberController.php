<?php

namespace App\Modules\Members\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Members\Actions\ChangeMembershipStatus;
use App\Modules\Members\Actions\UpdateMemberProfile;
use App\Modules\Members\Http\Requests\Admin\BulkApproveRequest;
use App\Modules\Members\Http\Requests\Admin\UpdateMemberProfileRequest;
use App\Modules\Members\Models\Enums\MembershipStatus;
use App\Modules\Members\Models\Governorate;
use App\Modules\Members\Models\Membership;
use App\Modules\Members\Services\MemberDetails;
use App\Modules\Members\Services\MemberDirectory;
use App\Modules\Members\Services\MembersExport;
use App\Support\Exceptions\DomainException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class MemberController extends Controller
{
    public function index(Request $request, MemberDirectory $directory): Response
    {
        Gate::authorize('viewAny', Membership::class);
        $filters = $directory->filters($request);

        return Inertia::render('admin/members/index', $this->listing($directory, $filters));
    }

    public function pending(Request $request, MemberDirectory $directory): Response
    {
        Gate::authorize('viewAny', Membership::class);
        $filters = $directory->filters($request, ['status' => MembershipStatus::Pending->value]);
        $filters += ['sort' => 'joined_at', 'direction' => 'asc'];

        return Inertia::render('admin/members/pending', $this->listing($directory, $filters));
    }

    public function show(Membership $membership, Request $request, MemberDetails $details): Response
    {
        Gate::authorize('view', $membership);

        return Inertia::render('admin/members/show', $details->for($membership, $request->user()) + [
            'governorates' => Governorate::optionsFor(),
            'locales' => ev_locales(),
        ]);
    }

    public function update(UpdateMemberProfileRequest $request, Membership $membership, UpdateMemberProfile $action): RedirectResponse
    {
        $data = $request->validated();
        $reason = $data['reason'] ?? null;
        unset($data['reason']);
        $action->execute($membership, $data, $request->user(), $reason);

        return back()->with('success', __('members.flash.profile_updated'));
    }

    public function export(Request $request, MemberDirectory $directory, MembersExport $export): StreamedResponse
    {
        Gate::authorize('export', Membership::class);

        return $export->stream($directory->filters($request), $request->user());
    }

    public function bulkApprove(BulkApproveRequest $request, ChangeMembershipStatus $action): RedirectResponse
    {
        $approved = 0;
        $skipped = 0;
        Membership::query()->whereIn('public_id', $request->validated('ids'))->get()->each(function (Membership $membership) use ($request, $action, &$approved, &$skipped) {
            if ($membership->status !== MembershipStatus::Pending) {
                $skipped++;

                return;
            }
            try {
                $action->execute($membership, MembershipStatus::Active, $request->user(), $request->validated('reason'));
                $approved++;
            } catch (DomainException) {
                $skipped++;
            }
        });

        return back()->with('success', __('members.flash.bulk_approved', ['approved' => $approved, 'skipped' => $skipped]));
    }

    public function resendVerification(Request $request, Membership $membership, AuditService $audit): RedirectResponse
    {
        Gate::authorize('update', $membership);
        $user = $membership->user;
        if ($user->hasVerifiedEmail()) {
            return back()->with('warning', __('members.flash.already_verified'));
        }
        $user->sendEmailVerificationNotification();
        $audit->log('members.verification_email_resent', $membership, actor: $request->user());

        return back()->with('success', __('members.flash.verification_sent'));
    }

    public function rotateToken(Request $request, Membership $membership, AuditService $audit): RedirectResponse
    {
        Gate::authorize('rotateToken', $membership);
        $membership->rotateVerificationToken();
        $audit->log('members.qr_token_rotated', $membership, actor: $request->user());

        return back()->with('success', __('members.flash.token_rotated'));
    }

    /** @return array<string, mixed> */
    private function listing(MemberDirectory $directory, array $filters): array
    {
        return [
            'members' => $directory->paginate($filters)->through(fn (Membership $m) => $directory->row($m)),
            'filters' => $filters,
            'counts' => $directory->countsByStatus(),
            'governorates' => Governorate::optionsFor(),
            'referral_sources' => $directory->referralSources(),
            'statuses' => MembershipStatus::options(),
        ];
    }
}
