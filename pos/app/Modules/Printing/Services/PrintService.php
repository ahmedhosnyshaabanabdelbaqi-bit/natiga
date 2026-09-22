<?php

declare(strict_types=1);

namespace App\Modules\Printing\Services;

use App\Modules\Access\Services\AuditService;
use App\Modules\Core\Models\PrintTemplate;
use App\Modules\Core\Models\Store;
use App\Modules\Core\Services\PosContext;
use App\Modules\Core\Services\SettingsService;
use App\Modules\Sales\Models\Sale;
use App\Modules\Sync\Models\PrintJob;
use App\Support\Money;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * Printing is a QUEUE, not part of the sale.
 *
 * A committed sale creates a print job. If the printer is offline the job fails
 * and can be retried on its own — the sale is untouched and is never repeated.
 * Reprints are recorded (who, when) and marked as a copy.
 */
class PrintService
{
    public function __construct(
        private readonly SettingsService $settings,
        private readonly AuditService $audit,
        private readonly PosContext $context,
    ) {}

    public function queueReceipt(Sale $sale, ?string $paper = null, bool $isReprint = false): PrintJob
    {
        $paper ??= (string) $this->settings->get('printing.default_receipt', config('pos.printing.default_receipt', '80mm'));
        $template = $this->templateFor('receipt', $paper);

        $job = PrintJob::query()->create([
            'uuid' => (string) Str::uuid7(),
            'type' => 'receipt',
            'print_template_id' => $template?->id,
            'terminal_id' => $sale->terminal_id,
            'source_type' => Sale::class,
            'source_id' => $sale->id,
            'payload' => $this->receiptPayload($sale, $isReprint),
            'status' => 'pending',
            'is_reprint' => $isReprint,
            'requested_by' => $this->context->userId(),
        ]);

        if ($isReprint) {
            $sale->increment('print_count');
            $this->audit->log('sale.reprinted', $sale, null, [
                'print_job' => $job->uuid,
                'copy_number' => $sale->print_count + 1,
            ]);
        }

        return $job;
    }

    /** @return array<string,mixed> Renderable, template-agnostic receipt data. */
    public function receiptPayload(Sale $sale, bool $isReprint = false): array
    {
        $sale->loadMissing(['lines', 'payments', 'customer', 'cashier', 'branch', 'terminal']);
        $store = Store::query()->first();

        return [
            'store' => [
                'name' => $store?->name,
                'phone' => $store?->phone,
                'address' => $store?->address,
                'tax_number' => $store?->tax_number,
                'logo_path' => $store?->logo_path,
            ],
            'branch' => $sale->branch?->name,
            'terminal' => $sale->terminal?->name,
            'cashier' => $sale->cashier?->name,
            'customer' => $sale->customer?->name,
            'number' => $sale->number,
            'sold_at' => $sale->sold_at?->toIso8601String(),
            'currency' => $store?->currency ?? config('pos.currency.code'),
            'lines' => $sale->lines->map(fn ($l) => [
                'name' => trim($l->product_name.' '.($l->variant_name ?? '')),
                'qty' => $l->qty,
                'unit' => $l->unit_name,
                'unit_price' => $l->unit_price,
                'discount' => Money::of($l->line_discount_amount)->plus(Money::of($l->invoice_discount_share))->toString(),
                'tax' => $l->tax_amount,
                'total' => $l->total_amount,
            ])->all(),
            'subtotal' => $sale->subtotal,
            'discount_total' => $sale->discount_total,
            'tax_total' => $sale->tax_total,
            'rounding' => $sale->rounding_adjustment,
            'grand_total' => $sale->grand_total,
            'paid_total' => $sale->paid_total,
            'change_total' => $sale->change_total,
            'due_total' => $sale->due_total,
            'payments' => $sale->payments->map(fn ($p) => [
                'method' => $p->method_code,
                'amount' => $p->amount,
                'tendered' => $p->tendered_amount,
                'change' => $p->change_amount,
            ])->all(),
            'return_policy' => (string) $this->settings->get('printing.return_policy', ''),
            'footer' => (string) $this->settings->get('printing.footer', ''),
            // Honesty flags printed on the slip itself.
            'is_reprint' => $isReprint,
            'copy_label' => $isReprint && config('pos.printing.reprint_marks_copy', true) ? 'نسخة' : null,
            'provisional' => $sale->isProvisional(),
            'provisional_label' => $sale->isProvisional()
                ? 'مستند غير متزامن — في انتظار اعتماد الخادم'
                : null,
        ];
    }

    public function queue(string $type, Model $source, array $payload, ?string $paper = null): PrintJob
    {
        return PrintJob::query()->create([
            'uuid' => (string) Str::uuid7(),
            'type' => $type,
            'print_template_id' => $this->templateFor($type, $paper)?->id,
            'terminal_id' => $this->context->terminalId(),
            'source_type' => $source::class,
            'source_id' => $source->getKey(),
            'payload' => $payload,
            'status' => 'pending',
            'requested_by' => $this->context->userId(),
        ]);
    }

    public function markPrinted(PrintJob $job): void
    {
        $job->forceFill(['status' => 'printed', 'printed_at' => now()])->save();
    }

    /** A dead printer is a print problem, never a sales problem. */
    public function markFailed(PrintJob $job, string $error): void
    {
        $job->forceFill([
            'status' => 'failed',
            'attempts' => (int) $job->attempts + 1,
            'last_error' => substr($error, 0, 2000),
        ])->save();
    }

    public function retry(PrintJob $job): PrintJob
    {
        $job->forceFill(['status' => 'pending'])->save();

        return $job;
    }

    /** @return Collection<int,PrintJob> */
    public function pendingFor(?int $terminalId = null, int $limit = 20)
    {
        return PrintJob::query()
            ->whereIn('status', ['pending'])
            ->when($terminalId, fn ($q) => $q->where('terminal_id', $terminalId))
            ->orderBy('id')
            ->limit($limit)
            ->get();
    }

    /** @return Collection<int,PrintJob> */
    public function failedFor(?int $terminalId = null, int $limit = 50)
    {
        return PrintJob::query()
            ->where('status', 'failed')
            ->when($terminalId, fn ($q) => $q->where('terminal_id', $terminalId))
            ->orderByDesc('id')
            ->limit($limit)
            ->get();
    }

    private function templateFor(string $type, ?string $paper): ?PrintTemplate
    {
        return PrintTemplate::query()
            ->where('type', $type)
            ->when($paper, fn ($q) => $q->where('paper', $paper))
            ->orderByDesc('is_default')
            ->first();
    }
}
