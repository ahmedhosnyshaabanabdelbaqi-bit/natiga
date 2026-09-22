<?php

namespace App\Modules\Members\Http\Requests\Admin;

use App\Modules\Members\Models\Enums\VerificationPurpose;
use App\Modules\Members\Models\Membership;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Used by the admin scanner (members.verify) and the partner scanner (partner.access). */
class VerifyTokenRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        if (! $user) {
            return false;
        }

        return $this->routeIs('partner.*') ? $user->can('partner.access') : $user->can('verify', Membership::class);
    }

    public function rules(): array
    {
        return [
            'token' => ['required', 'string', 'min:20', 'max:600'],
            'purpose' => ['nullable', Rule::in(array_map(fn (VerificationPurpose $p) => $p->value, VerificationPurpose::selectable()))],
        ];
    }

    public function purpose(): VerificationPurpose
    {
        return VerificationPurpose::tryFrom((string) $this->input('purpose')) ?? VerificationPurpose::Membership;
    }
}
