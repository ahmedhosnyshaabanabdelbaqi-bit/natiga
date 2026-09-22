<?php

declare(strict_types=1);

namespace Tests\Concurrency;

use App\Modules\Sales\Data\SaleRequest;
use App\Modules\Sales\Services\ReturnService;
use App\Modules\Sales\Services\SaleService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\Support\PosTestFixture;
use Tests\TestCase;

/**
 * Acceptance 17: take a backup, restore it into a separate database, and prove
 * that balances and documents match. A backup nobody has restored is not a
 * backup.
 *
 * Lives in the Concurrency suite because it needs COMMITTED data that external
 * processes (pg_dump / pg_restore) can see.
 */
class BackupRestoreTest extends TestCase
{
    private PosTestFixture $fixture;

    private string $backupDir;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['pg_dump', 'pg_restore', 'openssl'] as $binary) {
            if (! $this->binaryExists($binary)) {
                $this->markTestSkipped("$binary غير متاح في بيئة الاختبار.");
            }
        }

        Artisan::call('migrate:fresh', ['--force' => true, '--seed' => true]);
        $this->fixture = new PosTestFixture;
        $this->fixture->openShift($this->fixture->manager, '500');

        $this->backupDir = storage_path('app/backups/test-'.uniqid());
    }

    protected function tearDown(): void
    {
        if (is_dir($this->backupDir)) {
            foreach (glob($this->backupDir.'/*') ?: [] as $file) {
                @unlink($file);
            }
            @rmdir($this->backupDir);
        }

        Artisan::call('migrate:fresh', ['--force' => true]);
        parent::tearDown();
    }

    private function binaryExists(string $binary): bool
    {
        exec('command -v '.escapeshellarg($binary), $out, $code);

        return $code === 0;
    }

    public function test_an_encrypted_backup_restores_with_matching_balances_and_documents(): void
    {
        // --- real trading activity to back up -------------------------------
        $product = $this->fixture->product('BK-1', 'صنف النسخ', price: '150.00', cost: '90.00', stock: '20');
        $customer = $this->fixture->customer(credit: true, limit: '10000');

        $cashSale = app(SaleService::class)->checkout(SaleRequest::fromArray([
            'lines' => [['variant_id' => $this->fixture->variantOf($product)->id, 'product_unit_id' => $this->fixture->baseUnitId($product), 'qty' => '3']],
            'payments' => [['payment_method_id' => $this->fixture->method('cash')->id, 'amount' => '450.00', 'tendered_amount' => '500.00']],
        ]))['sale'];

        $creditSale = app(SaleService::class)->checkout(SaleRequest::fromArray([
            'customer_id' => $customer->id,
            'is_credit' => true,
            'lines' => [['variant_id' => $this->fixture->variantOf($product)->id, 'product_unit_id' => $this->fixture->baseUnitId($product), 'qty' => '2']],
            'payments' => [['payment_method_id' => $this->fixture->method('cash')->id, 'amount' => '100.00', 'tendered_amount' => '100.00']],
        ]))['sale'];

        app(ReturnService::class)->process([
            'sale_id' => $cashSale->id,
            'lines' => [['sale_line_id' => $cashSale->lines->first()->id, 'qty' => '1']],
            'reason' => 'اختبار النسخ الاحتياطي',
        ]);

        $before = $this->snapshot(DB::connection());

        // --- back up ---------------------------------------------------------
        putenv('POS_BACKUP_PASSPHRASE=test-passphrase-not-a-real-secret');
        $_ENV['POS_BACKUP_PASSPHRASE'] = 'test-passphrase-not-a-real-secret';

        $exit = Artisan::call('pos:backup', ['--path' => $this->backupDir, '--keep' => 5]);
        $this->assertSame(0, $exit, Artisan::output());

        $files = glob($this->backupDir.'/pos_*.dump.enc');
        $this->assertCount(1, $files, 'تم إنشاء ملف نسخة مشفر واحد');
        $backupFile = $files[0];

        // The dump is genuinely encrypted, not a readable pg_dump file.
        $head = (string) file_get_contents($backupFile, false, null, 0, 16);
        $this->assertStringStartsWith('Salted__', $head, 'الملف مشفر بـ AES مع ملح');
        $this->assertStringNotContainsString('PGDMP', $head);

        $manifest = json_decode((string) file_get_contents($backupFile.'.json'), true);
        $this->assertTrue($manifest['encrypted']);
        $this->assertSame(hash_file('sha256', $backupFile), $manifest['sha256']);

        // --- restore into a SEPARATE database and verify ----------------------
        $exit = Artisan::call('pos:restore', [
            'file' => $backupFile,
            '--database' => 'pos_restore_test',
            '--verify' => true,
            '--force' => true,
        ]);

        $output = Artisan::output();
        $this->assertSame(0, $exit, 'فشل التحقق من الاستعادة: '.$output);
        $this->assertStringContainsString('تم التحقق', $output);

        // --- independently re-check the restored data ------------------------
        config(['database.connections.pgsql_verify' => array_merge(
            config('database.connections.pgsql'),
            ['database' => 'pos_restore_test'],
        )]);
        DB::purge('pgsql_verify');
        $restored = DB::connection('pgsql_verify');

        $after = $this->snapshot($restored);
        $this->assertSame($before, $after, 'الأرصدة والمستندات بعد الاستعادة مطابقة');

        // Specific documents survive intact, not just the totals.
        $restoredSale = $restored->table('sales')->where('number', $cashSale->number)->first();
        $this->assertNotNull($restoredSale);
        $this->assertSame($cashSale->grand_total, $restoredSale->grand_total);
        $this->assertSame($cashSale->change_total, $restoredSale->change_total);

        $restoredCredit = $restored->table('sales')->where('number', $creditSale->number)->first();
        $this->assertSame('200.0000', $restoredCredit->due_total);

        // The append-only audit trail came back too.
        $this->assertGreaterThan(0, $restored->table('audit_logs')->count());

        $restored->disconnect();
    }

    /** @return array<string,string> */
    private function snapshot($connection): array
    {
        return [
            'sales' => (string) $connection->table('sales')->count(),
            'sale_lines' => (string) $connection->table('sale_lines')->count(),
            'sales_total' => (string) $connection->table('sales')->sum('grand_total'),
            'returns_total' => (string) $connection->table('sale_returns')->sum('grand_total'),
            'stock_qty' => (string) $connection->table('stock_balances')->sum('qty_on_hand'),
            'stock_value' => (string) $connection->table('stock_balances')->selectRaw('COALESCE(SUM(qty_on_hand*avg_cost),0) v')->value('v'),
            'movements' => (string) $connection->table('stock_movements')->count(),
            'cash_balance' => (string) $connection->table('cash_accounts')->sum('balance'),
            'cash_movements' => (string) $connection->table('cash_movements')->count(),
            'customer_balance' => (string) $connection->table('customers')->sum('balance'),
            'journal_debit' => (string) $connection->table('journal_entries')->sum('total_debit'),
            'journal_credit' => (string) $connection->table('journal_entries')->sum('total_credit'),
        ];
    }
}
