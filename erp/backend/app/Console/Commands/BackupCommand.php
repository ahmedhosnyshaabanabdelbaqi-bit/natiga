<?php

namespace App\Console\Commands;

use App\Models\BackupRun;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

/**
 * نسخة احتياطية مشفرة لقاعدة البيانات.
 *
 * التشفير بـ AES-256 عبر openssl بمفتاح من متغير البيئة ERP_BACKUP_KEY.
 * وجود الملف ليس دليلًا على نجاح الاستعادة — استخدم erp:restore-test للتحقق الفعلي.
 */
class BackupCommand extends Command
{
    protected $signature = 'erp:backup
        {--path= : مجلد الحفظ (افتراضي storage/app/backups)}
        {--no-encrypt : حفظ بلا تشفير — غير موصى به}';

    protected $description = 'إنشاء نسخة احتياطية مشفرة من قاعدة البيانات';

    public function handle(): int
    {
        $dir = $this->option('path') ?: storage_path('app/backups');

        if (! is_dir($dir) && ! mkdir($dir, 0700, true) && ! is_dir($dir)) {
            $this->error("تعذّر إنشاء المجلد {$dir}");

            return self::FAILURE;
        }

        $encrypt = ! $this->option('no-encrypt');
        $key = env('ERP_BACKUP_KEY');

        if ($encrypt && ! $key) {
            $this->error('ERP_BACKUP_KEY غير معرّف. عرّفه أو استخدم --no-encrypt صراحةً.');

            return self::FAILURE;
        }

        $stamp = now()->format('Ymd-His');
        $dumpPath = "{$dir}/erp-{$stamp}.sql.gz";
        $finalPath = $encrypt ? "{$dumpPath}.enc" : $dumpPath;

        $run = BackupRun::create([
            'kind' => 'full',
            'status' => 'running',
            'is_encrypted' => $encrypt,
            'started_at' => now(),
        ]);

        $config = config('database.connections.pgsql');

        $this->info('جارٍ إنشاء النسخة…');

        $dump = Process::fromShellCommandline(
            'pg_dump --no-owner --no-privileges --format=plain --dbname="$DBNAME" '
            .'--host="$DBHOST" --port="$DBPORT" --username="$DBUSER" | gzip -9 > "$OUT"',
            null,
            [
                'PGPASSWORD' => (string) $config['password'],
                'DBNAME' => (string) $config['database'],
                'DBHOST' => (string) $config['host'],
                'DBPORT' => (string) $config['port'],
                'DBUSER' => (string) $config['username'],
                'OUT' => $dumpPath,
            ],
            null,
            1800,
        );

        $dump->run();

        if (! $dump->isSuccessful()) {
            $run->update(['status' => 'failed', 'error' => $dump->getErrorOutput(), 'finished_at' => now()]);
            $this->error('فشل إنشاء النسخة: '.$dump->getErrorOutput());

            return self::FAILURE;
        }

        if ($encrypt) {
            $this->info('جارٍ التشفير…');

            $enc = Process::fromShellCommandline(
                'openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$IN" -out "$OUT" -pass env:ERP_BACKUP_KEY',
                null,
                ['IN' => $dumpPath, 'OUT' => $finalPath, 'ERP_BACKUP_KEY' => (string) $key],
                null,
                600,
            );

            $enc->run();

            if (! $enc->isSuccessful()) {
                $run->update(['status' => 'failed', 'error' => $enc->getErrorOutput(), 'finished_at' => now()]);
                $this->error('فشل التشفير: '.$enc->getErrorOutput());

                return self::FAILURE;
            }

            @unlink($dumpPath);
        }

        $size = filesize($finalPath);
        $hash = hash_file('sha256', $finalPath);

        $run->update([
            'status' => 'success',
            'file_path' => $finalPath,
            'size_bytes' => $size,
            'sha256' => $hash,
            'finished_at' => now(),
        ]);

        $this->newLine();
        $this->info('تمت النسخة الاحتياطية.');
        $this->line("الملف   : {$finalPath}");
        $this->line('الحجم   : '.number_format($size / 1048576, 2).' ميجابايت');
        $this->line("البصمة  : {$hash}");
        $this->newLine();
        $this->warn('وجود الملف ليس دليلًا على نجاح الاستعادة. شغّل erp:restore-test للتحقق الفعلي،');
        $this->warn('واحفظ نسخة خارج جهاز التشغيل.');

        return self::SUCCESS;
    }
}
