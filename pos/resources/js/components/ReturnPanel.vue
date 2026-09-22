<script setup lang="ts">
import { ref } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import PanelShell from '@/components/PanelShell.vue';
import { http, toApiError, uuid } from '@/lib/api';
import * as M from '@/lib/money';
import type { ApiError } from '@/types';

/**
 * Returns, always against the original invoice.
 *
 * The server states how much of each line is still returnable and what each
 * unit ACTUALLY cost the customer after discounts; this panel never re-prices
 * from today's list.
 */
const emit = defineEmits<{ close: [] }>();

interface ReturnableLine {
    sale_line_id: number;
    product_name: string;
    unit_name: string;
    qty_sold: string;
    qty_returned_base: string;
    qty_returnable_base: string;
    unit_price: string;
    effective_unit_total: string;
    serials: string[];
}

const query = ref('');
const sale = ref<{ id: number; number: string; is_credit: boolean } | null>(null);
const lines = ref<ReturnableLine[]>([]);
const outstanding = ref('0');
const selection = ref<Record<number, { qty: string; disposition: string; serials: string[] }>>({});
const reason = ref('');
const error = ref<ApiError | null>(null);
const loading = ref(false);
const done = ref<{ number: string; refund_cash: string; credit_applied: string } | null>(null);

async function findSale() {
    if (!query.value.trim()) return;
    loading.value = true;
    error.value = null;
    sale.value = null;

    try {
        const { data } = await http.get('/sales', { params: { number: query.value.trim(), per_page: 1 } });
        const found = data.data?.[0];
        if (!found) {
            error.value = { message: 'لم يتم العثور على فاتورة بهذا الرقم.' };
            return;
        }
        const detail = await http.get(`/sales/${found.id}/returnable`);
        sale.value = detail.data.sale;
        lines.value = detail.data.lines;
        outstanding.value = detail.data.outstanding;
        selection.value = {};
    } catch (e) {
        error.value = toApiError(e);
    } finally {
        loading.value = false;
    }
}

function toggle(line: ReturnableLine) {
    if (selection.value[line.sale_line_id]) {
        delete selection.value[line.sale_line_id];
    } else {
        selection.value[line.sale_line_id] = {
            qty: line.qty_returnable_base,
            disposition: 'resalable',
            serials: [],
        };
    }
}

const refundEstimate = () =>
    M.sum(
        Object.entries(selection.value).map(([id, pick]) => {
            const line = lines.value.find((l) => l.sale_line_id === Number(id));
            return line ? M.multiply(pick.qty, line.effective_unit_total) : '0';
        }),
    );

