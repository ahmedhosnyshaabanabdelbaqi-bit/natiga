<?php

declare(strict_types=1);

namespace App\Modules\Core\Services;

use Illuminate\Support\Facades\DB;

/**
 * Document numbering.
 *
 * The counter row is taken with `SELECT ... FOR UPDATE` so two terminals cannot
 * mint the same invoice number. Numbers are scoped (typically per branch or per
 * terminal) so a busy shop does not serialise every sale on one row.
 */
class SequenceService
{
    /**
     * Reserve the next number for a document type.
     *
     * A single atomic UPSERT: the row is created if missing and incremented if
     * present, in one statement. An earlier "create then lock" version raced
     * when several terminals minted the FIRST number of a sequence at the same
     * instant — the concurrency suite caught it.
     *
     * The incremented row stays locked until the caller's transaction commits,
     * which is what keeps numbering gap-free per scope. Scoping by terminal
     * therefore also keeps busy tills from serialising on each other.
     */
    public function next(string $documentType, string $scopeKey = 'global', ?string $prefix = null): string
    {
        $prefix ??= $this->defaultPrefix($documentType);

        $row = DB::selectOne(
            'INSERT INTO document_sequences (document_type, scope_key, prefix, next_number, padding, created_at, updated_at)
             VALUES (?, ?, ?, 2, 6, now(), now())
             ON CONFLICT (document_type, scope_key)
             DO UPDATE SET next_number = document_sequences.next_number + 1, updated_at = now()
             RETURNING next_number, prefix, padding',
            [$documentType, $scopeKey, $prefix],
        );

        // RETURNING gives the value AFTER the increment, so the number this call
        // owns is one less.
        $number = (int) $row->next_number - 1;

        $body = str_pad((string) $number, (int) $row->padding, '0', STR_PAD_LEFT);
        $prefixPart = $row->prefix ? $row->prefix.'-' : '';
        $scopePart = $scopeKey !== 'global' ? $scopeKey.'-' : '';

        return $prefixPart.$scopePart.$body;
    }

    private function defaultPrefix(string $documentType): string
    {
        return match ($documentType) {
            'sale' => 'INV',
            'sale_return' => 'RET',
            'quote' => 'QT',
            'shift' => 'SH',
            'purchase_order' => 'PO',
            'goods_receipt' => 'GRN',
            'supplier_invoice' => 'SINV',
            'supplier_payment' => 'SPAY',
            'supplier_return' => 'SRET',
            'customer_payment' => 'RCPT',
            'expense' => 'EXP',
            'stock_transfer' => 'TRF',
            'stocktake' => 'STK',
            'journal' => 'JE',
            default => strtoupper(substr($documentType, 0, 3)),
        };
    }
}
