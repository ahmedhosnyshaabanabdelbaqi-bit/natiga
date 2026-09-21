<?php

namespace App\Domain\Accounting;

use App\Domain\Support\Num;
use App\Exceptions\DomainException;

/**
 * A journal entry being assembled. Collecting lines here rather than writing
 * them as they are computed means the balance check happens before anything
 * touches the database, so a posting bug surfaces as a clear domain error
 * instead of a constraint violation at commit.
 */
class JournalDraft
{
    /** @var array<int, array<string, mixed>> */
    protected array $lines = [];

    public function __construct(
        public readonly string $sourceType,
        public readonly int $sourceId,
        public readonly string $entryDate,
        public string $memo = '',
        public string $purpose = 'main',
    ) {}

    public function debit(
        int $accountId,
        mixed $amount,
        ?string $memo = null,
        ?string $partnerType = null,
        ?int $partnerId = null,
        ?int $costCenterId = null,
    ): static {
        return $this->line($accountId, $amount, '0', $memo, $partnerType, $partnerId, $costCenterId);
    }

    public function credit(
        int $accountId,
        mixed $amount,
        ?string $memo = null,
        ?string $partnerType = null,
        ?int $partnerId = null,
        ?int $costCenterId = null,
    ): static {
        return $this->line($accountId, '0', $amount, $memo, $partnerType, $partnerId, $costCenterId);
    }

    /**
     * Post a signed amount on a chosen side, flipping to the other side when the
     * amount is negative. This keeps reversal and return postings readable
     * instead of littered with sign tests.
     */
    public function signed(
        int $accountId,
        mixed $amount,
        string $naturalSide = 'debit',
        ?string $memo = null,
        ?string $partnerType = null,
        ?int $partnerId = null,
        ?int $costCenterId = null,
    ): static {
        $amount = Num::money($amount);

        if (Num::isNegative($amount, Num::MONEY_SCALE)) {
            $naturalSide = $naturalSide === 'debit' ? 'credit' : 'debit';
            $amount = Num::abs($amount);
        }

        return $naturalSide === 'debit'
            ? $this->debit($accountId, $amount, $memo, $partnerType, $partnerId, $costCenterId)
            : $this->credit($accountId, $amount, $memo, $partnerType, $partnerId, $costCenterId);
    }

    protected function line(
        int $accountId, mixed $debit, mixed $credit, ?string $memo,
        ?string $partnerType, ?int $partnerId, ?int $costCenterId,
    ): static {
        $debit = Num::money($debit);
        $credit = Num::money($credit);

        // A zero line carries no information and only clutters the ledger.
        if (Num::isZero($debit, Num::MONEY_SCALE) && Num::isZero($credit, Num::MONEY_SCALE)) {
            return $this;
        }

        if (Num::isNegative($debit, Num::MONEY_SCALE) || Num::isNegative($credit, Num::MONEY_SCALE)) {
            throw DomainException::make('gl.negative_line',
                'لا يجوز تسجيل سطر قيد بقيمة سالبة؛ استخدم الجانب المقابل.',
                compact('accountId', 'debit', 'credit'));
        }

        $this->lines[] = [
            'account_id' => $accountId,
            'debit' => $debit,
            'credit' => $credit,
            'memo' => $memo,
            'partner_type' => $partnerType,
            'partner_id' => $partnerId,
            'cost_center_id' => $costCenterId,
        ];

        return $this;
    }

    /** @return array<int, array<string, mixed>> */
    public function lines(): array
    {
        return $this->lines;
    }

    public function isEmpty(): bool
    {
        return $this->lines === [];
    }

    public function totalDebit(): string
    {
        return array_reduce($this->lines,
            fn ($carry, $l) => Num::add($carry, $l['debit'], Num::MONEY_SCALE), '0');
    }

    public function totalCredit(): string
    {
        return array_reduce($this->lines,
            fn ($carry, $l) => Num::add($carry, $l['credit'], Num::MONEY_SCALE), '0');
    }

    public function difference(): string
    {
        return Num::sub($this->totalDebit(), $this->totalCredit(), Num::MONEY_SCALE);
    }

    public function assertBalanced(): void
    {
        if (! Num::isZero($this->difference(), Num::MONEY_SCALE)) {
            throw DomainException::make('gl.unbalanced', sprintf(
                'القيد غير متوازن: مدين %s، دائن %s، الفرق %s.',
                $this->totalDebit(), $this->totalCredit(), $this->difference()
            ), [
                'source_type' => $this->sourceType,
                'source_id' => $this->sourceId,
                'debit' => $this->totalDebit(),
                'credit' => $this->totalCredit(),
                'lines' => $this->lines,
            ]);
        }
    }
}
