<?php

namespace App\Domain\Treasury;

use App\Domain\Accounting\LedgerService;
use App\Domain\Support\DocumentNumbering;
use App\Domain\Support\Num;
use App\Exceptions\DomainException;
use App\Models\Account;
use App\Models\CashTransfer;
use App\Support\CompanyContext;
use Illuminate\Support\Facades\DB;

/**
 * Moving money between a rep's custody, a cash box and a bank.
 *
 *   Dr  Destination (cash box / bank)
 *     Cr  Source (custody / cash box / bank)
 *
 * Both sides are asset accounts. A deposit is not income, and posting it as
 * such would double-count revenue that was already recognised on the invoice.
 * That is the single most important property of this class.
 */
class CashTransferService
{
    public function __construct(
        private readonly LedgerService $ledger,
        private readonly DocumentNumbering $numbering,
    ) {}

    public function create(array $header): CashTransfer
    {
        $amount = Num::money($header['amount']);

        if (! Num::isPositive($amount, Num::MONEY_SCALE)) {
            throw DomainException::make('treasury.invalid_amount',
                'قيمة التوريد يجب أن تكون أكبر من صفر.', ['amount' => $amount]);
        }

        $fromKind = $header['from_kind'];
        $toKind = $header['to_kind'];

        if ($fromKind === $toKind && (int) $header['from_id'] === (int) $header['to_id']) {
            throw DomainException::make('treasury.same_container',
                'لا يمكن التحويل إلى نفس الجهة.', compact('fromKind', 'toKind'));
        }
        if ($toKind === 'custody') {
            throw DomainException::make('treasury.no_transfer_into_custody',
                'لا يتم توريد النقدية إلى عهدة؛ العهدة تنشأ من التحصيل أو محضر تسليم.',
                ['to_kind' => $toKind]);
        }

        return CashTransfer::create([
            'company_id' => CompanyContext::idOrFail(),
            'code' => $this->numbering->next('cash_transfer'),
            'transfer_date' => $header['transfer_date'] ?? now()->toDateString(),
            'from_kind' => $fromKind,
            'from_id' => $header['from_id'],
            'to_kind' => $toKind,
            'to_id' => $header['to_id'],
            'amount' => $amount,
            'reference' => $header['reference'] ?? null,
            'status' => 'draft',
            'created_by' => auth()->id(),
            'notes' => $header['notes'] ?? null,
        ]);
    }

    /**
     * Post the deposit.
     *
     * A custody deposit is checked against the rep's actual custody balance, so
     * a rep cannot deposit money the books say they never held.
     */
    public function post(CashTransfer $transfer): CashTransfer
    {
        return DB::transaction(function () use ($transfer) {
            $transfer = CashTransfer::lockForUpdate()->findOrFail($transfer->id);

            if ($transfer->status === 'posted') {
                return $transfer;
            }
            if ($transfer->status === 'cancelled') {
                throw DomainException::make('treasury.transfer_cancelled',
                    "محضر التوريد «{$transfer->code}» ملغي.", ['id' => $transfer->id]);
            }

            $accounts = $this->ledger->accounts();
            $fromAccount = $accounts->forTreasury($transfer->from_kind, $transfer->from_id);
            $toAccount = $accounts->forTreasury($transfer->to_kind, $transfer->to_id);

            if ($transfer->from_kind === 'custody') {
                $held = Account::find($fromAccount)?->balance() ?? '0';

                if (Num::cmp($transfer->amount, $held, Num::MONEY_SCALE) > 0) {
                    throw DomainException::make('treasury.custody_insufficient', sprintf(
                        'المبلغ المورد (%s) يتجاوز رصيد العهدة النقدية (%s).',
                        $transfer->amount, Num::money($held)
                    ), ['custody_balance' => Num::money($held)]);
                }
            }

            $draft = $this->ledger->draftFor(
                'cash_transfer', $transfer->id, $transfer->transfer_date->toDateString(),
                "توريد نقدية {$transfer->code}"
            );

            $draft->debit($toAccount, $transfer->amount, 'استلام التوريد');
            $draft->credit($fromAccount, $transfer->amount, 'تسليم التوريد',
                $transfer->from_kind === 'custody' ? 'user' : null,
                $transfer->from_kind === 'custody' ? $transfer->from_id : null);

            $entry = $this->ledger->post($draft);

            $transfer->forceFill([
                'status' => 'posted',
                'journal_entry_id' => $entry->id,
                'posted_at' => now(),
                'approved_by' => auth()->id(),
            ])->save();

            return $transfer;
        });
    }

    /** A user's current cash (or cheque) custody balance, straight from the ledger. */
    public function custodyBalance(int $userId, string $kind = 'cash', ?string $asOf = null): string
    {
        $accountId = $this->ledger->accounts()->forCustody($userId, $kind);

        return Num::money(Account::find($accountId)->balance(null, $asOf));
    }
}
