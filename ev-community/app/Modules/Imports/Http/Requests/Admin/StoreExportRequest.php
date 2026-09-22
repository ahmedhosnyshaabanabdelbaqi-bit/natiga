<?php

namespace App\Modules\Imports\Http\Requests\Admin;

use App\Modules\Imports\Models\Enums\ExportFormat;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * POST /admin/exports. Any list page can post here with its current filters:
 *   { type: 'exchange_rates', format: 'xlsx', filters: { base: 'USD' } }
 * The exporter's own permission and filter rules are enforced by ExportService.
 */
class StoreExportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('exports.view') ?? false;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'type' => ['required', 'string', 'regex:/^[a-z][a-z0-9_]{1,59}$/'],
            'format' => ['required', Rule::in(ExportFormat::values())],
            'filters' => ['nullable', 'array'],
        ];
    }

    /** @return array<string, mixed> */
    public function filters(): array
    {
        return (array) ($this->validated('filters') ?? []);
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'type' => __('imports.fields.export_type'),
            'format' => __('imports.fields.format'),
        ];
    }
}
