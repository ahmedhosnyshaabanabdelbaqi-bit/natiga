<?php

namespace App\Modules\Members\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Modules\Members\Models\Enums\VerificationPurpose;
use App\Modules\Members\Services\MembershipVerifier;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

/**
 * Anonymous verification page opened by any camera app: result + masked member number only.
 * Every hit on a resolvable membership is logged with purpose=public. The page is never indexed
 * and never leaks the token through the Referer header (meta referrer=no-referrer in the page).
 */
class VerifyController extends Controller
{
    public function __invoke(Request $request, string $token, MembershipVerifier $verifier): Response
    {
        $outcome = $verifier->verify($token, VerificationPurpose::Public);

        $response = Inertia::render('public/verify/show', $verifier->publicPayload($outcome) + [
            'checked_at' => now()->toIso8601String(),
        ])->toResponse($request);

        $response->headers->set('X-Robots-Tag', 'noindex, nofollow');
        $response->headers->set('Cache-Control', 'no-store, private');

        return $response;
    }
}
