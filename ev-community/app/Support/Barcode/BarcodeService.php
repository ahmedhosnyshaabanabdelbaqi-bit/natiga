<?php

namespace App\Support\Barcode;

use App\Support\Qr\QrService;
use InvalidArgumentException;
use Picqer\Barcode\BarcodeGeneratorPNG;
use Picqer\Barcode\BarcodeGeneratorSVG;
use Picqer\Barcode\Types\TypeCode128;

/**
 * Labels for packages, storage locations and inventory items.
 *
 *   $barcodes->code128Svg('PKG-2026-000123');
 *   $barcodes->qrLabelSvg('WH1-A-03-B7');   // QR + human readable code underneath
 */
final class BarcodeService
{
    public function __construct(private readonly QrService $qr) {}

    public function code128Svg(string $code, int $height = 40, float $widthFactor = 2): string
    {
        $this->assertCode128($code);

        return (new BarcodeGeneratorSVG)->getBarcode($code, new TypeCode128, $widthFactor, $height);
    }

    /** Binary PNG (transparent background, black bars). */
    public function code128Png(string $code, int $height = 40, int $widthFactor = 2): string
    {
        $this->assertCode128($code);

        return (new BarcodeGeneratorPNG)->getBarcode($code, new TypeCode128, $widthFactor, $height);
    }

    public function code128PngDataUri(string $code, int $height = 40, int $widthFactor = 2): string
    {
        return 'data:image/png;base64,'.base64_encode($this->code128Png($code, $height, $widthFactor));
    }

    /**
     * Square QR label with the code printed underneath (monospace, LTR), ready for thermal printers.
     */
    public function qrLabelSvg(string $code, int $size = 160): string
    {
        $code = trim($code);
        if ($code === '' || mb_strlen($code) > 120) {
            throw new InvalidArgumentException('Label code must be between 1 and 120 characters.');
        }
        $size = max(96, $size);
        $fontSize = max(10, (int) round($size * 0.085));
        $textBlock = $fontSize + 12;
        $height = $size + $textBlock;

        $qr = $this->qr->svgFragment($code, $size);
        $qr = preg_replace('/<svg\b/', sprintf('<svg x="0" y="0" width="%d" height="%d"', $size, $size), $qr, 1) ?? $qr;

        return sprintf(
            '<svg xmlns="http://www.w3.org/2000/svg" width="%1$d" height="%2$d" viewBox="0 0 %1$d %2$d" role="img" aria-label="%3$s">'
            .'<rect width="100%%" height="100%%" fill="#ffffff"/>%4$s'
            .'<text x="%5$d" y="%6$d" text-anchor="middle" direction="ltr" font-family="DejaVu Sans Mono, Menlo, Consolas, monospace" font-size="%7$d" fill="#0B1220">%3$s</text>'
            .'</svg>',
            $size,
            $height,
            htmlspecialchars($code, ENT_QUOTES | ENT_XML1, 'UTF-8'),
            $qr,
            (int) round($size / 2),
            $size + $fontSize + 2,
            $fontSize,
        );
    }

    private function assertCode128(string $code): void
    {
        if ($code === '' || strlen($code) > 80 || ! preg_match('/^[\x20-\x7E]+$/', $code)) {
            throw new InvalidArgumentException('Code 128 accepts 1-80 printable ASCII characters.');
        }
    }
}
