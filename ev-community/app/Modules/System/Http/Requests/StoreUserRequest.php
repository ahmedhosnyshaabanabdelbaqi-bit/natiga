<?php

namespace App\Modules\System\Http\Requests;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', User::class) ?? false;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'email' => is_string($this->input('email')) ? strtolower(trim($this->input('email'))) : $this->input('email'),
            'mobile' => is_string($this->input('mobile')) && trim($this->input('mobile')) !== '' ? trim($this->input('mobile')) : null,
            'roles' => $this->input('roles', []),
            'permissions' => $this->input('permissions', []),
        ]);
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:3', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique(User::class, 'email')],
            'mobile' => ['nullable', 'string', 'regex:/^(\+20|0)?1[0125][0-9]{8}$/', Rule::unique(User::class, 'mobile')],
            'preferred_locale' => ['nullable', Rule::in(ev_locales())],
            'roles' => ['array', 'max:10'],
            'roles.*' => ['string', 'distinct', 'max:40'],
            'permissions' => ['array', 'max:200'],
            'permissions.*' => ['string', 'distinct', 'max:100'],
        ];
    }

    /** A staff account without any role or permission would have no access at all. */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($this->input('roles', []) === [] && $this->input('permissions', []) === []) {
                    $validator->errors()->add('roles', __('users.errors.access_required'));
                }
            },
        ];
    }

    public function attributes(): array
    {
        return ['name' => __('users.fields.name'), 'email' => __('users.fields.email'), 'mobile' => __('users.fields.mobile'), 'roles' => __('users.fields.roles'), 'permissions' => __('users.fields.permissions'), 'preferred_locale' => __('users.fields.preferred_locale')];
    }
}
