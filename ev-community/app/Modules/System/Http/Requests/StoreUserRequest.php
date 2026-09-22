<?php

namespace App\Modules\System\Http\Requests;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('users.manage') ?? false;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:3', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique(User::class, 'email')],
            'mobile' => ['nullable', 'string', 'regex:/^(\+20|0)?1[0125][0-9]{8}$/', Rule::unique(User::class, 'mobile')],
            'preferred_locale' => ['nullable', Rule::in(ev_locales())],
            'roles' => ['present', 'array', 'max:10'],
            'roles.*' => ['string', 'max:40'],
            'permissions' => ['nullable', 'array', 'max:200'],
            'permissions.*' => ['string', 'max:100'],
        ];
    }

    public function attributes(): array
    {
        return ['name' => __('users.fields.name'), 'email' => __('users.fields.email'), 'mobile' => __('users.fields.mobile'), 'roles' => __('users.fields.roles'), 'permissions' => __('users.fields.permissions'), 'preferred_locale' => __('users.fields.preferred_locale')];
    }
}
