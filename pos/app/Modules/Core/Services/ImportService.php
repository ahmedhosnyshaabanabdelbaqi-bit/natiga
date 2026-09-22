<?php

declare(strict_types=1);

namespace App\Modules\Core\Services;

use App\Modules\Catalog\Models\Barcode;
use App\Modules\Catalog\Models\Product;
use App\Modules\Catalog\Models\Unit;
use App\Modules\Catalog\Services\ProductService;
use App\Modules\Inventory\Services\InventoryService;
use App\Modules\Purchasing\Models\Supplier;
use App\Modules\Purchasing\Services\PurchaseService;
use App\Support\Exceptions\InvalidOperationException;
use Illuminate\Support\Facades\DB;
use OpenSpout\Reader\CSV\Reader as CsvReader;
use OpenSpout\Reader\XLSX\Reader as XlsxReader;

/**
 * Bulk import of products and opening balances from Excel/CSV.
 *
 * Two phases, always:
 *   1. `preview()` parses and validates EVERYTHING and reports errors with the
 *      original row numbers. Nothing is written.
 *   2. `import()` writes, in one transaction, only if the caller accepts.
 *
 * Opening balances are posted as real stock movements (reason `opening`), not as
 * a direct balance write, so the ledger can still explain every unit on hand.
 */
class ImportService
{
    public const PRODUCT_COLUMNS = [
        'sku' => 'الكود',
        'name' => 'الاسم',
        'name_en' => 'الاسم بالإنجليزية',
        'barcode' => 'الباركود',
        'unit' => 'الوحدة',
        'category' => 'التصنيف',
        'cost' => 'سعر التكلفة',
        'price' => 'سعر البيع',
        'wholesale_price' => 'سعر الجملة',
        'opening_qty' => 'الرصيد الافتتاحي',
        'min_stock' => 'الحد الأدنى',
        'carton_factor' => 'عدد القطع بالكرتونة',
    ];

    public function __construct(
        private readonly ProductService $products,
        private readonly PurchaseService $purchases,
        private readonly InventoryService $inventory,
    ) {}

