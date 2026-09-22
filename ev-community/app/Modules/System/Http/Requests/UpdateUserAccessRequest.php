<?php

namespace App\Modules\System\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateUserAccessRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('roles.manage') ?? false;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['roles' => $this->input('roles', []), 'permissions' => $this->input('permissions', [])]);
    }

    public function rules(): array
    {
        return [
            'roles' => ['present', 'array', 'max:10'],
            'roles.*' => ['string', 'distinct', 'max:40'],
            'permissions' => ['present', 'array', 'max:200'],
            'permissions.*' => ['string', 'distinct', 'max:100'],
            'reason' => ['required', 'string', 'min:5', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return ['reason.required' => __('core.errors.reason_required'), 'reason.min' => __('core.errors.reason_required')];
    }

    public function attributes(): array
    {
        return ['roles' => __('users.fields.roles'), 'permissions' => __('users.fields.permissions'), 'reason' => __('core.labels.reason')];
    }
}
