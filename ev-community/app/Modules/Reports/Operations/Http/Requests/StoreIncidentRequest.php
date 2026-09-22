<?php

namespace App\Modules\Reports\Operations\Http\Requests;

use App\Modules\Reports\Operations\Models\Enums\ExceptionSeverity;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreIncidentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('incidents.manage') ?? false;
    }

    protected function prepareForValidation(): void
    {
        foreach (['started_at', 'detected_at', 'owner', 'affected_module'] as $key) {
            if ($this->has($key) && $this->input($key) === '') {
                $this->merge([$key => null]);
            }
        }
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'min:5', 'max:255'],
            'severity' => ['required', Rule::in(ExceptionSeverity::values())],
            'affected_module' => ['nullable', 'string', Rule::in(array_keys(config('ev.modules', [])))],
            'impact' => ['nullable', 'string', 'max:2000'],
            'started_at' => ['nullable', 'date'],
            'detected_at' => array_values(array_filter(['nullable', 'date', $this->filled('started_at') ? 'after_or_equal:started_at' : null])),
            'owner' => ['nullable', 'string', 'exists:users,public_id'],
        ];
    }

    public function attributes(): array
    {
        return ['title' => __('operations.incidents.fields.title'), 'severity' => __('operations.incidents.fields.severity'), 'affected_module' => __('operations.incidents.fields.affected_module'), 'impact' => __('operations.incidents.fields.impact'), 'started_at' => __('operations.incidents.fields.started_at'), 'detected_at' => __('operations.incidents.fields.detected_at'), 'owner' => __('operations.incidents.fields.owner')];
    }
}
