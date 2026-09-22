<?php

namespace App\Modules\Rbac\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('roles.manage') ?? false;
    }

    public function rules(): array
    {
        return [
            'slug' => ['required', 'string', 'min:3', 'max:40', 'regex:/^[a-z][a-z0-9\-]*$/', 'unique:roles,name'],
            'name_ar' => ['required', 'string', 'min:2', 'max:80'],
            'name_en' => ['required', 'string', 'min:2', 'max:80'],
            'description' => ['nullable', 'string', 'max:255'],
        ];
    }

    public function attributes(): array
    {
        return ['slug' => __('roles.fields.slug'), 'name_ar' => __('roles.fields.name_ar'), 'name_en' => __('roles.fields.name_en'), 'description' => __('roles.fields.description')];
    }
}
