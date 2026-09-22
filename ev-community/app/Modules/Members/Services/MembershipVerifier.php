<?php

namespace App\Modules\Members\Services;

use App\Models\User;
use App\Modules\Members\Models\Enums\VerificationPurpose;
use App\Modules\Members\Models\Enums\VerificationResult;
use App\Modules\Members\Models\Membership;
use App\Modules\Members\Models\MembershipVerification;
use Illuminate\Database\Eloquent\Model;

/**
 * Verifies a scanned token, logs the attempt and shapes the response for each audience.
 *
 * Member data is disclosed only for *authentic* tokens (valid signature): a forged or tampered token
 * that happens to carry a real public id is logged against that membership (so staff can spot abuse)
 * but never reveals who it belongs to. Partner/public payloads never include contact or financial data.
 *
 * Other modules (events, deliveries, partner offers) call `verify()` with their own purpose and
 * context model, e.g. `verify($raw, VerificationPurpose::Pickup, $staff, $delivery)`.
 */
final class MembershipVerifier
{
    public function __construct(private MembershipQr $qr) {}

    /**
     * @return array{valid: bool, authentic: bool, reason: ?string, membership: ?Membership, verification: ?MembershipVerification}
     */
    public function verify(string $rawToken, VerificationPurpose $purpose, ?User $actor = null, ?Model $context = null): array
    {
        $outcome = $this->qr->verify($this->qr->tokenFromScan($rawToken));
        /** @var Membership|null $membership */
        $membership = $outcome['membership'] ?? null;
        $result = $outcome['valid'] ? VerificationResult::Valid : VerificationResult::from($outcome['reason']);

        $verification = null;
        if ($membership) {
            $verification = MembershipVerification::create([
                'membership_id' => $membership->id,
                'verified_by' => $actor?->id,
                'purpose' => $purpose,
                'context_type' => $context?->getMorphClass(),
                'context_id' => $context?->getKey(),
                'result' => $result,
                'ip_address' => request()?->ip(),
                'created_at' => now(),
            ]);
        }

        return [
            'valid' => $outcome['valid'],
            'authentic' => $outcome['authentic'],
            'reason' => $outcome['valid'] ? null : $outcome['reason'],
            'membership' => $membership,
            'verification' => $verification,
        ];
    }

    /**
     * Staff scanner: identity + membership facts (no financial data; that lives in its own module).
     * The link to the member page is included only when the scanning user may open it.
     *
     * @param  array{valid: bool, authentic: bool, reason: ?string, membership: ?Membership}  $outcome
     * @return array<string, mixed>
     */
    public function adminPayload(array $outcome, ?User $viewer = null): array
    {
        $membership = $this->disclosable($outcome);
        $membership?->loadMissing('governorate');

        return [
            'valid' => $outcome['valid'],
            'reason' => $outcome['reason'],
            'member' => $membership ? [
                'id' => $membership->public_id,
                'name' => $membership->user->name,
                'member_number' => $membership->member_number,
                'status' => $membership->status->value,
                'joined_at' => $membership->joined_at?->toIso8601String(),
                'expires_at' => $membership->expires_at?->toIso8601String(),
                'governorate' => $membership->governorate?->name(),
                'url' => $viewer?->can('view', $membership) ? route('admin.members.show', $membership, false) : null,
            ] : null,
        ];
    }

    /**
     * Partner scanner: the minimum needed to honour an offer (valid, name, member number, status).
     *
     * @param  array{valid: bool, authentic: bool, reason: ?string, membership: ?Membership}  $outcome
     * @return array<string, mixed>
     */
    public function partnerPayload(array $outcome): array
    {
        $membership = $this->disclosable($outcome);

        return [
            'valid' => $outcome['valid'],
            'reason' => $outcome['reason'],
            'member' => $membership ? [
                'name' => $membership->user->name,
                'member_number' => $membership->member_number,
                'status' => $membership->status->value,
            ] : null,
        ];
    }

    /**
     * Anonymous page: result + masked member number (valid cards only).
     *
     * @param  array{valid: bool, authentic: bool, reason: ?string, membership: ?Membership}  $outcome
     * @return array{result: string, member_number_masked: ?string}
     */
    public function publicPayload(array $outcome): array
    {
        $membership = $outcome['membership'];

        return [
            'result' => $outcome['valid'] ? VerificationResult::Valid->value : (string) $outcome['reason'],
            'member_number_masked' => $outcome['valid'] && $membership ? $membership->maskedMemberNumber() : null,
        ];
    }

    /** @param  array{authentic: bool, membership: ?Membership}  $outcome */
    private function disclosable(array $outcome): ?Membership
    {
        return $outcome['authentic'] ? $outcome['membership'] : null;
    }
}
