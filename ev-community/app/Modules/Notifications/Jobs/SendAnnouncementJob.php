<?php

namespace App\Modules\Notifications\Jobs;

use App\Modules\Notifications\Models\AnnouncementCampaign;
use App\Modules\Notifications\Models\Enums\CampaignStatus;
use App\Modules\Notifications\Services\AnnouncementService;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Runs a campaign: chunks the audience (500), creates `announcement_recipients` idempotently and sends through the
 * notification pipeline with the campaign dedup key. Safe to re-run: nothing is duplicated. Errors mark the campaign
 * `failed` (AnnouncementService::run); admins retry it, which only processes recipients not yet sent.
 */
class SendAnnouncementJob implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 3600;

    public int $uniqueFor = 3600;

    public function __construct(public readonly int $campaignId) {}

    public function uniqueId(): string
    {
        return (string) $this->campaignId;
    }

    public function handle(AnnouncementService $service): void
    {
        $service->run($this->campaignId);
    }

    /** Timeouts / worker crashes: the campaign must not stay `sending` forever. */
    public function failed(?Throwable $exception): void
    {
        AnnouncementCampaign::query()->whereKey($this->campaignId)->where('status', CampaignStatus::Sending->value)->update([
            'status' => CampaignStatus::Failed->value,
            'finished_at' => now(),
            'last_error' => mb_substr($exception?->getMessage() ?? 'failed', 0, 2000),
            'updated_at' => now(),
        ]);
    }
}
