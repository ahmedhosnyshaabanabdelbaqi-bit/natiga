<?php

namespace App\Console\Commands;

use App\Models\BackupRun;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

/**
 * اختبار استعادة فعلي: يستعيد النسخة إلى قاعدة مؤقتة، يقارن عدد الصفوف
 * في الجداول الحرجة مع القاعدة الحية، ثم يحذف القاعدة المؤقتة.
 *
 * هذا هو الدليل الوحيد المقبول على أن النسخة قابلة للاستعادة.
 */
class RestoreTestCommand extends Command
{
    protected $signature = 'erp:restore-test
        {file? : مسار ملف النسخة (افتراضي آخر نسخة ناجحة)}
        {--keep : الإبقاء على القاعدة المؤقتة بعد الاختبار}';

    protected $description = 'اختبار استعادة نسخة احتياطية والتحقق من سلامتها';

    /** الجداول التي تُقارن صفوفها بعد الاستعادة. */
    private const CRITICAL_TABLES = [
        'companies', 'accounts', 'journal_entries', 'journal_lines',
        'items', 'customers', 'suppliers', 'stock_movements', 'stock_balances',
        'sales_invoices', 'sales_invoice_lines', 'customer_receipts', 'audit_logs',
    ];

    public function handle(): int
    {
        $run = null;
        $file = $this->argument('file');

        if (! $file) {
            $run = BackupRun::where('status', 'success')->latest('id')->first();

            if (! $run?->file_path) {
                $this->error('لا توجد نسخة احتياطية ناجحة مسجلة. شغّل erp:backup أولًا.');

                return self::FAILURE;
            }

            $file = $run->file_path;
        }

        if (! is_file($file)) {
            $this->error("الملف غير موجود: {$file}");

            return self::FAILURE;
        }

        // التحقق من البصمة قبل أي استعادة
        if ($run?->sha256) {
            $this->info('التحقق من بصمة الملف…');
            $actual = hash_file('sha256', $file);

            if ($actual !== $run->sha256) {
                $run->update(['restore_tested_at' => now(), 'restore_test_result' => 'hash_mismatch']);
                $this->error("بصمة الملف لا تطابق المسجلة — النسخة تالفة أو مُعدَّلة.");

                return self::FAILURE;
            }

            $this->line('البصمة مطابقة.');
        }

        $config = config('database.connections.pgsql');
        $testDb = 'erp_restore_test_'.now()->format('YmdHis');
        $env = [
            'PGPASSWORD' => (string) $config['password'],
            'DBHOST' => (string) $config['host'],
            'DBPORT' => (string) $config['port'],
            'DBUSER' => (string) $config['username'],
        ];

        $sh = fn (string $cmd, array $extra = []) => tap(
            Process::fromShellCommandline($cmd, null, $env + $extra, null, 1800)
        )->run();

        $this->info("إنشاء قاعدة مؤقتة {$testDb}…");
        $create = $sh('createdb --host="$DBHOST" --port="$DBPORT" --username="$DBUSER" "$NEWDB"', ['NEWDB' => $testDb]);

        if (! $create->isSuccessful()) {
            $this->error('تعذّر إنشاء القاعدة المؤقتة: '.$create->getErrorOutput());

            return self::FAILURE;
        }

        $cleanup = function () use ($sh, $testDb) {
            if (! $this->option('keep')) {
                $sh('dropdb --if-exists --host="$DBHOST" --port="$DBPORT" --username="$DBUSER" "$OLDDB"', ['OLDDB' => $testDb]);
            }
        };

        $this->info('جارٍ الاستعادة…');

        $isEncrypted = str_ends_with($file, '.enc');
        $key = env('ERP_BACKUP_KEY');

        if ($isEncrypted && ! $key) {
            $cleanup();
            $this->error('النسخة مشفرة وERP_BACKUP_KEY غير معرّف.');

            return self::FAILURE;
        }

        $pipeline = $isEncrypted
            ? 'openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$IN" -pass env:ERP_BACKUP_KEY | gunzip'
            : 'gunzip -c "$IN"';

        $restore = $sh(
            $pipeline.' | psql --quiet --host="$DBHOST" --port="$DBPORT" --username="$DBUSER" --dbname="$NEWDB" -v ON_ERROR_STOP=1',
            ['IN' => $file, 'NEWDB' => $testDb, 'ERP_BACKUP_KEY' => (string) ($key ?? '')],
        );

        if (! $restore->isSuccessful()) {
            $cleanup();
            $run?->update(['restore_tested_at' => now(), 'restore_test_result' => 'failed']);
            $this->error('فشلت الاستعادة: '.substr($restore->getErrorOutput(), 0, 500));

            return self::FAILURE;
        }

        // مقارنة عدد الصفوف
        $this->info('مقارنة الجداول الحرجة…');

        config(['database.connections.pgsql_restore_test' => array_merge($config, ['database' => $testDb])]);
        DB::purge('pgsql_restore_test');

        $rows = [];
        $mismatches = 0;

        foreach (self::CRITICAL_TABLES as $table) {
            try {
                $live = DB::table($table)->count();
                $restored = DB::connection('pgsql_restore_test')->table($table)->count();
                $ok = $live === $restored;
                $mismatches += $ok ? 0 : 1;
                $rows[] = [$table, $live, $restored, $ok ? '✓' : '✗'];
            } catch (\Throwable $e) {
                $mismatches++;
                $rows[] = [$table, '—', 'خطأ', '✗'];
            }
        }

        // فحص إضافي: هل الدفاتر ما زالت متوازنة بعد الاستعادة؟
        $balance = DB::connection('pgsql_restore_test')
            ->table('journal_entries')
            ->whereColumn('total_debit', '!=', 'total_credit')
            ->count();

        $cleanup();

        $this->newLine();
        $this->table(['الجدول', 'الحي', 'المستعاد', 'مطابق'], $rows);

        $passed = $mismatches === 0 && $balance === 0;

        $run?->update([
            'restore_tested_at' => now(),
            'restore_test_result' => $passed ? 'passed' : 'failed',
        ]);

        if (! $passed) {
            $this->error("فشل اختبار الاستعادة: {$mismatches} جدولًا غير مطابق، و{$balance} قيدًا غير متوازن.");

            return self::FAILURE;
        }

        $this->info('نجح اختبار الاستعادة: كل الجداول الحرجة مطابقة والقيود متوازنة.');

        if ($this->option('keep')) {
            $this->warn("القاعدة المؤقتة {$testDb} لم تُحذف.");
        }

        return self::SUCCESS;
    }
}
