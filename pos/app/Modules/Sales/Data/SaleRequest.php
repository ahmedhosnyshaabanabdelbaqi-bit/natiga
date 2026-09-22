<?php

declare(strict_types=1);

namespace App\Modules\Sales\Data;

/**
 * Validated checkout input. Built from an HTTP request or from a replayed
 * offline operation — the domain does not care which.
 */
final readonly class SaleRequest
{
    /**
     * @param list<array{variant_id:int, product_unit_id:int|null, qty:string, unit_price:string|null,
     *                   discount_amount:string|null, discount_percent:string|null, batch_id:int|null,
     *                   serials:list<string>|null, note:string|null}> $lines
     * @param list<array{payment_method_id:int, amount:string, tendered_amount:string|null,
     *                   reference:string|null}> $payments
     */
    public function __construct(
        public array $lines,
        public array $payments = [],
        public ?int $customerId = null,
        public ?int $priceListId = null,
        public ?int $warehouseId = null,
        public ?string $invoiceDiscountType = null,
        public ?string $invoiceDiscountValue = null,
        public bool $isCredit = false,
        public ?string $dueDate = null,
        public ?string $idempotencyKey = null,
        public ?string $approvalUuid = null,
        public ?string $notes = null,
        public string $origin = 'online',
        public ?string $offlineUid = null,
        public ?string $clientCreatedAt = null,
        public ?int $heldCartId = null,
        public ?int $quoteId = null,
        public ?string $expectedGrandTotal = null,
    ) {}

    /** @param array<string,mixed> $data */
    public static function fromArray(array $data): self
    {
        return new self(
            lines: array_map(static fn (array $l): array => [
                'variant_id' => (int) $l['variant_id'],
                'product_unit_id' => isset($l['product_unit_id']) ? (int) $l['product_unit_id'] : null,
                'qty' => (string) $l['qty'],
                'unit_price' => isset($l['unit_price']) ? (string) $l['unit_price'] : null,
                'discount_amount' => isset($l['discount_amount']) ? (string) $l['discount_amount'] : null,
                'discount_percent' => isset($l['discount_percent']) ? (string) $l['discount_percent'] : null,
                'batch_id' => isset($l['batch_id']) ? (int) $l['batch_id'] : null,
                'serials' => isset($l['serials']) ? array_values((array) $l['serials']) : null,
                'note' => $l['note'] ?? null,
            ], $data['lines'] ?? []),
            payments: array_map(static fn (array $p): array => [
                'payment_method_id' => (int) $p['payment_method_id'],
                'amount' => (string) $p['amount'],
                'tendered_amount' => isset($p['tendered_amount']) ? (string) $p['tendered_amount'] : null,
                'reference' => $p['reference'] ?? null,
            ], $data['payments'] ?? []),
            customerId: isset($data['customer_id']) ? (int) $data['customer_id'] : null,
            priceListId: isset($data['price_list_id']) ? (int) $data['price_list_id'] : null,
            warehouseId: isset($data['warehouse_id']) ? (int) $data['warehouse_id'] : null,
            invoiceDiscountType: $data['invoice_discount_type'] ?? null,
            invoiceDiscountValue: isset($data['invoice_discount_value']) ? (string) $data['invoice_discount_value'] : null,
            isCredit: (bool) ($data['is_credit'] ?? false),
            dueDate: $data['due_date'] ?? null,
            idempotencyKey: $data['idempotency_key'] ?? null,
            approvalUuid: $data['approval_uuid'] ?? null,
            notes: $data['notes'] ?? null,
            origin: $data['origin'] ?? 'online',
            offlineUid: $data['offline_uid'] ?? null,
            clientCreatedAt: $data['client_created_at'] ?? null,
            heldCartId: isset($data['held_cart_id']) ? (int) $data['held_cart_id'] : null,
            quoteId: isset($data['quote_id']) ? (int) $data['quote_id'] : null,
            expectedGrandTotal: isset($data['expected_grand_total']) ? (string) $data['expected_grand_total'] : null,
        );
    }

    /** Canonical body used for the idempotency hash (volatile fields excluded). */
    public function idempotencyPayload(): array
    {
        return [
            'lines' => $this->lines,
            'payments' => array_map(static fn ($p) => [
                'payment_method_id' => $p['payment_method_id'],
                'amount' => $p['amount'],
            ], $this->payments),
            'customer_id' => $this->customerId,
            'invoice_discount_type' => $this->invoiceDiscountType,
            'invoice_discount_value' => $this->invoiceDiscountValue,
            'is_credit' => $this->isCredit,
        ];
    }
}
