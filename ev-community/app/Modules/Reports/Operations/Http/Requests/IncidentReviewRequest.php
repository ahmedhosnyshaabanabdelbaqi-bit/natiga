<?php

namespace App\Modules\Reports\Operations\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class IncidentReviewRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('incidents.manage') ?? false;
    }

    public function rules(): array
    {
        return [
            'root_cause' => ['nullable', 'string', 'max:4000'],
            'resolution' => ['nullable', 'string', 'max:4000'],
            'corrective_actions' => ['nullable', 'string', 'max:4000'],
            'review' => ['nullable', 'array'],
            'review.what_went_well' => ['nullable', 'string', 'max:4000'],
            'review.what_went_wrong' => ['nullable', 'string', 'max:4000'],
            'review.action_items' => ['nullable', 'string', 'max:4000'],
            'review.timeline_summary' => ['nullable', 'string', 'max:4000'],
        ];
    }

    public function attributes(): array
    {
        return ['root_cause' => __('operations.incidents.fields.root_cause'), 'resolution' => __('operations.incidents.fields.resolution'), 'corrective_actions' => __('operations.incidents.fields.corrective_actions')];
    }
}
