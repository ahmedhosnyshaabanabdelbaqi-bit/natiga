<?php

namespace App\Modules\Members\Http\Requests\Admin;

use App\Modules\Members\Models\Enums\VerificationPurpose;
use App\Modules\Members\Models\Membership;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Used by the admin scanner (members.verify) and the partner scanner (partner.access).
 * The purpose is whitelisted per audience; `public` is reserved for the anonymous page.
 */
class VerifyTokenRequest extends FormRequest
{
    /** @var VerificationPurpose[] */
    public const ADMIN_PURPOSES = [VerificationPurpose::Membership, VerificationPurpose::Event, VerificationPurpose::Pickup, VerificationPurpose::Offer, VerificationPurpose::Booking];

    /** @var VerificationPurpose[] */
    public const PARTNER_PURPOSES = [VerificationPurpose::Offer, VerificationPurpose::Booking, VerificationPurpose::Membership];

    public function authorize(): bool
    {
        $user = $this->user();
        if (! $user) {
            return false;
        }

        return $this->isPartner() ? $user->can('partner.access') : $user->can('verify', Membership::class);
    }

    public function rules(): array
    {
        return [
            'token' => ['required', 'string', 'min:20', 'max:600'],
            'purpose' => ['nullable', 'string', Rule::in(array_map(fn (VerificationPurpose $p) => $p->value, $this->allowedPurposes()))],
        ];
    }

    public function attributes(): array
    {
        return ['token' => __('members.admin.scan.token'), 'purpose' => __('members.admin.scan.purpose')];
    }

    public function purpose(): VerificationPurpose
    {
        return VerificationPurpose::tryFrom((string) $this->validated('purpose')) ?? VerificationPurpose::Membership;
    }

    /** @return VerificationPurpose[] */
    public function allowedPurposes(): array
    {
        return $this->isPartner() ? self::PARTNER_PURPOSES : self::ADMIN_PURPOSES;
    }

    private function isPartner(): bool
    {
        return $this->routeIs('partner.*');
    }
}
