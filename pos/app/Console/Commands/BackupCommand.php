<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

/**
 * Encrypted, scheduled database backup.
 *
 * `pg_dump` in custom format, then symmetric AES-256 encryption with a key held
 * OUTSIDE the codebase (POS_BACKUP_PASSPHRASE). A backup that has never been
 * restored is not a backup, so `pos:restore --verify` exists and is covered by a
 * test.
 */
class BackupCommand extends Command
{
    protected $signature = 'pos:backup
        {--path= : destination directory (default storage/app/backups)}
        {--keep=14 : how many backups to retain}
        {--no-encrypt : write a plain dump (development only)}';

    protected $description = 'Creates an encrypted database backup.';

    public function handle(): int
    {
        $directory = $this->option('path') ?: storage_path('app/backups');
        if (! is_dir($directory) && ! mkdir($directory, 0750, true) && ! is_dir($directory)) {
            $this->error("تعذر إنشاء مجلد النسخ: $directory");

            return self::FAILURE;
        }

        $config = config('database.connections.pgsql');
        $stamp = now()->format('Ymd_His');
        $dumpFile = "$directory/pos_$stamp.dump";

        $process = new Process([
            'pg_dump',
            '--host='.$config['host'],
            '--port='.$config['port'],
            '--username='.$config['username'],
            '--dbname='.$config['database'],
            '--format=custom',
            '--no-owner',
            '--no-privileges',
            '--file='.$dumpFile,
        ], null, ['PGPASSWORD' => $config['password']]);

        $process->setTimeout(3600);
        $process->run();

        if (! $process->isSuccessful()) {
            $this->error('فشل إنشاء النسخة: '.$process->getErrorOutput());

            return self::FAILURE;
        }

        $finalFile = $dumpFile;

        if (! $this->option('no-encrypt')) {
            $passphrase = env('POS_BACKUP_PASSPHRASE');
            if (! $passphrase) {
                $this->error('POS_BACKUP_PASSPHRASE غير مضبوط. لا تُنشأ نسخة غير مشفرة تلقائيًا.');
                @unlink($dumpFile);

                return self::FAILURE;
            }

            $finalFile = $dumpFile.'.enc';
            $encrypt = new Process([
                'openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt',
                '-in', $dumpFile, '-out', $finalFile, '-pass', 'env:POS_BACKUP_PASSPHRASE',
            ], null, ['POS_BACKUP_PASSPHRASE' => $passphrase]);
            $encrypt->setTimeout(3600);
            $encrypt->run();

            if (! $encrypt->isSuccessful()) {
                $this->error('فشل تشفير النسخة: '.$encrypt->getErrorOutput());

                return self::FAILURE;
            }

            @unlink($dumpFile);
        }

        chmod($finalFile, 0640);

        // A fingerprint of what the restore must reproduce.
        $checks = $this->integrityFingerprint();
        file_put_contents($finalFile.'.json', json_encode([
            'created_at' => now()->toIso8601String(),
            'database' => $config['database'],
            'encrypted' => ! $this->option('no-encrypt'),
            'size_bytes' => filesize($finalFile),
            'sha256' => hash_file('sha256', $finalFile),
            'fingerprint' => $checks,
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        $this->prune($directory, (int) $this->option('keep'));

        $this->info('تم إنشاء النسخة: '.$finalFile);
        $this->line('   الحجم: '.number_format((int) filesize($finalFile) / 1048576, 2).' ميجابايت');
        $this->warn('   احتفظ بنسخة خارج جهاز التشغيل، واختبر الاستعادة دوريًا.');

        return self::SUCCESS;
    }

    /** @return array<string,mixed> Totals a restore must reproduce exactly. */
    private function integrityFingerprint(): array
    {
        return [
            'sales_count' => (int) DB::table('sales')->count(),
            'sales_total' => (string) DB::table('sales')->where('status', 'completed')->sum('grand_total'),
            'returns_total' => (string) DB::table('sale_returns')->sum('grand_total'),
            'stock_qty' => (string) DB::table('stock_balances')->sum('qty_on_hand'),
            'stock_value' => (string) DB::table('stock_balances')->selectRaw('COALESCE(SUM(qty_on_hand * avg_cost),0) AS v')->value('v'),
            'cash_balance' => (string) DB::table('cash_accounts')->sum('balance'),
            'customer_balance' => (string) DB::table('customers')->sum('balance'),
            'journal_debit' => (string) DB::table('journal_entries')->sum('total_debit'),
            'audit_count' => (int) DB::table('audit_logs')->count(),
        ];
    }

    private function prune(string $directory, int $keep): void
    {
        $files = glob("$directory/pos_*.dump*") ?: [];
        $files = array_values(array_filter($files, fn ($f) => ! str_ends_with($f, '.json')));
        usort($files, fn ($a, $b) => filemtime($b) <=> filemtime($a));

        foreach (array_slice($files, $keep) as $old) {
            @unlink($old);
            @unlink($old.'.json');
        }
    }
}
