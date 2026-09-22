<?php

namespace App\Modules\Members\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Members\Http\Requests\Admin\VerifyTokenRequest;
use App\Modules\Members\Models\Enums\VerificationPurpose;
use App\Modules\Members\Models\Membership;
use App\Modules\Members\Services\MembershipVerifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class MemberVerificationController extends Controller
{
    public function scan(): Response
    {
        Gate::authorize('verify', Membership::class);

        return Inertia::render('admin/members/scan', [
            'purposes' => array_map(fn (VerificationPurpose $p) => ['value' => $p->value, 'label' => $p->label()], VerifyTokenRequest::ADMIN_PURPOSES),
        ]);
    }

    public function verify(VerifyTokenRequest $request, MembershipVerifier $verifier): JsonResponse
    {
        $outcome = $verifier->verify($request->validated('token'), $request->purpose(), $request->user());
        $payload = $verifier->adminPayload($outcome, $request->user());

        return response()->json([
            'data' => $payload,
            'message' => __('members.verification.message.'.($outcome['valid'] ? 'valid' : $outcome['reason'])),
            'errors' => [],
            'meta' => ['request_id' => ev_request_id()],
        ]);
    }
}
