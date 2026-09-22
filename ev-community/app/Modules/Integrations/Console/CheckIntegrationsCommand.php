<?php

namespace App\Modules\Integrations\Console;

use App\Modules\Integrations\Contracts\Data\HealthStatus;
use App\Modules\Integrations\Services\IntegrationManager;
use Illuminate\Console\Command;

class CheckIntegrationsCommand extends Command
{
    protected $signature = 'integrations:check {key? : One category (payment|map|email|sms|whatsapp|shipping|charging|exchange_rate); all when omitted} {--json : Machine readable output}';

    protected $description = 'Run integration health checks, persist their status and log the results';

    public function handle(IntegrationManager $manager): int
    {
        $key = $this->argument('key');
        if ($key !== null && ! in_array($key, IntegrationManager::CATEGORIES, true)) {
            $this->error(__('integrations.command.unknown_key', ['key' => $key, 'keys' => implode(', ', IntegrationManager::CATEGORIES)]));

            return self::INVALID;
        }

        $rows = [];
        $unavailable = 0;
        foreach ($key !== null ? [$key] : IntegrationManager::CATEGORIES as $category) {
            $result = $manager->check($category);
            if ($result->status === HealthStatus::Unavailable) {
                $unavailable++;
            }
            $rows[] = [
                'key' => $category,
                'driver' => $manager->driverLabel($category),
                'status' => $result->status->value,
                'message' => (string) $result->message,
                'checked_at' => $result->checkedAt()->toIso8601String(),
            ];
        }

        if ($this->option('json')) {
            $this->line((string) json_encode($rows, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        } else {
            $this->table([__('integrations.columns.integration'), __('integrations.columns.driver'), __('integrations.columns.status'), __('integrations.columns.message'), __('integrations.columns.last_checked')], $rows);
            $this->info(__('integrations.command.done', ['count' => count($rows), 'unavailable' => $unavailable]));
        }

        return $unavailable > 0 ? self::FAILURE : self::SUCCESS;
    }
}