async function submit() {
    if (!sale.value || Object.keys(selection.value).length === 0) return;
    loading.value = true;
    error.value = null;

    try {
        const { data } = await http.post(
            '/returns',
            {
                sale_id: sale.value.id,
                reason: reason.value || undefined,
                lines: Object.entries(selection.value).map(([id, pick]) => ({
                    sale_line_id: Number(id),
                    qty: pick.qty,
                    disposition: pick.disposition,
                    ...(pick.serials.length ? { serials: pick.serials } : {}),
                })),
            },
            { headers: { 'Idempotency-Key': uuid() } },
        );

        done.value = {
            number: data.number,
            refund_cash: data.refund_cash,
            credit_applied: data.credit_applied,
        };
    } catch (e) {
        error.value = toApiError(e);
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <PanelShell title="مرتجع مبيعات" icon="undo" width="lg" @close="emit('close')">
        <!-- ─── تأكيد بعد التنفيذ ─── -->
        <div v-if="done" class="flex flex-col items-center gap-3 p-10 text-center">
            <span class="grid size-16 place-items-center rounded-full bg-cash-soft text-cash">
                <AppIcon name="check" :size="30" />
            </span>
            <p class="text-lg font-black text-cash">تم تسجيل المرتجع {{ done.number }}</p>

            <div class="mt-1 w-full max-w-sm space-y-1.5">
                <p
                    v-if="!M.isZero(done.credit_applied)"
                    class="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2 text-sm"
                >
                    <span>تخفيض مديونية العميل</span>
                    <b class="num">{{ M.formatMoney(done.credit_applied) }}</b>
                </p>
                <p
                    v-if="!M.isZero(done.refund_cash)"
                    class="flex items-center justify-between rounded-md bg-warn-soft px-3 py-2.5"
                >
                    <span class="font-bold text-warn-strong">المبلغ المرتجع نقدًا</span>
                    <b class="num text-xl font-black text-warn-strong">{{ M.formatMoney(done.refund_cash) }}</b>
                </p>
            </div>

            <button class="mt-3 rounded-lg bg-brand px-8 py-2.5 font-bold text-white" @click="emit('close')">تم</button>
        </div>

        <template v-else>
            <div class="flex shrink-0 gap-2 border-b border-line p-4">
                <div class="relative flex-1">
                    <AppIcon
                        name="receipt"
                        :size="17"
                        class="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-subtle"
                    />
                    <input
                        v-model="query"
                        data-keep-focus="true"
                        placeholder="رقم الفاتورة أو امسح الباركود الموجود عليها"
                        class="field pe-10"
                        @keydown.enter.prevent="findSale"
                    />
                </div>
                <button
                    class="t-pop flex items-center gap-1.5 rounded-md bg-brand px-5 py-2.5 font-bold text-white t-fast hover:bg-brand-strong"
                    @click="findSale"
                >
                    <AppIcon name="search" :size="16" />
                    بحث
                </button>
            </div>

            <div class="scroll-slim min-h-0 flex-1 overflow-y-auto p-4">
                <p v-if="loading" class="py-10 text-center text-sm text-ink-subtle">جارٍ التحميل…</p>

                <template v-else-if="sale">
                    <div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
                        <span class="font-bold">فاتورة</span>
                        <span class="num rounded-md bg-surface-2 px-2 py-1 font-extrabold">{{ sale.number }}</span>
                        <span
                            v-if="sale.is_credit"
                            class="num rounded-md bg-warn-soft px-2 py-1 text-xs font-bold text-warn-strong"
                        >
                            آجلة — المتبقي على العميل {{ M.formatMoney(outstanding) }}
                        </span>
                    </div>

                    <ul class="divide-y divide-line overflow-hidden rounded-lg border border-line">
                        <li v-for="line in lines" :key="line.sale_line_id" class="bg-surface-1 p-3">
                            <label class="flex items-start gap-3">
                                <input
                                    type="checkbox"
                                    class="mt-1 size-4 accent-[var(--color-brand)]"
                                    :checked="!!selection[line.sale_line_id]"
                                    :disabled="M.compare(line.qty_returnable_base, '0') <= 0"
                                    @change="toggle(line)"
                                />
                                <span class="min-w-0 flex-1">
                                    <span class="block text-sm font-bold">{{ line.product_name }}</span>
                                    <span class="mt-0.5 block text-[11px] text-ink-subtle">
                                        بيعت <b class="num">{{ M.formatQty(line.qty_sold) }}</b> {{ line.unit_name }} ·
                                        سبق إرجاع <b class="num">{{ M.formatQty(line.qty_returned_base) }}</b> ·
                                        متاح للإرجاع
                                        <b class="num text-ink">{{ M.formatQty(line.qty_returnable_base) }}</b>
                                    </span>
                                    <!-- القيمة الفعلية بعد الخصم، لا سعر اليوم -->
                                    <span class="num mt-0.5 block text-[11px] text-ink-muted">
                                        القيمة الفعلية للوحدة بعد الخصم:
                                        {{ M.formatMoney(line.effective_unit_total) }}
                                    </span>
                                </span>
                            </label>

                            <div v-if="selection[line.sale_line_id]" class="me-7 mt-2.5 flex flex-wrap items-center gap-2">
                                <input
                                    v-model="selection[line.sale_line_id].qty"
                                    data-keep-focus="true"
                                    aria-label="الكمية المرتجعة"
                                    class="num w-24 rounded-md border border-line-strong bg-surface-1 px-2 py-1.5 text-sm"
                                />
                                <select
                                    v-model="selection[line.sale_line_id].disposition"
                                    aria-label="مصير الصنف"
                                    class="rounded-md border border-line-strong bg-surface-1 px-2 py-1.5 text-sm"
                                >
                                    <option value="resalable">صالح للبيع</option>
                                    <option value="damaged">تالف</option>
                                    <option value="inspection">يحتاج فحص</option>
                                    <option value="returns_warehouse">إلى مخزن المرتجعات</option>
                                </select>
                                <span class="num text-sm font-extrabold">
                                    = {{ M.formatMoney(M.multiply(selection[line.sale_line_id].qty, line.effective_unit_total)) }}
                                </span>
                            </div>
                        </li>
                    </ul>

                    <input v-model="reason" data-keep-focus="true" placeholder="سبب المرتجع" class="field mt-3 text-sm" />
                </template>

                <div v-else class="flex flex-col items-center gap-3 py-12 text-center">
                    <span class="grid size-14 place-items-center rounded-full bg-surface-2 text-ink-subtle">
                        <AppIcon name="receipt" :size="26" />
                    </span>
                    <p class="text-sm text-ink-subtle">ابحث عن الفاتورة الأصلية للبدء</p>
                </div>
            </div>

            <p
                v-if="error"
                class="flex shrink-0 items-center gap-2 border-t border-danger/25 bg-danger-soft px-4 py-2.5 text-sm font-bold text-danger"
                role="alert"
            >
                <AppIcon name="alert" :size="16" />
                {{ error.message }}
            </p>

            <footer v-if="sale" class="safe-b flex shrink-0 items-center gap-3 border-t border-line bg-surface-2 p-3">
                <span class="text-sm font-bold text-ink-muted">قيمة المرتجع</span>
                <span class="num text-xl font-black">{{ M.formatMoney(refundEstimate()) }}</span>
                <button
                    class="t-pop mr-auto flex items-center gap-2 rounded-lg bg-danger px-6 py-3 font-black text-white t-fast hover:bg-danger-strong disabled:opacity-40"
                    :disabled="loading || Object.keys(selection).length === 0"
                    @click="submit"
                >
                    <AppIcon name="undo" :size="18" />
                    تنفيذ المرتجع
                </button>
            </footer>
        </template>
    </PanelShell>
</template>
