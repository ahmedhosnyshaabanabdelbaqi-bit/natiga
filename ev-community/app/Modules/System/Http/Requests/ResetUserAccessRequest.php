<?php

namespace App\Modules\System\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ResetUserAccessRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('users.manage') ?? false;
    }

    public function rules(): array
    {
        return [
            'reset_mfa' => ['nullable', 'boolean'],
            'reason' => [$this->boolean('reset_mfa') ? 'required' : 'nullable', 'string', 'min:5', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return ['reason.required' => __('core.errors.reason_required'), 'reason.min' => __('core.errors.reason_required')];
    }
}
