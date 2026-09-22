<?php

namespace App\Modules\Notifications\Http\Requests;

use App\Modules\Notifications\Models\AnnouncementCampaign;
use Illuminate\Foundation\Http\FormRequest;

/** AR/EN preview of an announcement (in-app card + email) from the unsaved form values. */
class PreviewAnnouncementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', AnnouncementCampaign::class) ?? false;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'title_ar' => ['nullable', 'string', 'max:255'],
            'title_en' => ['nullable', 'string', 'max:255'],
            'body_ar' => ['nullable', 'string', 'max:5000'],
            'body_en' => ['nullable', 'string', 'max:5000'],
            'url' => ['nullable', 'string', 'max:2048'],
        ];
    }
}
