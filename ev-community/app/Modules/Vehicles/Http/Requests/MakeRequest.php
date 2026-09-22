<?php

namespace App\Modules\Vehicles\Http\Requests;

use App\Modules\Files\Rules\SafeUpload;
use Illuminate\Foundation\Http\FormRequest;

class MakeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('vehicles.manage_master') ?? false;
    }

    public function rules(): array
    {
        return [
            'name_ar' => ['required', 'string', 'max:120'],
            'name_en' => ['required', 'string', 'max:120'],
            'slug' => ['nullable', 'string', 'alpha_dash:ascii', 'max:80'],
            'country_code' => ['nullable', 'string', 'size:2', 'alpha:ascii'],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:-1000', 'max:1000'],
            'logo' => ['nullable', 'file', new SafeUpload('image')],
            'remove_logo' => ['nullable', 'boolean'],
        ];
    }
}
