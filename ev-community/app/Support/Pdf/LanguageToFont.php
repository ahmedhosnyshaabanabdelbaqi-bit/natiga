<?php

namespace App\Support\Pdf;

use Mpdf\Language\LanguageToFont as DefaultLanguageToFont;
use Mpdf\Language\LanguageToFontInterface;

/**
 * mpdf maps Arabic script to its bundled "xbriyaz" font. We route every Arabic run to the
 * platform font (Cairo, or DejaVu Sans when Cairo is not installed) and leave other scripts
 * to mpdf's defaults.
 */
final class LanguageToFont implements LanguageToFontInterface
{
    private DefaultLanguageToFont $default;

    public function __construct(private readonly string $arabicFont)
    {
        $this->default = new DefaultLanguageToFont;
    }

    /** @return array{0: bool, 1: string} [coreSuitable, unifont] */
    public function getLanguageOptions($llcc, $adobeCJK)
    {
        [$coreSuitable, $unifont] = $this->default->getLanguageOptions($llcc, $adobeCJK);

        $tags = explode('-', strtolower((string) $llcc));
        $isArabic = in_array($tags[0], ['ar', 'ara', 'fa', 'fas', 'ur', 'urd', 'ps', 'pus'], true) || in_array('arab', $tags, true) || $unifont === 'xbriyaz';
        if ($isArabic) {
            return [false, $this->arabicFont];
        }

        return [$coreSuitable, $unifont];
    }
}
