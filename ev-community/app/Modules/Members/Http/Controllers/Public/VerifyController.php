<?php

namespace App\Modules\Members\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Modules\Members\Models\Enums\VerificationPurpose;
use App\Modules\Members\Services\MembershipVerifier;
use Inertia\Inertia;
use Inertia\Response;

/** Anonymous verification page opened by any camera app: result + masked member number only. */
class VerifyController extends Controller
{
    public function __invoke(string $token, MembershipVerifier $verifier): Response
    {
        $outcome = $verifier->verify($token, VerificationPurpose::Public);

        return Inertia::render('public/verify/show', $verifier->publicPayload($outcome) + ['checked_at' => now()->toIso8601String()]);
    }
}
