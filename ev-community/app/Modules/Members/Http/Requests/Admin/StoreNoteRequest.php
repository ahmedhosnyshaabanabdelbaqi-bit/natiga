<?php

namespace App\Modules\Members\Http\Requests\Admin;

use App\Modules\Members\Models\Membership;
use Illuminate\Foundation\Http\FormRequest;

class StoreNoteRequest extends FormRequest
{
    public function authorize(): bool
    {
        $membership = $this->route('membership');

        return $membership instanceof Membership && (bool) $this->user()?->can('addNote', $membership);
    }

    public function rules(): array
    {
        return [
            'body' => ['required', 'string', 'min:2', 'max:2000'],
            'is_pinned' => ['nullable', 'boolean'],
        ];
    }

    public function attributes(): array
    {
        return ['body' => __('core.labels.notes')];
    }
}
