<?php

namespace App\Modules\Members\Http\Requests\Member;

use App\Modules\Members\Actions\UpdateMemberProfile;
use App\Modules\System\Services\Settings;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateOwnProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->membership !== null;
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
        return [
            'mobile' => [Settings::bool('members.require_mobile', true) ? 'required' : 'nullable', 'string', 'regex:/^(\+20|0)?1[0125][0-9]{8}$/', Rule::unique('users', 'mobile')->ignore($this->user()->id)],
            'governorate_id' => ['nullable', 'integer', Rule::exists('governorates', 'id')],
            'preferred_locale' => ['required', Rule::in(ev_locales())],
            'referral_source' => ['nullable', 'string', 'max:100'],
        ];
    }

    public function attributes(): array
    {
        return ['mobile' => __('auth.fields.mobile'), 'governorate_id' => __('core.labels.governorate'), 'preferred_locale' => __('core.labels.language'), 'referral_source' => __('auth.register.referral_source')];
    }
}
