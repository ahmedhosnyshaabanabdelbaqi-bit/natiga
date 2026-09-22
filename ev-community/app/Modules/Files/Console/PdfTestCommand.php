<?php

namespace App\Modules\Files\Console;

use App\Support\Pdf\PdfService;
use App\Support\Qr\QrService;
use Brick\Math\BigDecimal;
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

    /**
     * Sample data with pre-formatted amounts (the view only prints strings).
     *
     * @param  list<string>|null  $productNames  override the product names (tests use very long names to verify wrapping)
     * @return array<string, mixed>
     */
    public static function sampleData(string $locale, ?string $qrDataUri = null, ?array $productNames = null): array
    {
        $names = $productNames ?? array_values((array) __('pdf.sample.products', [], $locale));
        $skus = ['BRK-BYD-A3-F', 'BAT-12V-AGM60', 'FLT-MG4-CAB', 'CBL-T2-74-5M'];
        $prices = ['1850.00', '2400.00', '350.00', '3200.00'];
        $currency = 'EGP';
        $items = [];
        $grandTotal = BigDecimal::of('0.00');
        foreach (array_values($names) as $i => $name) {
            $quantity = $i + 1;
            $unitPrice = BigDecimal::of($prices[$i % count($prices)]);
            $lineTotal = $unitPrice->multipliedBy($quantity)->toScale(2);
            $grandTotal = $grandTotal->plus($lineTotal);
            $items[] = [
                'name' => $name,
                'sku' => $skus[$i % count($skus)].($i >= count($skus) ? '-'.$i : ''),
                'quantity' => $quantity,
                'unit_price_formatted' => self::formatAmount((string) $unitPrice, $currency, $locale),
                'line_total_formatted' => self::formatAmount((string) $lineTotal, $currency, $locale),
            ];
        }

        return [
            'title' => __('pdf.sample.title', [], $locale),
            'intro' => __('pdf.sample.intro', [], $locale),
            'reference' => 'ORD-2026-000123',
            'items' => $items,
            'grand_total_formatted' => self::formatAmount((string) $grandTotal->toScale(2), $currency, $locale),
            'notes' => __('pdf.sample.notes_text', [], $locale),
            'qr' => $qrDataUri,
        ];
    }

    private static function formatAmount(string $amount, string $currency, string $locale): string
    {
        $formatted = number_format((float) $amount, 2, '.', ',');
        if ($locale === 'ar') {
            $label = match ($currency) {
                'EGP' => 'ج.م',
                'USD' => 'دولار',
                'EUR' => 'يورو',
                'CNY' => 'يوان',
                default => $currency,
            };

            return $formatted.' '.$label;
        }

        return $currency.' '.$formatted;
    }
}
