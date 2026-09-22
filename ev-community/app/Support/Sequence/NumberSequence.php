<?php

namespace App\Support\Sequence;

use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Human-readable unique business numbers, e.g. ORD-2026-000001. Safe under concurrency
 * (row lock on number_sequences inside the caller's transaction or its own).
 */
final class NumberSequence
{
    /** @var array<string, array{prefix: string, yearly: bool, padding: int}> */
    public const KEYS = [
        'member' => ['prefix' => 'EV', 'yearly' => false, 'padding' => 6],
        'order' => ['prefix' => 'ORD', 'yearly' => true, 'padding' => 6],
        'payment' => ['prefix' => 'PAY', 'yearly' => true, 'padding' => 6],
        'receipt' => ['prefix' => 'RCT', 'yearly' => true, 'padding' => 6],
        'refund' => ['prefix' => 'RFD', 'yearly' => true, 'padding' => 6],
        'ticket' => ['prefix' => 'TKT', 'yearly' => true, 'padding' => 6],
        'shipment' => ['prefix' => 'SHP', 'yearly' => true, 'padding' => 5],
        'po' => ['prefix' => 'PO', 'yearly' => true, 'padding' => 5],
        'rfq' => ['prefix' => 'RFQ', 'yearly' => true, 'padding' => 5],
        'quote' => ['prefix' => 'QT', 'yearly' => true, 'padding' => 5],
        'booking' => ['prefix' => 'BKG', 'yearly' => true, 'padding' => 6],
        'work_order' => ['prefix' => 'WO', 'yearly' => true, 'padding' => 6],
        'delivery' => ['prefix' => 'DLV', 'yearly' => true, 'padding' => 6],
        'settlement' => ['prefix' => 'STL', 'yearly' => true, 'padding' => 5],
        'claim' => ['prefix' => 'WCL', 'yearly' => true, 'padding' => 5],
        'invoice' => ['prefix' => 'INV', 'yearly' => true, 'padding' => 6],
        'package' => ['prefix' => 'PKG', 'yearly' => true, 'padding' => 6],
        'incident' => ['prefix' => 'INC', 'yearly' => true, 'padding' => 4],
        'group_buy' => ['prefix' => 'GB', 'yearly' => true, 'padding' => 4],
        'event' => ['prefix' => 'EVT', 'yearly' => true, 'padding' => 4],
        'part_request' => ['prefix' => 'PRQ', 'yearly' => true, 'padding' => 5],
        'home_charging' => ['prefix' => 'HCR', 'yearly' => true, 'padding' => 5],
        'complaint' => ['prefix' => 'CMP', 'yearly' => true, 'padding' => 5],
        'export' => ['prefix' => 'EXP', 'yearly' => true, 'padding' => 5],
        'import' => ['prefix' => 'IMP', 'yearly' => true, 'padding' => 5],
    ];

    public static function next(string $key, ?int $year = null): string
    {
        $definition = self::KEYS[$key] ?? throw new InvalidArgumentException("Unknown sequence [{$key}]");
        $year = $definition['yearly'] ? ($year ?? (int) now()->format('Y')) : 0;

        $generate = function () use ($key, $year, $definition): string {
            $row = DB::table('number_sequences')->where('key', $key)->where('year', $year)->lockForUpdate()->first();
            if (! $row) {
                DB::table('number_sequences')->insertOrIgnore([
                    'key' => $key, 'year' => $year, 'prefix' => $definition['prefix'], 'next_value' => 1,
                    'padding' => $definition['padding'], 'created_at' => now(), 'updated_at' => now(),
                ]);
                $row = DB::table('number_sequences')->where('key', $key)->where('year', $year)->lockForUpdate()->first();
            }
            $value = (int) $row->next_value;
            DB::table('number_sequences')->where('key', $key)->where('year', $year)->update(['next_value' => $value + 1, 'updated_at' => now()]);

            $number = str_pad((string) $value, (int) $row->padding, '0', STR_PAD_LEFT);

            return $year > 0 ? sprintf('%s-%d-%s', $row->prefix, $year, $number) : sprintf('%s-%s', $row->prefix, $number);
        };

        return DB::transactionLevel() > 0 ? $generate() : DB::transaction($generate);
    }
}