    /**
     * Parse and validate without writing anything.
     *
     * @return array{
     *   headers: list<string>, rows: list<array<string,mixed>>,
     *   errors: list<array{row:int, column:string|null, message:string}>,
     *   summary: array<string,int>
     * }
     */
    public function preview(string $path, int $limit = 2000): array
    {
        $rows = $this->readRows($path, $limit);

        if ($rows === []) {
            throw new InvalidOperationException('الملف فارغ أو غير مقروء.', 'import_empty_file');
        }

        $headers = array_map(
            static fn ($h) => trim(mb_strtolower((string) $h)),
            array_shift($rows) ?? [],
        );

        $map = $this->mapHeaders($headers);
        if (! isset($map['sku']) || ! isset($map['name'])) {
            throw new InvalidOperationException(
                'الملف يجب أن يحتوي على عمودي "sku" و"name" على الأقل.',
                'import_missing_columns',
                422,
                ['found' => $headers],
            );
        }

        $units = Unit::query()->pluck('code')->all();
        $existingSkus = Product::query()->pluck('sku')->flip();
        $existingBarcodes = Barcode::query()->pluck('code')->flip();

        $parsed = [];
        $errors = [];
        $seenSkus = [];
        $seenBarcodes = [];

        foreach ($rows as $index => $row) {
            // +2: one for the header row, one because humans count from 1.
            $rowNumber = $index + 2;
            $record = [];
            foreach ($map as $field => $position) {
                $record[$field] = isset($row[$position]) ? trim((string) $row[$position]) : '';
            }

            if ($record['sku'] === '' && $record['name'] === '') {
                continue; // blank spacer row
            }

            $rowErrors = [];

            if ($record['sku'] === '') {
                $rowErrors[] = ['column' => 'sku', 'message' => 'الكود مطلوب.'];
            } elseif (isset($seenSkus[$record['sku']])) {
                $rowErrors[] = ['column' => 'sku', 'message' => 'الكود مكرر داخل الملف (صف '.$seenSkus[$record['sku']].').'];
            } elseif (isset($existingSkus[$record['sku']])) {
                $rowErrors[] = ['column' => 'sku', 'message' => 'الكود موجود بالفعل في النظام.'];
            } else {
                $seenSkus[$record['sku']] = $rowNumber;
            }

            if ($record['name'] === '') {
                $rowErrors[] = ['column' => 'name', 'message' => 'الاسم مطلوب.'];
            }

            $unit = $record['unit'] ?: 'piece';
            if (! in_array($unit, $units, true)) {
                $rowErrors[] = ['column' => 'unit', 'message' => "وحدة غير معروفة: $unit"];
            }
            $record['unit'] = $unit;

            $barcode = $record['barcode'] ?? '';
            if ($barcode !== '') {
                if (isset($seenBarcodes[$barcode])) {
                    $rowErrors[] = ['column' => 'barcode', 'message' => 'الباركود مكرر داخل الملف (صف '.$seenBarcodes[$barcode].').'];
                } elseif (isset($existingBarcodes[$barcode])) {
                    $rowErrors[] = ['column' => 'barcode', 'message' => 'الباركود مستخدم لصنف آخر.'];
                } else {
                    $seenBarcodes[$barcode] = $rowNumber;
                }
            }

            foreach (['cost', 'price', 'wholesale_price'] as $field) {
                $value = $record[$field] ?? '';
                if ($value !== '' && ! preg_match('/^\d+(\.\d{1,4})?$/', $value)) {
                    $rowErrors[] = ['column' => $field, 'message' => 'قيمة غير صالحة: '.$value];
                }
            }

            foreach (['opening_qty', 'min_stock', 'carton_factor'] as $field) {
                $value = $record[$field] ?? '';
                if ($value !== '' && ! preg_match('/^\d+(\.\d{1,4})?$/', $value)) {
                    $rowErrors[] = ['column' => $field, 'message' => 'قيمة غير صالحة: '.$value];
                }
            }

            if (($record['opening_qty'] ?? '') !== '' && ($record['cost'] ?? '') === '') {
                $rowErrors[] = ['column' => 'cost', 'message' => 'الرصيد الافتتاحي يحتاج سعر تكلفة لتقييم المخزون.'];
            }

            foreach ($rowErrors as $rowError) {
                $errors[] = ['row' => $rowNumber, 'column' => $rowError['column'], 'message' => $rowError['message']];
            }

            $record['_row'] = $rowNumber;
            $record['_valid'] = $rowErrors === [];
            $parsed[] = $record;
        }

        return [
            'headers' => array_keys($map),
            'rows' => $parsed,
            'errors' => $errors,
            'summary' => [
                'total' => count($parsed),
                'valid' => count(array_filter($parsed, fn ($r) => $r['_valid'])),
                'invalid' => count(array_filter($parsed, fn ($r) => ! $r['_valid'])),
                'with_opening_stock' => count(array_filter($parsed, fn ($r) => ($r['opening_qty'] ?? '') !== '')),
            ],
        ];
    }

    /**
     * Write the valid rows. Refuses outright if any row is invalid unless the
     * caller explicitly chooses to skip them.
     *
     * @return array{created:int, skipped:int, opening_stock_rows:int}
     */
    public function import(string $path, int $warehouseId, bool $skipInvalid = false, ?int $supplierId = null): array
    {
        $preview = $this->preview($path, 100000);

        if ($preview['errors'] !== [] && ! $skipInvalid) {
            throw new InvalidOperationException(
                'الملف يحتوي على أخطاء. صحّحها أو اختر تجاهل الصفوف غير الصالحة.',
                'import_has_errors',
                422,
                ['errors' => array_slice($preview['errors'], 0, 50), 'total_errors' => count($preview['errors'])],
            );
        }

        $created = 0;
        $skipped = 0;
        $openingRows = [];

        DB::transaction(function () use ($preview, &$created, &$skipped, &$openingRows): void {
            foreach ($preview['rows'] as $row) {
                if (! $row['_valid']) {
                    $skipped++;

                    continue;
                }

                $prices = [];
                if (($row['price'] ?? '') !== '') {
                    $prices[] = ['price_list' => 'RETAIL', 'price' => $row['price']];
                }
                if (($row['wholesale_price'] ?? '') !== '') {
                    $prices[] = ['price_list' => 'WHOLESALE', 'price' => $row['wholesale_price']];
                }

                $units = [];
                if (($row['carton_factor'] ?? '') !== '' && $row['carton_factor'] !== '0') {
                    $units[] = ['unit' => 'carton', 'factor' => $row['carton_factor']];
                }

                $product = $this->products->create([
                    'sku' => $row['sku'],
                    'name' => $row['name'],
                    'name_en' => ($row['name_en'] ?? '') ?: null,
                    'base_unit' => $row['unit'],
                    'min_stock' => ($row['min_stock'] ?? '') ?: '0',
                    'units' => $units,
                    'barcodes' => ($row['barcode'] ?? '') !== '' ? [['code' => $row['barcode']]] : [],
                    'prices' => $prices,
                ]);

                $created++;

                if (($row['opening_qty'] ?? '') !== '' && $row['opening_qty'] !== '0') {
                    $openingRows[] = [
                        'variant_id' => $product->variants->first()->id,
                        'product_unit_id' => $product->units->firstWhere('is_base', true)->id,
                        'qty' => $row['opening_qty'],
                        'unit_cost' => $row['cost'] ?: '0',
                    ];
                }
            }
        });

        // Opening balances become a documented goods receipt, so the stock
        // ledger explains where every unit came from.
        if ($openingRows !== []) {
            $supplierId ??= Supplier::query()->firstOrCreate(
                ['code' => 'OPENING'],
                ['name' => 'أرصدة افتتاحية', 'is_active' => true],
            )->id;

            foreach (array_chunk($openingRows, 200) as $chunk) {
                $this->purchases->receive([
                    'supplier_id' => $supplierId,
                    'warehouse_id' => $warehouseId,
                    'branch_id' => DB::table('warehouses')->where('id', $warehouseId)->value('branch_id'),
                    'supplier_reference' => 'استيراد أرصدة افتتاحية',
                    'lines' => $chunk,
                ]);
            }
        }

        return ['created' => $created, 'skipped' => $skipped, 'opening_stock_rows' => count($openingRows)];
    }

