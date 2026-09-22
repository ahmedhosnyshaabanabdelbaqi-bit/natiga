<?php

namespace App\Modules\System\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateUserAccessRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('roles.manage') ?? false;
    }

    public function rules(): array
    {
        return [
            'roles' => ['present', 'array', 'max:10'],
            'roles.*' => ['string', 'max:40'],
            'permissions' => ['present', 'array', 'max:200'],
            'permissions.*' => ['string', 'max:100'],
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function attributes(): array
    {
        return ['roles' => __('users.fields.roles'), 'permissions' => __('users.fields.permissions'), 'reason' => __('core.labels.reason')];
    }
}
