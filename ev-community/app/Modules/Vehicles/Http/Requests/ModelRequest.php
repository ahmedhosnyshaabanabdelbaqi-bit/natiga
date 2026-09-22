<?php

namespace App\Modules\Vehicles\Http\Requests;

use App\Modules\Vehicles\Models\VehicleModel;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ModelRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('vehicles.manage_master') ?? false;
    }

    public function rules(): array
    {
        return [
            'vehicle_make_id' => ['required', 'integer', Rule::exists('vehicle_makes', 'id')],
            'name_ar' => ['required', 'string', 'max:120'],
            'name_en' => ['required', 'string', 'max:120'],
            'slug' => ['nullable', 'string', 'alpha_dash:ascii', 'max:80'],
            'model_code' => ['nullable', 'string', 'max:40'],
            'body_type' => ['nullable', 'string', Rule::in(VehicleModel::BODY_TYPES)],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:-1000', 'max:1000'],
        ];
    }
}
