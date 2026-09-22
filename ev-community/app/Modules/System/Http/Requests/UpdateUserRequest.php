<?php

namespace App\Modules\System\Http\Requests;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('users.manage') ?? false;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'email' => is_string($this->input('email')) ? strtolower(trim($this->input('email'))) : $this->input('email'),
            'mobile' => is_string($this->input('mobile')) && trim($this->input('mobile')) !== '' ? trim($this->input('mobile')) : null,
        ]);
    }

    public function rules(): array
    {
        /** @var User $target */
        $target = $this->route('user');

        return [
            'name' => ['required', 'string', 'min:3', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique(User::class, 'email')->ignore($target->id)],
            'mobile' => ['nullable', 'string', 'regex:/^(\+20|0)?1[0125][0-9]{8}$/', Rule::unique(User::class, 'mobile')->ignore($target->id)],
            'preferred_locale' => ['nullable', Rule::in(ev_locales())],
        ];
    }

    public function attributes(): array
    {
        return ['name' => __('users.fields.name'), 'email' => __('users.fields.email'), 'mobile' => __('users.fields.mobile'), 'preferred_locale' => __('users.fields.preferred_locale')];
    }
}
