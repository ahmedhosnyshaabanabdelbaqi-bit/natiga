<?php

namespace App\Modules\Garage\Http\Requests;

use App\Modules\Vehicles\Models\Enums\VehicleStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ChangeStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        $vehicle = $this->route('vehicle');

        return $vehicle !== null && ($this->user()?->can('update', $vehicle) ?? false);
    }

    public function rules(): array
    {
        return [
            'status' => ['required', Rule::enum(VehicleStatus::class)],
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }
}
