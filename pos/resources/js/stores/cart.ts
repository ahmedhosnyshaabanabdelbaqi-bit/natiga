import { defineStore } from 'pinia';
import { http, toApiError, uuid, isNetworkError } from '@/lib/api';
import { saveDraft, loadDraft, clearDraft } from '@/lib/offlineDb';
import * as M from '@/lib/money';
import type { ApiError, CartLine, CartPayment, CatalogItem, PaymentMethod, ScanResult, TotalsDto } from '@/types';

const DRAFT_ID = 'active-cart';

/**
 * The cart.
 *
 * Totals are computed locally for instant feedback using the same rules and the
 * same decimal arithmetic as the server (see lib/money.ts), and the server's
 * figure is what gets persisted: `expected_grand_total` travels with the sale so
 * any disagreement is refused loudly instead of silently resolved.
 *
 * The cart is auto-saved to IndexedDB on every change, so closing the tab or
 * reloading mid-sale does not lose the basket.
 */
export const useCartStore = defineStore('cart', {
    state: () => ({
        lines: [] as CartLine[],
        payments: [] as CartPayment[],
        customerId: null as number | null,
        customerName: '' as string,
        isCredit: false,
        invoiceDiscountType: null as 'amount' | 'percent' | null,
        invoiceDiscountValue: '0',
        cashStep: '0',
        currencyScale: 2,
        heldCartId: null as number | null,
        approvalUuid: null as string | null,
        /** One idempotency key per LOGICAL sale; it survives retries and is
         *  regenerated only when a new basket starts. */
        idempotencyKey: uuid(),
        busy: false,
        error: null as ApiError | null,
        restored: false,
    }),

    getters: {
        isEmpty: (state) => state.lines.length === 0,
        itemCount: (state) => state.lines.length,

        totalQty: (state) => M.formatQty(M.sum(state.lines.map((l) => l.qty))),

        /** Local preview of the server's calculation, in the same order:
         *  line discount -> invoice discount (proportional) -> tax -> rounding. */
        totals(state): TotalsDto {
            const prepared = state.lines.map((line) => {
                const gross = M.round(M.multiply(line.qty, line.unit_price), state.currencyScale);
                const discount = !M.isZero(line.discount_percent)
                    ? M.round(M.percentOf(gross, line.discount_percent), state.currencyScale)
                    : M.round(line.discount_amount || '0', state.currencyScale);
                return { gross, discount, afterLine: M.subtract(gross, discount) };
            });

            const grossTotal = M.sum(prepared.map((p) => p.gross));
            const lineDiscountTotal = M.sum(prepared.map((p) => p.discount));
            const afterLineTotal = M.sum(prepared.map((p) => p.afterLine));

            let invoiceDiscount = '0';
            if (state.invoiceDiscountType && !M.isZero(state.invoiceDiscountValue || '0')) {
                invoiceDiscount =
                    state.invoiceDiscountType === 'percent'
                        ? M.round(M.percentOf(afterLineTotal, state.invoiceDiscountValue), state.currencyScale)
                        : M.round(state.invoiceDiscountValue, state.currencyScale);
                if (M.compare(invoiceDiscount, afterLineTotal) > 0) invoiceDiscount = afterLineTotal;
            }

            // Proportional shares, residual to the largest line, exactly as the
            // server does it — so the preview cannot drift by a piastre.
            const shares: string[] = new Array(prepared.length).fill('0');
            if (!M.isZero(invoiceDiscount) && !M.isZero(afterLineTotal)) {
                let assigned = '0';
                let heaviest = 0;
                prepared.forEach((p, i) => {
                    const share = M.round(
                        M.divide(M.multiply(invoiceDiscount, p.afterLine), afterLineTotal),
                        state.currencyScale,
                    );
                    shares[i] = share;
                    assigned = M.add(assigned, share);
                    if (M.compare(p.afterLine, prepared[heaviest].afterLine) > 0) heaviest = i;
                });
                const residual = M.subtract(invoiceDiscount, assigned);
                if (!M.isZero(residual)) shares[heaviest] = M.add(shares[heaviest], residual);
            }

            const lines = prepared.map((p, i) => {
                const net = M.round(M.subtract(p.afterLine, shares[i]), state.currencyScale);
                return {
                    index: String(i),
                    qty: state.lines[i].qty,
                    unit_price: state.lines[i].unit_price,
                    gross_amount: p.gross,
                    line_discount_amount: p.discount,
                    invoice_discount_share: shares[i],
                    net_amount: net,
                    tax_rate: '0',
                    tax_amount: '0',
                    total_amount: net,
                };
            });

            let grandTotal = M.round(M.sum(lines.map((l) => l.total_amount)), state.currencyScale);
            let rounding = '0';
            if (state.cashStep && !M.isZero(state.cashStep)) {
                const rounded = M.round(M.roundToStep(grandTotal, state.cashStep), state.currencyScale);
                rounding = M.subtract(rounded, grandTotal);
                grandTotal = rounded;
            }

            return {
                subtotal: M.round(grossTotal, state.currencyScale),
                line_discount_total: M.round(lineDiscountTotal, state.currencyScale),
                invoice_discount_total: M.round(invoiceDiscount, state.currencyScale),
                discount_total: M.round(M.add(lineDiscountTotal, invoiceDiscount), state.currencyScale),
                taxable_amount: M.round(M.sum(lines.map((l) => l.net_amount)), state.currencyScale),
                tax_total: '0.00',
                rounding_adjustment: M.round(rounding, state.currencyScale),
                grand_total: grandTotal,
                lines,
            };
        },

        paidTotal: (state) => M.round(M.sum(state.payments.map((p) => p.amount)), state.currencyScale),

        changeTotal: (state) =>
            M.round(
                M.sum(
                    state.payments.map((p) =>
                        M.compare(p.tendered_amount || '0', p.amount) > 0
                            ? M.subtract(p.tendered_amount, p.amount)
                            : '0',
                    ),
                ),
                state.currencyScale,
            ),

        remaining(): string {
            return M.round(M.subtract(this.totals.grand_total, this.paidTotal), this.currencyScale);
        },

        canComplete(): boolean {
            if (this.isEmpty) return false;
            const remaining = this.remaining;
            if (M.isNegative(remaining)) return false; // overpaid
            return M.isZero(remaining) || this.isCredit;
        },
    },

    actions: {
        configure(cashStep: string, scale: number) {
            this.cashStep = cashStep;
            this.currencyScale = scale;
        },

        /**
         * Add a scanned or picked item.
         *
         * Repeating a scan increments the existing line ONLY when the unit,
         * price and tracking attributes match. Serial- and batch-tracked lines
         * and weight/price-embedded scans are never merged, because merging
         * them would destroy the traceability the line carries.
         */
        addItem(item: CatalogItem | ScanResult, qty = '1') {
            const scanned = item as ScanResult;
            const quantity = M.normalizeQty(scanned.qty && !M.isZero(scanned.qty) ? scanned.qty : qty);
            const mergeable = scanned.mergeable !== false && item.tracking === 'none';

            if (mergeable) {
                const existing = this.lines.find(
                    (l) =>
                        l.variant_id === item.variant_id &&
                        l.product_unit_id === item.product_unit_id &&
                        l.unit_price === (item.unit_price ?? '0') &&
                        l.batch_id === null &&
                        l.serials.length === 0 &&
                        l.mergeable,
                );

                if (existing) {
                    existing.qty = M.normalizeQty(M.add(existing.qty, quantity));
                    void this.persist();
                    return existing;
                }
            }

            const line: CartLine = {
                key: uuid(),
                variant_id: item.variant_id,
                product_id: item.product_id,
                product_unit_id: item.product_unit_id,
                name: item.name,
                variant_name: item.variant_name ?? null,
                sku: item.sku,
                unit_name: item.unit_name,
                unit_factor: item.unit_factor,
                qty: quantity,
                unit_price: item.unit_price ?? '0',
                discount_amount: '0',
                discount_percent: '0',
                tracking: item.tracking,
                allow_fractional: item.allow_fractional,
                serials: [],
                batch_id: null,
                available: item.available,
                mergeable,
                price_overridden: false,
            };

            this.lines.push(line);
            void this.persist();
            return line;
        },

        setQty(key: string, qty: string) {
            const line = this.lines.find((l) => l.key === key);
            if (!line) return;
            if (M.isZero(qty) || M.isNegative(qty)) {
                this.removeLine(key);
                return;
            }
            line.qty = M.normalizeQty(qty);
            void this.persist();
        },

        increment(key: string, by = '1') {
            const line = this.lines.find((l) => l.key === key);
            if (line) this.setQty(key, M.normalizeQty(M.add(line.qty, by)));
        },

        removeLine(key: string) {
            this.lines = this.lines.filter((l) => l.key !== key);
            void this.persist();
        },

        setLinePrice(key: string, price: string) {
            const line = this.lines.find((l) => l.key === key);
            if (!line) return;
            line.unit_price = price;
            line.price_overridden = true;
            void this.persist();
        },

        setLineDiscount(key: string, amount: string, percent: string) {
            const line = this.lines.find((l) => l.key === key);
            if (!line) return;
            line.discount_amount = amount;
            line.discount_percent = percent;
            void this.persist();
        },

        setSerials(key: string, serials: string[]) {
            const line = this.lines.find((l) => l.key === key);
            if (line) {
                line.serials = serials;
                void this.persist();
            }
        },

        setInvoiceDiscount(type: 'amount' | 'percent' | null, value: string) {
            this.invoiceDiscountType = type;
            this.invoiceDiscountValue = value;
            void this.persist();
        },

        setCustomer(id: number | null, name = '') {
            this.customerId = id;
            this.customerName = name;
            if (id === null) this.isCredit = false;
            void this.persist();
        },

        // ---- payments ------------------------------------------------------

        addPayment(method: PaymentMethod, amount: string, tendered: string, reference: string | null = null) {
            this.payments.push({
                payment_method_id: method.id,
                method_code: method.code,
                amount,
                tendered_amount: tendered,
                reference,
            });
            void this.persist();
        },

        removePayment(index: number) {
            this.payments.splice(index, 1);
            void this.persist();
        },

        clearPayments() {
            this.payments = [];
            void this.persist();
        },

        // ---- persistence ---------------------------------------------------

        async persist() {
            await saveDraft({
                id: DRAFT_ID,
                lines: this.lines,
                payments: this.payments,
                customer_id: this.customerId,
                invoice_discount_type: this.invoiceDiscountType,
                invoice_discount_value: this.invoiceDiscountValue,
                updated_at: new Date().toISOString(),
            });
        },

        /** Restore a basket left behind by a reload or an accidental close. */
        async restore(): Promise<boolean> {
            const draft = await loadDraft(DRAFT_ID);
            if (!draft || draft.lines.length === 0) return false;
            this.lines = draft.lines;
            this.payments = draft.payments ?? [];
            this.customerId = draft.customer_id;
            this.invoiceDiscountType = draft.invoice_discount_type;
            this.invoiceDiscountValue = draft.invoice_discount_value ?? '0';
            this.restored = true;
            return true;
        },

        reset() {
            this.lines = [];
            this.payments = [];
            this.customerId = null;
            this.customerName = '';
            this.isCredit = false;
            this.invoiceDiscountType = null;
            this.invoiceDiscountValue = '0';
            this.heldCartId = null;
            this.approvalUuid = null;
            this.idempotencyKey = uuid(); // a NEW logical sale
            this.error = null;
            this.restored = false;
            void clearDraft(DRAFT_ID);
        },

        /** The exact body sent to POST /sales, reused for the offline queue. */
        salePayload() {
            return {
                lines: this.lines.map((l) => ({
                    variant_id: l.variant_id,
                    product_unit_id: l.product_unit_id,
                    qty: l.qty,
                    ...(l.price_overridden ? { unit_price: l.unit_price } : {}),
                    ...(M.isZero(l.discount_amount) ? {} : { discount_amount: l.discount_amount }),
                    ...(M.isZero(l.discount_percent) ? {} : { discount_percent: l.discount_percent }),
                    ...(l.serials.length ? { serials: l.serials } : {}),
                    ...(l.batch_id ? { batch_id: l.batch_id } : {}),
                })),
                payments: this.payments.map((p) => ({
                    payment_method_id: p.payment_method_id,
                    amount: p.amount,
                    tendered_amount: p.tendered_amount,
                    ...(p.reference ? { reference: p.reference } : {}),
                })),
                customer_id: this.customerId,
                is_credit: this.isCredit,
                invoice_discount_type: this.invoiceDiscountType,
                invoice_discount_value: this.invoiceDiscountValue,
                held_cart_id: this.heldCartId,
                approval_uuid: this.approvalUuid,
                // The server recomputes and REJECTS a mismatch rather than
                // trusting this figure.
                expected_grand_total: this.totals.grand_total,
            };
        },

        /** Ask the server to price the basket (authoritative preview). */
        async verifyWithServer(): Promise<TotalsDto | null> {
            try {
                const { data } = await http.post('/sales/quote', {
                    lines: this.lines.map((l) => ({
                        qty: l.qty,
                        unit_price: l.unit_price,
                        discount_amount: l.discount_amount,
                        discount_percent: l.discount_percent,
                    })),
                    invoice_discount_type: this.invoiceDiscountType,
                    invoice_discount_value: this.invoiceDiscountValue,
                });
                return data as TotalsDto;
            } catch (error) {
                if (!isNetworkError(error)) this.error = toApiError(error);
                return null;
            }
        },
    },
});
