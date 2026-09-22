<?php

namespace App\Modules\Notifications\Models;

use App\Models\User;
use App\Modules\Notifications\Models\Enums\CampaignStatus;
use App\Support\Concerns\HasPublicId;
use Database\Factories\Notifications\AnnouncementCampaignFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Admin announcement sent to a targeted audience through the notification pipeline.
 *
 * @property int $id
 * @property string $public_id
 * @property string $title_ar
 * @property string $title_en
 * @property string $body_ar
 * @property string $body_en
 * @property string|null $url
 * @property string $category
 * @property string $audience_type
 * @property array<string, mixed>|null $audience_params
 * @property string[] $channels
 * @property bool $is_marketing
 * @property CampaignStatus $status
 * @property Carbon|null $scheduled_at
 * @property Carbon|null $started_at
 * @property Carbon|null $finished_at
 * @property int $recipients_count
 * @property int $sent_count
 * @property int $failed_count
 * @property string|null $last_error
 * @property int|null $created_by
 * @property int|null $updated_by
 */
class AnnouncementCampaign extends Model
{
    /** @use HasFactory<AnnouncementCampaignFactory> */
    use HasFactory, HasPublicId;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'audience_params' => 'array',
            'channels' => 'array',
            'is_marketing' => 'bool',
            'status' => CampaignStatus::class,
            'scheduled_at' => 'datetime',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
            'recipients_count' => 'int',
            'sent_count' => 'int',
            'failed_count' => 'int',
        ];
    }

    protected static function newFactory(): AnnouncementCampaignFactory
    {
        return AnnouncementCampaignFactory::new();
    }

    public function recipients(): HasMany
    {
        return $this->hasMany(AnnouncementRecipient::class, 'campaign_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function title(?string $locale = null): string
    {
        $locale ??= app()->getLocale();

        return $locale === 'ar' ? $this->title_ar : $this->title_en;
    }

    /** Dedup key shared by every notification produced by this campaign (a re-run never duplicates). */
    public function dedupKey(): string
    {
        return 'announcement:'.$this->id;
    }
}
