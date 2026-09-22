<?php

namespace App\Modules\Notifications\Http\Requests;

use App\Modules\Notifications\Models\Enums\NotificationChannel;
use App\Modules\Notifications\Services\NotificationPreferences;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * `preferences` = { category: { channel: bool } }, `consents` = { sms?: bool, whatsapp?: bool }.
 * The member can only ever change their own preferences (the user comes from the session, never the payload).
 * Disabling a locked transactional pair is rejected with 422 by NotificationPreferences::update().
 */
class UpdatePreferencesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'preferences' => ['sometimes', 'array'],
            'preferences.*' => ['array'],
            'preferences.*.*' => ['boolean'],
            'consents' => ['sometimes', 'array'],
            'consents.sms' => ['sometimes', 'boolean'],
            'consents.whatsapp' => ['sometimes', 'boolean'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                foreach ((array) $this->input('preferences', []) as $category => $channels) {
                    if (! is_string($category) || ! NotificationPreferences::isCategory($category)) {
                        $validator->errors()->add('preferences', __('notifications.errors.unknown_category'));

                        return;
                    }
                    foreach (array_keys((array) $channels) as $channel) {
                        if (NotificationChannel::tryFrom((string) $channel) === null) {
                            $validator->errors()->add("preferences.{$category}", __('notifications.errors.unknown_channel'));

                            return;
                        }
                    }
                }
            },
        ];
    }
}
