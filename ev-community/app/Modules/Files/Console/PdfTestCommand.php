<?php

namespace App\Modules\Files\Console;

use App\Support\Pdf\PdfService;
use App\Support\Qr\QrService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * Renders the reference document to storage/app/private/pdf-test-{locale}.pdf so operators can
 * eyeball Arabic shaping, direction and fonts after deploying.
 */
class PdfTestCommand extends Command
{
    protected $signature = 'pdf:test {--locale=ar : ar|en}';

    protected $description = 'Render the sample PDF (fonts, RTL, tables, page numbers) to storage/app/private';

    public function handle(PdfService $pdf, QrService $qr): int
    {
        $locale = (string) $this->option('locale');
        if (! in_array($locale, ev_locales(), true)) {
            $this->error(sprintf('Unknown locale [%s]. Use one of: %s', $locale, implode(', ', ev_locales())));

            return self::INVALID;
        }

        $binary = $pdf->render('pdf.sample', self::sampleData($locale, $qr->pngDataUri('https://example.test/verify/sample', 160)), $locale);

        $file = 'pdf-test-'.$locale.'.pdf';
        Storage::disk('private')->put($file, $binary);

        $this->info(sprintf('Written %s (%d KB) using font "%s".', storage_path('app/private/'.$file), (int) round(strlen($binary) / 1024), $pdf->fontFor($locale)));
        if (! $pdf->cairoAvailable()) {
            $this->warn('Cairo font files are missing in resources/fonts/cairo; Arabic falls back to DejaVu Sans.');
        }

        return self::SUCCESS;
    }

    /** @return array<string, mixed> */
    public static function sampleData(string $locale, ?string $qrDataUri = null): array
    {
        $names = (array) __('pdf.sample.products', [], $locale);
        $skus = ['BRK-BYD-A3-F', 'BAT-12V-AGM60', 'FLT-MG4-CAB', 'CBL-T2-74-5M'];
        $prices = ['1850.00', '2400.00', '350.00', '3200.00'];
        $items = [];
        foreach (array_values($names) as $i => $name) {
            $items[] = ['name' => $name, 'sku' => $skus[$i] ?? 'SKU-'.$i, 'quantity' => $i + 1, 'unit_price' => $prices[$i] ?? '100.00', 'currency' => 'EGP'];
        }

        return [
            'title' => __('pdf.sample.title', [], $locale),
            'intro' => __('pdf.sample.intro', [], $locale),
            'reference' => 'ORD-2026-000123',
            'items' => $items,
            'notes' => __('pdf.sample.notes_text', [], $locale),
            'qr' => $qrDataUri,
        ];
    }
}
