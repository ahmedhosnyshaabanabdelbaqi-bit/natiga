<?php

namespace App\Modules\Notifications\Http\Requests;

use App\Modules\Notifications\Models\EmailTemplate;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Subject/body per locale. Empty fields fall back to the default text. HTML and undeclared `{{variables}}` are
 * rejected by EmailTemplateService (422 on the offending field).
 */
class UpdateEmailTemplateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', EmailTemplate::class) ?? false;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'subject_ar' => ['nullable', 'string', 'max:255'],
            'subject_en' => ['nullable', 'string', 'max:255'],
            'body_ar' => ['nullable', 'string', 'max:10000'],
            'body_en' => ['nullable', 'string', 'max:10000'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'subject_ar' => __('notifications.email_templates.subject_ar'),
            'subject_en' => __('notifications.email_templates.subject_en'),
            'body_ar' => __('notifications.email_templates.body_ar'),
            'body_en' => __('notifications.email_templates.body_en'),
        ];
    }
}
