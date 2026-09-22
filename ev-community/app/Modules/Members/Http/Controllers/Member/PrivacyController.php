<?php

namespace App\Modules\Members\Http\Controllers\Member;

use App\Http\Controllers\Controller;
use App\Modules\Members\Actions\DeactivateOwnAccount;
use App\Modules\Members\Actions\RequestAccountDeletion;
use App\Modules\Members\Http\Requests\Member\DeactivateAccountRequest;
use App\Modules\Members\Http\Requests\Member\DeletionRequestRequest;
use App\Modules\Members\Http\Requests\Member\UpdateConsentsRequest;
use App\Modules\Members\Models\AccountDeletionRequest;
use App\Modules\Members\Services\ConsentService;
use App\Modules\Members\Services\MemberDetails;
use App\Modules\Members\Services\MemberNotifier;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class PrivacyController extends Controller
{
    public function index(Request $request, ConsentService $consents, MemberDetails $details): Response
    {
        $user = $request->user();
        $membership = $user->membership()->with('governorate')->first();
        $latest = AccountDeletionRequest::query()->where('user_id', $user->id)->orderByDesc('id')->first();

        return Inertia::render('member/privacy/index', [
            'summary' => [
                'name' => $user->name,
                'email' => $user->email,
                'mobile' => $user->mobile,
                'governorate' => $membership?->governorate?->name(),
                'member_number' => $membership?->member_number,
                'joined_at' => $membership?->joined_at?->toIso8601String(),
            ],
            'marketing' => $consents->marketingState($user),
            'history' => $consents->history($user, 20),
            'deletion_request' => $latest ? $details->deletionRequest($latest) : null,
        ]);
    }

    public function updateConsents(UpdateConsentsRequest $request, ConsentService $consents): RedirectResponse
    {
        $consents->updateMarketing($request->user(), $request->wanted());

        return back()->with('success', __('privacy.consents.saved'));
    }

    public function deactivate(DeactivateAccountRequest $request, DeactivateOwnAccount $action): RedirectResponse
    {
        $action->execute($request->user(), $request->validated('reason'));

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login')->with('status', __('privacy.deactivate.done'));
    }

    public function requestDeletion(DeletionRequestRequest $request, RequestAccountDeletion $action, MemberNotifier $notifier): RedirectResponse
    {
        $deletionRequest = $action->execute($request->user(), $request->validated('reason'));
        $notifier->deletionRequested($request->user(), $deletionRequest->id);

        return back()->with('success', __('privacy.deletion.submitted'));
    }
}
