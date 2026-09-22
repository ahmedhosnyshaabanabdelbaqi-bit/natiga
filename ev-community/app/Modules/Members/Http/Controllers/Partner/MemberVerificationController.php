<?php

namespace App\Modules\Members\Http\Controllers\Partner;

use App\Http\Controllers\Controller;
use App\Modules\Members\Http\Requests\Admin\VerifyTokenRequest;
use App\Modules\Members\Models\Enums\VerificationPurpose;
use App\Modules\Members\Services\MembershipVerifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/** Partner scanner: confirms a membership before honouring an offer. Sees name, number and status only. */
class MemberVerificationController extends Controller
{
    public function scan(): Response
    {
        Gate::authorize('partner.access');

        return Inertia::render('partner/members/scan', [
            'purposes' => array_map(fn (VerificationPurpose $p) => ['value' => $p->value, 'label' => $p->label()], [VerificationPurpose::Offer, VerificationPurpose::Booking, VerificationPurpose::Membership]),
        ]);
    }

    public function verify(VerifyTokenRequest $request, MembershipVerifier $verifier): JsonResponse
    {
        $outcome = $verifier->verify($request->validated('token'), $request->purpose(), $request->user());

        return response()->json([
            'data' => $verifier->partnerPayload($outcome),
            'message' => __('members.verification.message.'.($outcome['valid'] ? 'valid' : $outcome['reason'])),
            'errors' => [],
            'meta' => ['request_id' => ev_request_id()],
        ]);
    }
}
