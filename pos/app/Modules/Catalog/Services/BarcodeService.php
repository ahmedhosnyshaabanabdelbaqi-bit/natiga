<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Services;

use App\Modules\Catalog\Models\Barcode;
use App\Modules\Core\Services\SettingsService;
use App\Support\Money;
use App\Support\Quantity;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;

/**
 * Barcode resolution.
 *
 * Barcodes are TEXT: "0123" and "123" are different codes and leading zeros are
 * never lost to an integer cast.
 *
 * Scales print weight- or price-embedded barcodes in vendor-specific layouts, so
 * the layout is configuration (settings key `barcode.embedded_formats`), never a
 * hard-coded assumption about "every scale".
 */
class BarcodeService
{
    public function __construct(private readonly SettingsService $settings) {}

    /**
     * @return array{barcode: Barcode, qty: Quantity|null, price: Money|null}|null
     */
    public function resolve(string $raw): ?array
    {
        $code = trim($raw);
        if ($code === '') {
            return null;
        }

        // 1. Exact match wins: a real product barcode is never reinterpreted.
        $exact = Barcode::query()
            ->with(['product.units.unit', 'variant', 'productUnit'])
            ->where('code', $code)
            ->first();

        if ($exact) {
            return ['barcode' => $exact, 'qty' => null, 'price' => null];
        }

        // 2. Otherwise try the shop's embedded-barcode layouts.
        return $this->resolveEmbedded($code);
    }

    /**
     * @return array{barcode: Barcode, qty: Quantity|null, price: Money|null}|null
     */
    private function resolveEmbedded(string $code): ?array
    {
        $formats = (array) $this->settings->get('barcode.embedded_formats', config('pos.barcode.embedded_formats', []));

        foreach ($formats as $format) {
            $prefix = (string) ($format['prefix'] ?? '');
            $length = (int) ($format['length'] ?? 13);

            if ($prefix === '' || strlen($code) !== $length || ! str_starts_with($code, $prefix)) {
                continue;
            }

            [$itemStart, $itemLen] = $format['item_code'] ?? [strlen($prefix), 5];
            [$valueStart, $valueLen] = $format['value'] ?? [$itemStart + $itemLen, 5];

            $itemCode = substr($code, (int) $itemStart, (int) $itemLen);
            $rawValue = substr($code, (int) $valueStart, (int) $valueLen);

            if (! ctype_digit($rawValue)) {
                continue;
            }

            $barcode = Barcode::query()
                ->with(['product.units.unit', 'variant', 'productUnit'])
                ->where('code', $itemCode)
                ->first();

            // Some shops encode the item by its SKU-style short code.
            $barcode ??= Barcode::query()
                ->with(['product.units.unit', 'variant', 'productUnit'])
                ->whereHas('product', fn ($q) => $q->where('sku', $itemCode))
                ->first();

            if (! $barcode) {
                continue;
            }

            $scale = (int) ($format['value_scale'] ?? 3);
            $value = BigDecimal::of($rawValue)->dividedBy(BigDecimal::of(10)->power($scale), 6, RoundingMode::HalfUp);

            if (($format['value_kind'] ?? 'weight') === 'price') {
                return ['barcode' => $barcode, 'qty' => null, 'price' => Money::of($value)];
            }

            return ['barcode' => $barcode, 'qty' => Quantity::of($value), 'price' => null];
        }

        return null;
    }
}
