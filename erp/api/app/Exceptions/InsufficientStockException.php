<?php

namespace App\Exceptions;

class InsufficientStockException extends DomainException
{
    public function __construct(
        int $itemId,
        string $itemName,
        int $warehouseId,
        string $requested,
        string $available,
        ?int $batchId = null,
    ) {
        parent::__construct(
            'stock.insufficient',
            "الرصيد المتاح من الصنف «{$itemName}» غير كافٍ: المطلوب {$requested}، المتاح {$available}.",
            compact('itemId', 'itemName', 'warehouseId', 'requested', 'available', 'batchId'),
        );
    }
}
