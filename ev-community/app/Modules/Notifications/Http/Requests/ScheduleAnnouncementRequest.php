<?php

namespace App\Modules\Notifications\Http\Requests;

use App\Modules\Notifications\Models\AnnouncementCampaign;
use Illuminate\Foundation\Http\FormRequest;

/** Schedule a draft/scheduled campaign. The time is interpreted in the app timezone (Africa/Cairo) when no offset is given. */
class ScheduleAnnouncementRequest extends FormRequest
{
    public function authorize(): bool
    {
        $campaign = $this->route('campaign');

        return $campaign instanceof AnnouncementCampaign && ($this->user()?->can('update', $campaign) ?? false);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'scheduled_at' => ['required', 'date', 'after:now', 'before:+1 year'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['scheduled_at' => __('notifications.admin.fields.scheduled_at')];
    }
}
