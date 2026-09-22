<?php

namespace App\Modules\Reports\Operations\Console;

use App\Modules\Reports\Operations\Services\HealthChecks;
use Illuminate\Console\Command;

/**
 * Runs every registered health/data-quality check and routes findings to the Exception Center.
 * Scheduled daily at 06:00 Africa/Cairo (OperationsServiceProvider); safe to run manually at any time.
 */
class DailyChecksCommand extends Command
{
    protected $signature = 'ev:daily-checks {--only=* : Run only the given check keys} {--list : List registered checks and exit}';

    protected $description = 'Run registered operations/data-quality checks and raise exceptions in the Exception Center';

    public function handle(): int
    {
        $keys = HealthChecks::keys();
        if ($this->option('list')) {
            $this->components->bulletList($keys ?: ['(no checks registered)']);

            return self::SUCCESS;
        }
        $only = array_values(array_filter((array) $this->option('only')));
        $results = HealthChecks::run($only === [] ? null : $only);
        if ($results === []) {
            $this->components->warn('No checks ran.');

            return self::SUCCESS;
        }
        foreach ($results as $result) {
            $this->components->twoColumnDetail(sprintf('%s%s', $result['key'], $result['message'] ? '  '.$result['message'] : ''), strtoupper($result['status']));
        }
        $raised = count(array_filter($results, fn ($r) => $r['status'] === 'raised'));
        $errors = count(array_filter($results, fn ($r) => $r['status'] === 'error'));
        $this->newLine();
        $this->components->info(sprintf('%d checks: %d raised, %d errors', count($results), $raised, $errors));

        return $errors > 0 ? self::FAILURE : self::SUCCESS;
    }
}
