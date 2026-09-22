<?php

namespace App\Modules\Members\Services;

use App\Models\User;
use App\Modules\Audit\Models\SecurityEvent;
use App\Modules\Members\Models\AccountDeletionRequest;
use App\Modules\Members\Models\MemberNote;
use App\Modules\Members\Models\Membership;
use App\Modules\Members\Models\MembershipStatusHistory;
use App\Modules\Members\Models\MembershipVerification;
use App\Modules\Referrals\Models\MemberReferral;
use App\Modules\Referrals\Services\ReferralService;

/** Shapes the admin member detail page. Security events are included only when the viewer may see them. */
final class MemberDetails
{
    public function __construct(private ConsentService $consents, private ReferralService $referrals) {}

    /** @return array<string, mixed> */
    public function for(Membership $membership, User $viewer): array
    {
        $membership->loadMissing(['user', 'governorate', 'referrer.user', 'approvedBy', 'statusHistory.changedBy', 'memberNotes.author', 'deletionRequests.processedBy']);
        $user = $membership->user;

        return [
            'membership' => $this->membership($membership),
            'history' => $membership->statusHistory->map(fn (MembershipStatusHistory $h) => [
                'id' => $h->id,
                'from' => $h->from_status,
                'to' => $h->to_status,
                'reason' => $h->reason,
                'changed_by' => $h->changedBy?->name,
                'created_at' => $h->created_at?->toIso8601String(),
            ])->values()->all(),
            'verifications' => $membership->verifications()->with('verifiedBy')->limit(50)->get()->map(fn (MembershipVerification $v) => [
                'id' => $v->id,
                'purpose' => $v->purpose->value,
                'result' => $v->result->value,
                'verified_by' => $v->verifiedBy?->name,
                'ip_address' => $v->ip_address,
                'context' => $v->context_type ? class_basename($v->context_type).' #'.$v->context_id : null,
                'created_at' => $v->created_at?->toIso8601String(),
            ])->all(),
            'notes' => $membership->memberNotes->map(fn (MemberNote $n) => [
                'id' => $n->id,
                'body' => $n->body,
                'is_pinned' => $n->is_pinned,
                'author' => $n->author?->name,
                'created_at' => $n->created_at?->toIso8601String(),
            ])->values()->all(),
            'consents' => $this->consents->history($user),
            'marketing' => $this->consents->marketingState($user),
            'security_events' => $viewer->can('viewSecurity', $membership)
                ? SecurityEvent::query()->where('user_id', $user->id)->orderByDesc('id')->limit(50)->get()->map(fn (SecurityEvent $e) => [
                    'id' => $e->id,
                    'event_type' => $e->event_type,
                    'severity' => $e->severity,
                    'ip_address' => $e->ip_address,
                    'created_at' => $e->created_at?->toIso8601String(),
                ])->all()
                : null,
            'deletion_requests' => $membership->deletionRequests->map(fn (AccountDeletionRequest $r) => $this->deletionRequest($r))->values()->all(),
            'referrals' => $this->referrals->enabled()
                ? [
                    'stats' => $this->referrals->statsFor($membership),
                    'list' => $membership->referrals()->with('referred.user')->limit(20)->get()->map(fn (MemberReferral $r) => [
                        'id' => $r->referred->public_id,
                        'member_number' => $r->referred->member_number,
                        'name' => $r->referred->user?->name,
                        'status' => $r->status->value,
                        'membership_status' => $r->referred->status->value,
                        'created_at' => $r->created_at?->toIso8601String(),
                    ])->all(),
                ]
                : null,
        ];
    }

    /** @return array<string, mixed> */
    public function membership(Membership $membership): array
    {
        $user = $membership->user;

        return [
            'id' => $membership->public_id,
            'member_number' => $membership->member_number,
            'status' => $membership->status->value,
            'status_label' => $membership->status->label(),
            'allowed_transitions' => $membership->status->allowedTransitionValues(),
            'joined_at' => $membership->joined_at?->toIso8601String(),
            'approved_at' => $membership->approved_at?->toIso8601String(),
            'approved_by' => $membership->approvedBy?->name,
            'suspended_at' => $membership->suspended_at?->toIso8601String(),
            'expires_at' => $membership->expires_at?->toIso8601String(),
            'referral_code' => $membership->referral_code,
            'referral_source' => $membership->referral_source,
            'referred_by' => $membership->referrer ? [
                'id' => $membership->referrer->public_id,
                'member_number' => $membership->referrer->member_number,
                'name' => $membership->referrer->user?->name,
            ] : null,
            'qr_rotated_at' => $membership->verification_token_rotated_at?->toIso8601String(),
            'created_at' => $membership->created_at?->toIso8601String(),
            'user' => [
                'id' => $user->public_id,
                'name' => $user->name,
                'email' => $user->email,
                'mobile' => $user->mobile,
                'preferred_locale' => $user->preferred_locale,
                'governorate_id' => $membership->governorate_id,
                'governorate' => $membership->governorate?->name(),
                'status' => $user->status,
                'last_login_at' => $user->last_login_at?->toIso8601String(),
                'email_verified_at' => $user->email_verified_at?->toIso8601String(),
                'mfa_enabled' => $user->hasMfaEnabled(),
                'created_at' => $user->created_at?->toIso8601String(),
            ],
        ];
    }

    /** @return array<string, mixed> */
    public function deletionRequest(AccountDeletionRequest $request): array
    {
        return [
            'id' => $request->public_id,
            'status' => $request->status->value,
            'reason' => $request->reason,
            'requested_at' => $request->requested_at?->toIso8601String(),
            'processed_at' => $request->processed_at?->toIso8601String(),
            'processed_by' => $request->processedBy?->name,
            'notes' => $request->notes,
        ];
    }
}
