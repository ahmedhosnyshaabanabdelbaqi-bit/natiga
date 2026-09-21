<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

/**
 * تحديث الأجزاء المولّدة من الوثائق من المصدر الفعلي:
 *  - جدول مسارات الـAPI في 05-API.md من جدول المسارات وصلاحياتها.
 *  - أعمدة الجداول في 02-DATA-DICTIONARY.md من مخطط قاعدة البيانات.
 *
 * كُتب لأن التحديث اليدوي يترك الوثيقة تتأخر عن الكود بصمت.
 */
class DocsSyncCommand extends Command
{
    protected $signature = 'erp:docs {--check : الإبلاغ عن الفروق دون الكتابة}';

    protected $description = 'تحديث الأجزاء المولّدة من الوثائق من الكود والمخطط الفعليين';

    private const ROUTES_HEADING = '## المسارات';

    public function handle(): int
    {
        $docs = base_path('../docs');

        if (! is_dir($docs)) {
            $this->error("مجلد الوثائق غير موجود: {$docs}");

            return self::FAILURE;
        }

        $changed = 0;
        $changed += $this->syncRoutes($docs.'/05-API.md') ? 1 : 0;
        $changed += $this->syncDictionary($docs.'/02-DATA-DICTIONARY.md') ? 1 : 0;

        if ($this->option('check') && $changed > 0) {
            $this->error("الوثائق متأخرة عن الكود في {$changed} ملف. شغّل: php artisan erp:docs");

            return self::FAILURE;
        }

        $this->info($changed === 0 ? 'الوثائق محدّثة.' : "حُدِّث {$changed} ملف.");

        return self::SUCCESS;
    }

    private function syncRoutes(string $path): bool
    {
        $rows = [];

        foreach (Route::getRoutes() as $route) {
            $uri = $route->uri();

            if (! str_starts_with($uri, 'api/v1')) {
                continue;
            }

            $permission = '—';
            foreach ($route->gatherMiddleware() as $middleware) {
                if (is_string($middleware) && str_starts_with($middleware, 'permission:')) {
                    $permission = str_replace('permission:', '', $middleware);
                }
            }

            foreach ($route->methods() as $method) {
                if ($method === 'HEAD') {
                    continue;
                }
                $rows["{$uri} {$method}"] = "| `{$method}` | `/{$uri}` | {$permission} |";
            }
        }

        ksort($rows);

        $table = "| الطريقة | المسار | الصلاحية المطلوبة |\n|---|---|---|\n".implode("\n", $rows)."\n";

        return $this->replaceSection($path, self::ROUTES_HEADING, $table);
    }

    private function syncDictionary(string $path): bool
    {
        if (! is_file($path)) {
            return false;
        }

        $content = file_get_contents($path);
        $original = $content;

        // كل جدول موصوف بعنوان ثالث المستوى يحمل اسمه
        preg_match_all('/^### `([a-z_]+)`\n\n\| العمود.*?\n(?=\n|### |## |$)/ms', $content, $matches, PREG_SET_ORDER);

        foreach ($matches as [$block, $table]) {
            $columns = $this->columnsOf($table);

            if ($columns === []) {
                continue;
            }

            $rebuilt = "### `{$table}`\n\n| العمود | النوع | يقبل NULL | مرجع |\n|---|---|---|---|\n";
            foreach ($columns as $c) {
                $rebuilt .= "| `{$c['name']}` | {$c['type']} | {$c['null']} | {$c['ref']} |\n";
            }

            // الحفاظ على ما بعد جدول الأعمدة (قيود عدم التكرار والملاحظات)
            $tail = preg_replace('/^### `'.preg_quote($table, '/').'`\n\n\| العمود.*?\n(\|[^\n]*\n)+/m', '', $block);
            $content = str_replace($block, $rebuilt.$tail, $content);
        }

        if ($content === $original) {
            return false;
        }

        if (! $this->option('check')) {
            file_put_contents($path, $content);
        }

        $this->line('02-DATA-DICTIONARY.md: تغيّر');

        return true;
    }

    /** @return array<int, array{name:string, type:string, null:string, ref:string}> */
    private function columnsOf(string $table): array
    {
        $rows = DB::select(<<<'SQL'
            SELECT c.column_name,
                   c.data_type,
                   c.character_maximum_length,
                   c.numeric_precision,
                   c.numeric_scale,
                   c.is_nullable,
                   c.ordinal_position,
                   (
                     SELECT ccu.table_name
                     FROM information_schema.table_constraints tc
                     JOIN information_schema.key_column_usage kcu
                       ON kcu.constraint_name = tc.constraint_name
                     JOIN information_schema.constraint_column_usage ccu
                       ON ccu.constraint_name = tc.constraint_name
                     WHERE tc.constraint_type = 'FOREIGN KEY'
                       AND tc.table_name = c.table_name
                       AND kcu.column_name = c.column_name
                     LIMIT 1
                   ) AS references_table
            FROM information_schema.columns c
            WHERE c.table_schema = current_schema() AND c.table_name = ?
            ORDER BY c.ordinal_position
        SQL, [$table]);

        return array_map(fn ($r) => [
            'name' => $r->column_name,
            'type' => $this->typeOf($r),
            'null' => $r->is_nullable === 'YES' ? 'نعم' : 'لا',
            'ref' => $r->references_table ?: '—',
        ], $rows);
    }

    private function typeOf(object $r): string
    {
        return match ($r->data_type) {
            // char(3) و varchar(3) يُعرضان بالطول، وإلا فُقد الطول من الوثيقة
            'character varying', 'character' => "varchar({$r->character_maximum_length})",
            'numeric' => "numeric({$r->numeric_precision},{$r->numeric_scale})",
            'timestamp without time zone' => 'timestamp without time zone',
            default => $r->data_type,
        };
    }

    /** يستبدل ما بعد عنوان معيّن حتى نهاية الملف أو العنوان التالي من نفس المستوى. */
    private function replaceSection(string $path, string $heading, string $body): bool
    {
        if (! is_file($path)) {
            return false;
        }

        $content = file_get_contents($path);
        $start = strpos($content, $heading);

        if ($start === false) {
            $this->warn("لم يُعثر على العنوان «{$heading}» في ".basename($path));

            return false;
        }

        $after = $start + strlen($heading);
        $next = strpos($content, "\n## ", $after);
        $end = $next === false ? strlen($content) : $next;

        $updated = substr($content, 0, $after)."\n\n".$body.substr($content, $end);

        if ($updated === $content) {
            return false;
        }

        if (! $this->option('check')) {
            file_put_contents($path, $updated);
        }

        $this->line(basename($path).': تغيّر');

        return true;
    }
}
