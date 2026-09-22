<?php

namespace Database\Factories\Notifications;

use App\Modules\Notifications\Models\EmailTemplate;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<EmailTemplate>
 */
class EmailTemplateFactory extends Factory
{
    protected $model = EmailTemplate::class;

    public function definition(): array
    {
        return [
            'key' => 'system.generic',
            'subject_ar' => 'موضوع {{title}}',
            'subject_en' => 'Subject {{title}}',
            'body_ar' => 'مرحبًا {{member_name}}، {{body}}',
            'body_en' => 'Hello {{member_name}}, {{body}}',
            'variables' => ['member_name', 'title', 'body'],
            'is_system' => true,
            'updated_by' => null,
        ];
    }
}
