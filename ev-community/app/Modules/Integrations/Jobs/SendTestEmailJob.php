<?php

namespace App\Modules\Integrations\Jobs;

use App\Models\User;
use App\Modules\Integrations\Contracts\Data\SendStatus;
use App\Modules\Integrations\Services\Integrations;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

/**
 * Queued "send test email to me". The outcome is visible in integration_events
 * (operation send_test) on the admin integrations page; failures are never retried.
 */
class SendTestEmailJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public readonly int $userId) {}

    public function handle(): void
    {
        $user = User::query()->find($this->userId);
        if (! $user || ! $user->email) {
            return;
        }
        $result = Integrations::email()->sendTest($user->email);
        if ($result->status === SendStatus::Failed) {
            Log::warning('integration.email.test_failed', ['user_id' => $user->id, 'error' => $result->error]);
        }
    }
}
