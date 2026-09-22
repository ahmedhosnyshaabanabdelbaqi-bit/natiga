<?php

namespace App\Modules\Notifications\Models;

use App\Models\User;
use Database\Factories\Notifications\EmailTemplateFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Admin override of the email text for one notification key. Absent row = defaults from lang/TemplateRegistry.
 *
 * @property int $id
 * @property string $key
 * @property string|null $subject_ar
 * @property string|null $subject_en
 * @property string|null $body_ar
 * @property string|null $body_en
 * @property string[]|null $variables
 * @property bool $is_system
 * @property int|null $updated_by
 */
class EmailTemplate extends Model
{
    /** @use HasFactory<EmailTemplateFactory> */
    use HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['variables' => 'array', 'is_system' => 'bool'];
    }

    protected static function newFactory(): EmailTemplateFactory
    {
        return EmailTemplateFactory::new();
    }

    public function getRouteKeyName(): string
    {
        return 'key';
    }

    public function editor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function subject(string $locale): ?string
    {
        $value = $locale === 'ar' ? $this->subject_ar : $this->subject_en;

        return $value !== null && trim($value) !== '' ? $value : null;
    }

    public function body(string $locale): ?string
    {
        $value = $locale === 'ar' ? $this->body_ar : $this->body_en;

        return $value !== null && trim($value) !== '' ? $value : null;
    }
}
