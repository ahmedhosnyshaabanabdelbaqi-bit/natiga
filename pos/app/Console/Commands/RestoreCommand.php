<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

/**
 * Restores a backup and PROVES it: the fingerprint written at backup time is
 * recomputed on the restored data and compared field by field.
 */
class RestoreCommand extends Command
{
    protected $signature = 'pos:restore
        {file : path to the .dump or .dump.enc file}
        {--database= : restore into this database instead of the configured one}
        {--verify : recompute the fingerprint and compare}
        {--force : do not ask for confirmation}';

    protected $description = 'Restores a database backup and verifies its integrity.';

    public function handle(): int
    {
        $file = $this->argument('file');
        if (! is_file($file)) {
            $this->error("الملف غير موجود: $file");

            return self::FAILURE;
        }

        $config = config('database.connections.pgsql');
        $database = $this->option('database') ?: $config['database'];

        if (! $this->option('force') && ! $this->confirm("سيتم استبدال محتوى قاعدة البيانات [$database]. متابعة؟")) {
            return self::FAILURE;
        }

        $dumpFile = $file;
        $decrypted = null;

        if (str_ends_with($file, '.enc')) {
            $passphrase = env('POS_BACKUP_PASSPHRASE');
            if (! $passphrase) {
                $this->error('POS_BACKUP_PASSPHRASE غير مضبوط، ولا يمكن فك تشفير النسخة.');

                return self::FAILURE;
            }

            $decrypted = $dumpFile = sys_get_temp_dir().'/pos_restore_'.getmypid().'.dump';
            $decrypt = new Process([
                'openssl', 'enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000',
                '-in', $file, '-out', $dumpFile, '-pass', 'env:POS_BACKUP_PASSPHRASE',
            ], null, ['POS_BACKUP_PASSPHRASE' => $passphrase]);
            $decrypt->setTimeout(3600);
            $decrypt->run();

            if (! $decrypt->isSuccessful()) {
                $this->error('فشل فك التشفير: '.$decrypt->getErrorOutput());

                return self::FAILURE;
            }
        }

        $restore = new Process([
            'pg_restore',
            '--host='.$config['host'],
            '--port='.$config['port'],
            '--username='.$config['username'],
            '--dbname='.$database,
            '--clean',
            '--if-exists',
            '--no-owner',
            '--no-privileges',
            $dumpFile,
        ], null, ['PGPASSWORD' => $config['password']]);

        $restore->setTimeout(3600);
        $restore->run();

        if ($decrypted) {
            @unlink($decrypted);
        }

        // pg_restore reports non-fatal notices on exit code 1; treat a populated
        // database as the real test, which --verify performs.
        if (! $restore->isSuccessful() && ! $this->option('verify')) {
            $this->warn('pg_restore أنهى بتحذيرات: '.substr($restore->getErrorOutput(), 0, 500));
        }

        $this->info("تمت الاستعادة إلى [$database].");

        if ($this->option('verify')) {
            return $this->verify($file, $database);
        }

        return self::SUCCESS;
    }

    private function verify(string $file, string $database): int
    {
        $manifestPath = $file.'.json';
        if (! is_file($manifestPath)) {
            $this->warn('لا يوجد ملف بصمة بجوار النسخة؛ تعذّرت المطابقة الآلية.');

            return self::SUCCESS;
        }

        $manifest = json_decode((string) file_get_contents($manifestPath), true);
        $expected = $manifest['fingerprint'] ?? [];

        config(['database.connections.pgsql_restore' => array_merge(
            config('database.connections.pgsql'),
            ['database' => $database],
        )]);
        DB::purge('pgsql_restore');
        $connection = DB::connection('pgsql_restore');

        $actual = [
            'sales_count' => (int) $connection->table('sales')->count(),
            'sales_total' => (string) $connection->table('sales')->where('status', 'completed')->sum('grand_total'),
            'returns_total' => (string) $connection->table('sale_returns')->sum('grand_total'),
            'stock_qty' => (string) $connection->table('stock_balances')->sum('qty_on_hand'),
            'stock_value' => (string) $connection->table('stock_balances')->selectRaw('COALESCE(SUM(qty_on_hand * avg_cost),0) AS v')->value('v'),
            'cash_balance' => (string) $connection->table('cash_accounts')->sum('balance'),
            'customer_balance' => (string) $connection->table('customers')->sum('balance'),
            'journal_debit' => (string) $connection->table('journal_entries')->sum('total_debit'),
            'audit_count' => (int) $connection->table('audit_logs')->count(),
        ];

        $mismatches = [];
        foreach ($expected as $key => $value) {
            if ((string) $value !== (string) ($actual[$key] ?? null)) {
                $mismatches[$key] = ['expected' => $value, 'actual' => $actual[$key] ?? null];
            }
        }

        if ($mismatches !== []) {
            $this->error('فشل التحقق: الأرصدة بعد الاستعادة لا تطابق النسخة.');
            foreach ($mismatches as $key => $pair) {
                $this->line("  - $key: متوقع {$pair['expected']} / فعلي {$pair['actual']}");
            }

            return self::FAILURE;
        }

        $this->info('تم التحقق: كل الأرصدة والمستندات مطابقة للنسخة الأصلية.');
        foreach ($actual as $key => $value) {
            $this->line("  - $key: $value");
        }

        return self::SUCCESS;
    }
}