    /** A ready-to-fill CSV template with the Arabic column guide in row 1. */
    public function template(): string
    {
        $header = implode(',', array_keys(self::PRODUCT_COLUMNS));
        $guide = implode(',', array_map(fn ($label) => '"'.$label.'"', self::PRODUCT_COLUMNS));
        $example = 'SKU-001,"شاي أحمد 100 فتلة","Ahmed Tea",6221031492016,piece,"بقالة",22.50,30.00,27.00,48,10,12';

        // A UTF-8 BOM so Excel opens Arabic correctly on Windows.
        return "\u{FEFF}$header\n# $guide\n$example\n";
    }

    /** @return list<list<string>> */
    private function readRows(string $path, int $limit): array
    {
        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));

        $reader = match ($extension) {
            'csv', 'txt' => new CsvReader,
            'xlsx' => new XlsxReader,
            default => throw new InvalidOperationException(
                'صيغة الملف غير مدعومة. استخدم CSV أو XLSX.',
                'import_unsupported_format',
                422,
                ['extension' => $extension],
            ),
        };

        $rows = [];
        $reader->open($path);

        foreach ($reader->getSheetIterator() as $sheet) {
            foreach ($sheet->getRowIterator() as $row) {
                $cells = array_map(
                    static fn ($value) => is_scalar($value) ? (string) $value : '',
                    $row->toArray(),
                );

                // Comment rows (the template's Arabic guide) are ignored.
                if (str_starts_with(trim($cells[0] ?? ''), '#')) {
                    continue;
                }

                $rows[] = $cells;
                if (count($rows) > $limit) {
                    break 2;
                }
            }
            break; // first sheet only
        }

        $reader->close();

        return $rows;
    }

    /** @return array<string,int> field => column position */
    private function mapHeaders(array $headers): array
    {
        $aliases = [
            'sku' => ['sku', 'code', 'الكود', 'كود'],
            'name' => ['name', 'الاسم', 'اسم الصنف'],
            'name_en' => ['name_en', 'english name'],
            'barcode' => ['barcode', 'الباركود'],
            'unit' => ['unit', 'الوحدة'],
            'category' => ['category', 'التصنيف'],
            'cost' => ['cost', 'التكلفة', 'سعر التكلفة'],
            'price' => ['price', 'السعر', 'سعر البيع'],
            'wholesale_price' => ['wholesale_price', 'سعر الجملة'],
            'opening_qty' => ['opening_qty', 'الرصيد', 'الرصيد الافتتاحي'],
            'min_stock' => ['min_stock', 'الحد الأدنى'],
            'carton_factor' => ['carton_factor', 'عدد القطع بالكرتونة'],
        ];

        $map = [];
        foreach ($headers as $position => $header) {
            foreach ($aliases as $field => $names) {
                if (in_array($header, $names, true) && ! isset($map[$field])) {
                    $map[$field] = $position;
                }
            }
        }

        return $map;
    }
}
