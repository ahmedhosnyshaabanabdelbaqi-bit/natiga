<?php

namespace App\Modules\Members\Http\Requests\Admin;

use App\Modules\Members\Actions\UpdateMemberProfile;
use App\Modules\Members\Models\Membership;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateMemberProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        $membership = $this->route('membership');

        return $membership instanceof Membership && (bool) $this->user()?->can('update', $membership);
    }

    protected function prepareForValidation(): void
    {
        $mobile = $this->input('mobile');
        if (is_string($mobile) && trim($mobile) !== '') {
            $this->merge(['mobile' => UpdateMemberProfile::normalizeMobile($mobile)]);
        }
    }

    public function rules(): array
    {
        /** @var Membership $membership */
        $membership = $this->route('membership');

        return [
            'name' => ['required', 'string', 'min:3', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($membership->user_id)],
            'mobile' => ['nullable', 'string', 'regex:/^(\+20|0)?1[0125][0-9]{8}$/', Rule::unique('users', 'mobile')->ignore($membership->user_id)],
            'governorate_id' => ['nullable', 'integer', Rule::exists('governorates', 'id')],
            'preferred_locale' => ['nullable', Rule::in(ev_locales())],
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function attributes(): array
    {
        return ['name' => __('auth.fields.name'), 'email' => __('auth.fields.email'), 'mobile' => __('auth.fields.mobile'), 'governorate_id' => __('core.labels.governorate'), 'preferred_locale' => __('core.labels.language'), 'reason' => __('core.labels.reason')];
    }
}
