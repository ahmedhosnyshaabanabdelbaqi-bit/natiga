<?php

namespace App\Modules\Members\Http\Controllers\Member;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Services\AuditService;
use App\Modules\Members\Models\Membership;
use App\Modules\Members\Services\MembershipQr;
use App\Modules\System\Services\Settings;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class MembershipCardController extends Controller
{
    public function show(Request $request, MembershipQr $qr): Response
    {
        /** @var Membership $membership */
        $membership = $request->user()->membership()->with('governorate')->firstOrFail();
        Gate::authorize('viewOwn', $membership);
        $locale = app()->getLocale();

        return Inertia::render('member/membership-card/index', [
            'card' => [
                'site_name' => Settings::localized('branding.site_name', $locale, config('app.name')),
                'member_name' => $request->user()->name,
                'member_number' => $membership->member_number,
                'status' => $membership->status->value,
                'joined_at' => $membership->joined_at?->toIso8601String(),
                'expires_at' => $membership->expires_at?->toIso8601String(),
                'governorate' => $membership->governorate?->name(),
                'qr_rotated_at' => $membership->verification_token_rotated_at?->toIso8601String(),
            ],
            // Closure: re-evaluated on `router.reload({ only: ['qr'] })` to hand out a fresh token.
            'qr' => fn () => $this->qrPayload($membership, $qr),
        ]);
    }

    public function rotate(Request $request, AuditService $audit): RedirectResponse
    {
        /** @var Membership $membership */
        $membership = $request->user()->membership()->firstOrFail();
        Gate::authorize('rotateToken', $membership);
        $membership->rotateVerificationToken();
        $audit->log('members.qr_token_rotated', $membership, actor: $request->user());

        return back()->with('success', __('members.card.rotated'));
    }

    /** @return array<string, mixed> */
    private function qrPayload(Membership $membership, MembershipQr $qr): array
    {
        if (! $membership->isActive()) {
            return ['svg' => null, 'token' => null, 'verify_url' => null, 'expires_at' => null, 'ttl_minutes' => $qr->ttlMinutes(), 'refresh_seconds' => $qr->refreshSeconds()];
        }
        $token = $qr->token($membership);
        $url = $qr->verifyUrl($token);

        return [
            'svg' => $qr->svg($url),
            'token' => $token,
            'verify_url' => $url,
            'expires_at' => Carbon::createFromTimestamp((int) $qr->expiresAt($token))->toIso8601String(),
            'ttl_minutes' => $qr->ttlMinutes(),
            'refresh_seconds' => $qr->refreshSeconds(),
        ];
    }
}
