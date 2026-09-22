<?php

namespace App\Support\Pdf;

use App\Models\User;
use App\Modules\Files\Models\Attachment;
use App\Modules\Files\Services\AttachmentService;
use App\Modules\System\Services\Settings;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Mpdf\Config\ConfigVariables;
use Mpdf\Config\FontVariables;
use Mpdf\Mpdf;
use Mpdf\Output\Destination;

/**
 * Bilingual PDF rendering (mpdf 8) with Arabic shaping/RTL. Views extend `pdf.layout`.
 *
 *   $pdf->render('pdf.receipt', ['receipt' => $receipt], 'ar');                       // binary
 *   $pdf->store('pdf.receipt', [...], 'receipt-RCT-2026-000001.pdf', $receipt, 'receipt_pdf', 'ar');
 *
 * Fonts: Cairo (resources/fonts/cairo) for Arabic documents, DejaVu Sans (bundled with mpdf,
 * also has Arabic glyphs) for English documents and as the fallback when Cairo is missing.
 */
final class PdfService
{
    public const FONT_ARABIC = 'cairo';

    public const FONT_LATIN = 'dejavusans';

    private ?bool $cairoAvailable = null;

    public function __construct(private readonly AttachmentService $attachments) {}

    /**
     * Render a Blade view to PDF bytes in the given locale (default: current locale).
     *
     * @param  array<string, mixed>  $data
     */
    public function render(string $view, array $data = [], ?string $locale = null): string
    {
        $locale = $this->normalizeLocale($locale);
        $previousLocale = app()->getLocale();
        $previousCarbon = Carbon::getLocale();

        app()->setLocale($locale);
        Carbon::setLocale($locale);
        try {
            $html = view($view, $data + [
                'pdfLocale' => $locale,
                'pdfDir' => ev_dir($locale),
                'pdfFont' => $this->fontFor($locale),
                'pdfSiteName' => (string) Settings::localized('branding.site_name', $locale, config('app.name')),
                'pdfGeneratedAt' => now()->timezone((string) config('app.timezone', 'Africa/Cairo')),
            ])->render();

            $mpdf = $this->makeMpdf($locale);
            if (isset($data['title']) && is_string($data['title'])) {
                $mpdf->SetTitle($data['title']);
            }
            $mpdf->WriteHTML($html);

            return $mpdf->Output('', Destination::STRING_RETURN);
        } finally {
            app()->setLocale($previousLocale);
            Carbon::setLocale($previousCarbon);
        }
    }

    /**
     * Render and store as a private attachment of `$owner` through AttachmentService.
     *
     * @param  array<string, mixed>  $data
     */
    public function store(string $view, array $data, string $filename, ?Model $owner, string $collection, ?string $locale = null, ?User $uploader = null, string $visibility = Attachment::VISIBILITY_PRIVATE): Attachment
    {
        $binary = $this->render($view, $data, $locale);
        $filename = Str::endsWith(strtolower($filename), '.pdf') ? $filename : $filename.'.pdf';

        return $this->attachments->storeContents($binary, $filename, $owner, $collection, $visibility, 'document', $uploader);
    }

    /** Configured mpdf instance (fonts, direction, margins). Public for advanced callers (e.g. multi-document merges). */
    public function makeMpdf(?string $locale = null): Mpdf
    {
        $locale = $this->normalizeLocale($locale);
        $font = $this->fontFor($locale);

        $fontDirs = (new ConfigVariables)->getDefaults()['fontDir'];
        $fontData = (new FontVariables)->getDefaults()['fontdata'];
        if ($this->cairoAvailable()) {
            $fontDirs[] = $this->cairoDirectory();
            $fontData[self::FONT_ARABIC] = [
                'R' => 'Cairo-Regular.ttf',
                'B' => 'Cairo-Bold.ttf',
                'useOTL' => 0xFF,
                'useKashida' => 75,
            ];
        }

        $tempDir = storage_path('app/mpdf');
        File::ensureDirectoryExists($tempDir);

        $mpdf = new Mpdf([
            'mode' => 'utf-8',
            'format' => 'A4',
            'orientation' => 'P',
            'tempDir' => $tempDir,
            'fontDir' => $fontDirs,
            'fontdata' => $fontData,
            'default_font' => $font,
            'default_font_size' => 10,
            'autoScriptToLang' => true,
            'autoLangToFont' => true,
            'languageToFont' => new LanguageToFont($this->arabicFont()),
            'margin_left' => 12,
            'margin_right' => 12,
            'margin_top' => 30,
            'margin_bottom' => 24,
            'margin_header' => 8,
            'margin_footer' => 8,
            'useSubstitutions' => false,
            'simpleTables' => false,
            'shrink_tables_to_fit' => 1,
        ]);
        $mpdf->SetDirectionality(ev_dir($locale));
        $mpdf->SetCreator((string) config('app.name'));
        $mpdf->SetAuthor((string) Settings::localized('branding.site_name', $locale, config('app.name')));

        return $mpdf;
    }

    /** Font family used for documents in the given locale. */
    public function fontFor(string $locale): string
    {
        return $locale === 'ar' ? $this->arabicFont() : self::FONT_LATIN;
    }

    public function arabicFont(): string
    {
        return $this->cairoAvailable() ? self::FONT_ARABIC : self::FONT_LATIN;
    }

    public function cairoAvailable(): bool
    {
        return $this->cairoAvailable ??= is_file($this->cairoDirectory().'/Cairo-Regular.ttf') && is_file($this->cairoDirectory().'/Cairo-Bold.ttf');
    }

    public function cairoDirectory(): string
    {
        return resource_path('fonts/cairo');
    }

    private function normalizeLocale(?string $locale): string
    {
        $locale ??= app()->getLocale();

        return in_array($locale, ev_locales(), true) ? $locale : (string) config('ev.default_locale', 'ar');
    }
}
